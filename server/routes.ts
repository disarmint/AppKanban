import type { Express } from "express";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { storage, sqlite, hashPassword, verifyPassword, toPublicUser } from "./storage";
import os from "node:os";
import { seedDatabase, migrateLegacyPasswords, backfillDeadlineDates } from "./seed";
import { createToken, destroyToken, requireAuth, requireAdmin, type SessionInfo } from "./auth";
import { startCronJobs } from "./cron";
import {
  insertTaskSchema,
  updateTaskSchema,
  insertCommentSchema,
  insertChecklistItemSchema,
  updateChecklistItemSchema,
  insertLabelSchema,
  updateLabelSchema,
  updateConfigSchema,
  ROLES,
} from "@shared/schema";
import { parseIsoDate, formatRuDate, toIsoDate } from "@shared/ru-date";
import { z } from "zod";
import ExcelJS from "exceljs";
import multer from "multer";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";

// Uploaded files live on disk in ./uploads (relative to cwd, alongside
// data.db). The directory is created at import time so the first upload can't
// race a missing folder.
const UPLOAD_DIR = path.join(process.cwd(), "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_ATTACHMENTS_PER_TASK = 20;

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).slice(0, 20);
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

// Completed tasks whose completedAt falls in [from, to] (inclusive day
// bounds). `to` is pushed to end-of-day so a same-day range still matches.
async function completedInRange(fromIso?: string, toIso?: string) {
  const from = fromIso ? parseIsoDate(fromIso)?.getTime() : undefined;
  const toDate = toIso ? parseIsoDate(toIso) : undefined;
  const to = toDate ? toDate.getTime() + 24 * 60 * 60 * 1000 - 1 : undefined;
  const tasks = await storage.getTasks();
  return tasks
    .filter((t) => t.status === "Завершено" && t.completedAt !== null)
    .filter((t) => (from === undefined || t.completedAt! >= from) && (to === undefined || t.completedAt! <= to))
    .sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0));
}

// Monday-anchored week that contains `ref` (default now). Returns local-midnight
// bounds and their ISO labels. If weekStartIso is supplied it is normalized to
// the Monday of that date's week.
function weekBounds(weekStartIso?: string): {
  start: Date;
  end: Date;
  weekStart: string;
  weekEnd: string;
} {
  const ref = (weekStartIso ? parseIsoDate(weekStartIso) : null) ?? new Date();
  const start = new Date(ref);
  start.setHours(0, 0, 0, 0);
  // getDay(): 0=Sun..6=Sat. Shift back to Monday.
  const dow = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - dow);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end, weekStart: toIsoDate(start), weekEnd: toIsoDate(end) };
}

const reportRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** Keep the human-facing `deadline` label in sync with the canonical
 * `deadlineDate` (ISO) whenever the picker supplies a date. */
function syncDeadline<T extends { deadlineDate?: string | null; deadline?: string }>(data: T): T {
  if (data.deadlineDate) {
    const d = parseIsoDate(data.deadlineDate);
    if (d) data.deadline = formatRuDate(d);
  }
  return data;
}

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  newPassword: z.string().min(4, "Пароль минимум 4 символа"),
});

const createUserSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(4, "Пароль минимум 4 символа"),
  role: z.enum(ROLES),
  departmentId: z.number().nullable(),
});

const updateUserSchema = z.object({
  password: z.string().min(4).optional(),
  role: z.enum(ROLES).optional(),
  departmentId: z.number().nullable().optional(),
});

const createDepartmentSchema = z.object({
  name: z.string().min(1, "Введите название отдела"),
  color: z.string().min(1),
  roadmapPeriod: z.string().min(1, "Укажите период"),
  roadmapStatus: z.string().min(1, "Укажите статус"),
});

const updateDepartmentSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().min(1).optional(),
  roadmapPeriod: z.string().min(1).optional(),
  roadmapStatus: z.string().min(1).optional(),
  orderIndex: z.number().optional(),
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await seedDatabase();
  migrateLegacyPasswords();
  backfillDeadlineDates();
  startCronJobs();

  app.post("/api/login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Введите логин и пароль" });
    }
    const { username, password } = parsed.data;
    const user = await storage.getUserByUsername(username);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ message: "Неверный логин или пароль" });
    }
    const token = createToken({
      userId: user.id,
      username: user.username,
      role: user.role,
      departmentId: user.departmentId,
    });
    res.json({ token, user: toPublicUser(user) });
  });

  app.post("/api/logout", requireAuth, (req, res) => {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (token) destroyToken(token);
    res.json({ ok: true });
  });

  app.get("/api/me", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session!.userId);
    if (!user) return res.status(404).json({ message: "Пользователь не найден" });
    res.json(toPublicUser(user));
  });

  app.post("/api/change-password", requireAuth, async (req, res) => {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Пароль минимум 4 символа" });
    }
    const user = await storage.updateUser(req.session!.userId, {
      passwordHash: hashPassword(parsed.data.newPassword),
      mustChangePassword: false,
    });
    if (!user) return res.status(404).json({ message: "Пользователь не найден" });
    res.json(toPublicUser(user));
  });

  // --- User management (admin only) ---
  app.get("/api/users", requireAuth, requireAdmin, async (_req, res) => {
    const users = await storage.getUsers();
    res.json(users.map(toPublicUser));
  });

  app.post("/api/users", requireAuth, requireAdmin, async (req, res) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Некорректные данные пользователя" });
    }
    const { username, password, role, departmentId } = parsed.data;
    if (role === "member" && !departmentId) {
      return res.status(400).json({ message: "Выберите отдел для сотрудника" });
    }
    const existing = await storage.getUserByUsername(username);
    if (existing) {
      return res.status(409).json({ message: "Такой логин уже занят" });
    }
    const user = await storage.createUser({
      username,
      passwordHash: hashPassword(password),
      role,
      departmentId: role === "admin" ? null : departmentId,
    });
    res.status(201).json(toPublicUser(user));
  });

  app.patch("/api/users/:id", requireAuth, requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: "Некорректный id" });
    }
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Некорректные данные пользователя" });
    }
    const { password, role, departmentId } = parsed.data;

    if (role === "member" && departmentId === undefined) {
      const existingUser = await storage.getUser(id);
      if (existingUser && !existingUser.departmentId && !departmentId) {
        return res.status(400).json({ message: "Выберите отдел для сотрудника" });
      }
    }

    const update: Record<string, unknown> = {};
    if (password) update.passwordHash = hashPassword(password);
    if (role !== undefined) update.role = role;
    if (departmentId !== undefined) update.departmentId = role === "admin" ? null : departmentId;

    const user = await storage.updateUser(id, update);
    if (!user) return res.status(404).json({ message: "Пользователь не найден" });
    res.json(toPublicUser(user));
  });

  app.delete("/api/users/:id", requireAuth, requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: "Некорректный id" });
    }
    if (id === req.session!.userId) {
      return res.status(400).json({ message: "Нельзя удалить свою собственную учётную запись" });
    }
    const users = await storage.getUsers();
    const target = users.find((u) => u.id === id);
    const adminCount = users.filter((u) => u.role === "admin").length;
    if (target?.role === "admin" && adminCount <= 1) {
      return res.status(400).json({ message: "Должен остаться хотя бы один администратор" });
    }
    const ok = await storage.deleteUser(id);
    if (!ok) return res.status(404).json({ message: "Пользователь не найден" });
    res.status(204).end();
  });

  // --- Departments (read for everyone, write admin-only) ---
  app.get("/api/departments", requireAuth, async (_req, res) => {
    const departments = await storage.getDepartments();
    res.json(departments);
  });

  app.post("/api/departments", requireAuth, requireAdmin, async (req, res) => {
    const parsed = createDepartmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Некорректные данные отдела" });
    }
    const existing = await storage.getDepartments();
    if (existing.some((d) => d.name.toLowerCase() === parsed.data.name.toLowerCase())) {
      return res.status(409).json({ message: "Отдел с таким названием уже существует" });
    }
    const orderIndex = existing.length > 0 ? Math.max(...existing.map((d) => d.orderIndex)) + 1 : 1;
    const department = await storage.createDepartment({ ...parsed.data, orderIndex });
    res.status(201).json(department);
  });

  app.patch("/api/departments/:id", requireAuth, requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: "Некорректный id" });
    }
    const parsed = updateDepartmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Некорректные данные отдела" });
    }
    if (parsed.data.name) {
      const existing = await storage.getDepartments();
      if (existing.some((d) => d.id !== id && d.name.toLowerCase() === parsed.data.name!.toLowerCase())) {
        return res.status(409).json({ message: "Отдел с таким названием уже существует" });
      }
    }
    const department = await storage.updateDepartment(id, parsed.data);
    if (!department) return res.status(404).json({ message: "Отдел не найден" });
    res.json(department);
  });

  app.delete("/api/departments/:id", requireAuth, requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: "Некорректный id" });
    }
    const taskCount = await storage.countTasksByDepartment(id);
    if (taskCount > 0) {
      return res.status(400).json({
        message: `Нельзя удалить отдел — в нём ${taskCount} ${taskCount === 1 ? "задача" : "задач"}. Сначала удалите или перенесите задачи`,
      });
    }
    const userCount = await storage.countUsersByDepartment(id);
    if (userCount > 0) {
      return res.status(400).json({
        message: `Нельзя удалить отдел — к нему привязано ${userCount} ${userCount === 1 ? "сотрудник" : "сотрудников"}. Сначала переназначьте их`,
      });
    }
    const ok = await storage.deleteDepartment(id);
    if (!ok) return res.status(404).json({ message: "Отдел не найден" });
    res.status(204).end();
  });

  // Users assignable to tasks: admins see everyone, members see only their
  // own department's users.
  app.get("/api/assignable-users", requireAuth, async (req, res) => {
    const users = await storage.getUsers();
    const scoped =
      req.session!.role === "admin"
        ? users
        : users.filter((u) => u.departmentId === req.session!.departmentId);
    res.json(scoped.map(toPublicUser));
  });

  // Returns an error string if the assignee is not allowed, else null.
  async function checkAssignee(
    assigneeId: number | null | undefined,
    session: SessionInfo
  ): Promise<string | null> {
    if (assigneeId === undefined || assigneeId === null) return null;
    const assignee = await storage.getUser(assigneeId);
    if (!assignee) return "Исполнитель не найден";
    if (session.role !== "admin" && assignee.departmentId !== session.departmentId) {
      return "Можно назначать только сотрудников своего отдела";
    }
    return null;
  }

  // --- Tasks (scoped by department for non-admins) ---
  // By default archived tasks are hidden; `?archived=1` returns only archived
  // tasks (the Archive view), `?archived=all` returns everything.
  app.get("/api/tasks", requireAuth, async (req, res) => {
    let tasks = await storage.getTasks();
    const mode = req.query.archived;
    if (mode === "1") tasks = tasks.filter((t) => t.archived);
    else if (mode !== "all") tasks = tasks.filter((t) => !t.archived);
    if (req.session!.role !== "admin") {
      tasks = tasks.filter((t) => t.departmentId === req.session!.departmentId);
    }
    res.json(tasks);
  });

  app.post("/api/tasks", requireAuth, async (req, res) => {
    const parsed = insertTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Некорректные данные задачи" });
    }
    if (req.session!.role !== "admin") {
      if (!req.session!.departmentId || parsed.data.departmentId !== req.session!.departmentId) {
        return res.status(403).json({ message: "Можно создавать задачи только в своём отделе" });
      }
    }
    // Block B: assignee + deadline are mandatory for tasks created via the UI.
    // Enforced primarily in the client form; this is a server-side backstop.
    if (parsed.data.assigneeId === null || parsed.data.assigneeId === undefined) {
      return res.status(400).json({ message: "Выберите ответственного" });
    }
    if (!parsed.data.deadlineDate) {
      return res.status(400).json({ message: "Укажите срок" });
    }
    const assigneeError = await checkAssignee(parsed.data.assigneeId, req.session!);
    if (assigneeError) return res.status(400).json({ message: assigneeError });
    const task = await storage.createTask(syncDeadline(parsed.data));
    if (task.assigneeId && task.assigneeId !== req.session!.userId) {
      await storage.createNotification({
        userId: task.assigneeId,
        type: "assignment",
        taskId: task.id,
        message: `Вас назначили ответственным за задачу «${task.title}»`,
      });
    }
    res.status(201).json(task);
  });

  app.patch("/api/tasks/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: "Некорректный id" });
    }
    const parsed = updateTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Некорректные данные задачи" });
    }
    if (req.session!.role !== "admin") {
      const existing = await storage.getTask(id);
      if (!existing || existing.departmentId !== req.session!.departmentId) {
        return res.status(403).json({ message: "Можно менять только задачи своего отдела" });
      }
      if (parsed.data.departmentId !== undefined && parsed.data.departmentId !== req.session!.departmentId) {
        return res.status(403).json({ message: "Нельзя переносить задачу в другой отдел" });
      }
    }
    const assigneeError = await checkAssignee(parsed.data.assigneeId, req.session!);
    if (assigneeError) return res.status(400).json({ message: assigneeError });
    const before = await storage.getTask(id);
    const task = await storage.updateTask(id, syncDeadline(parsed.data));
    if (!task) {
      return res.status(404).json({ message: "Задача не найдена" });
    }
    // Notify on a *new* assignee (changed to a non-empty value that isn't the
    // person making the change).
    if (
      task.assigneeId &&
      task.assigneeId !== before?.assigneeId &&
      task.assigneeId !== req.session!.userId
    ) {
      await storage.createNotification({
        userId: task.assigneeId,
        type: "assignment",
        taskId: task.id,
        message: `Вас назначили ответственным за задачу «${task.title}»`,
      });
    }
    res.json(task);
  });

  app.delete("/api/tasks/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: "Некорректный id" });
    }
    if (req.session!.role !== "admin") {
      const existing = await storage.getTask(id);
      if (!existing || existing.departmentId !== req.session!.departmentId) {
        return res.status(403).json({ message: "Можно удалять только задачи своего отдела" });
      }
    }
    const ok = await storage.deleteTask(id);
    if (!ok) {
      return res.status(404).json({ message: "Задача не найдена" });
    }
    res.status(204).end();
  });

  // Archive / restore a task (soft). Dept-scoped for members.
  app.patch("/api/tasks/:id/archive", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ message: "Некорректный id" });
    const archived = req.body?.archived !== false;
    const existing = await storage.getTask(id);
    if (!existing) return res.status(404).json({ message: "Задача не найдена" });
    if (req.session!.role !== "admin" && existing.departmentId !== req.session!.departmentId) {
      return res.status(403).json({ message: "Можно менять только задачи своего отдела" });
    }
    const task = await storage.setArchived(id, archived);
    res.json(task);
  });

  // --- App config (read for everyone, write admin-only) ---
  app.get("/api/config", requireAuth, async (_req, res) => {
    res.json(await storage.getConfig());
  });

  app.put("/api/config", requireAuth, requireAdmin, async (req, res) => {
    const parsed = updateConfigSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Некорректные настройки" });
    const config = await storage.setConfig(parsed.data);
    res.json(config);
  });

  // --- Weekly summary (admin only): team-wide view shown inside the app ---
  app.get("/api/weekly-summary", requireAuth, requireAdmin, async (req, res) => {
    const rawWeekStart = typeof req.query.weekStart === "string" ? req.query.weekStart : undefined;
    if (rawWeekStart !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(rawWeekStart)) {
      return res.status(400).json({ message: "Некорректная дата недели" });
    }
    const { start, end, weekStart, weekEnd } = weekBounds(rawWeekStart);
    const config = await storage.getConfig();
    const overloadThreshold = config.overloadThreshold;

    const tasks = await storage.getTasks();
    const departments = await storage.getDepartments();
    const users = await storage.getUsers();

    const startMs = start.getTime();
    const endMs = end.getTime();

    // Completed within the week, grouped by department.
    const completedByDeptMap = new Map<number, number>();
    let completedCount = 0;
    for (const t of tasks) {
      if (t.status !== "Завершено" || t.completedAt === null) continue;
      if (t.completedAt < startMs || t.completedAt > endMs) continue;
      completedCount++;
      completedByDeptMap.set(t.departmentId, (completedByDeptMap.get(t.departmentId) ?? 0) + 1);
    }
    const completedByDepartment = departments
      .filter((d) => completedByDeptMap.has(d.id))
      .map((d) => ({ departmentName: d.name, count: completedByDeptMap.get(d.id)! }));

    // All currently-overdue, non-archived, non-completed tasks (point-in-time).
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();
    const overdueList = tasks
      .filter((t) => {
        if (t.archived || t.status === "Завершено") return false;
        const d = parseIsoDate(t.deadlineDate);
        return d !== null && d.getTime() < todayMs;
      })
      .map((t) => {
        const d = parseIsoDate(t.deadlineDate)!;
        return {
          taskId: t.id,
          title: t.title,
          departmentName: t.department?.name ?? "",
          assigneeName: t.assignee?.username ?? null,
          deadlineDate: t.deadlineDate,
          daysOverdue: Math.round((todayMs - d.getTime()) / 86_400_000),
        };
      })
      .sort((a, b) => b.daysOverdue - a.daysOverdue);

    // Workload: users with assigned active (non-completed, non-archived) tasks.
    const activeByUser = new Map<number, number>();
    const overdueByUser = new Map<number, number>();
    for (const t of tasks) {
      if (t.archived || t.status === "Завершено" || t.assigneeId === null) continue;
      activeByUser.set(t.assigneeId, (activeByUser.get(t.assigneeId) ?? 0) + 1);
      const d = parseIsoDate(t.deadlineDate);
      if (d !== null && d.getTime() < todayMs) {
        overdueByUser.set(t.assigneeId, (overdueByUser.get(t.assigneeId) ?? 0) + 1);
      }
    }
    const userMap = new Map(users.map((u) => [u.id, u]));
    const workloadByAssignee = Array.from(activeByUser.entries())
      .map(([userId, activeTaskCount]) => ({
        userId,
        username: userMap.get(userId)?.username ?? `#${userId}`,
        activeTaskCount,
        overdueTaskCount: overdueByUser.get(userId) ?? 0,
      }))
      .sort((a, b) => b.activeTaskCount - a.activeTaskCount);

    res.json({
      weekStart,
      weekEnd,
      overloadThreshold,
      completedCount,
      completedByDepartment,
      overdueList,
      workloadByAssignee,
    });
  });

  // --- Backup (admin only): a consistent SQLite snapshot download ---
  // VACUUM INTO writes a single defragmented file that already folds in the WAL
  // and skips uncommitted pages, so the download is a clean point-in-time copy
  // even while the server keeps serving. The temp file is deleted afterwards.
  app.get("/api/backup", requireAuth, requireAdmin, (_req, res) => {
    const tmpPath = path.join(os.tmpdir(), `kanban-backup-${crypto.randomUUID()}.db`);
    try {
      sqlite.exec(`VACUUM INTO '${tmpPath.replace(/'/g, "''")}'`);
    } catch (err) {
      console.error("[backup] VACUUM INTO failed:", err);
      return res.status(500).json({ message: "Не удалось создать резервную копию" });
    }
    const today = new Date().toISOString().slice(0, 10);
    res.download(tmpPath, `kanban-backup-${today}.db`, (err) => {
      if (err) console.error("[backup] download failed:", err);
      fs.rm(tmpPath, () => {});
    });
  });

  // --- Notifications (scoped to the current user; no cross-user access) ---
  app.get("/api/notifications", requireAuth, async (req, res) => {
    res.json(await storage.getNotifications(req.session!.userId));
  });

  app.get("/api/notifications/unread-count", requireAuth, async (req, res) => {
    const list = await storage.getNotifications(req.session!.userId);
    res.json({ count: list.filter((n) => !n.read).length });
  });

  app.post("/api/notifications/:id/read", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ message: "Некорректный id" });
    const n = await storage.getNotification(id);
    if (!n || n.userId !== req.session!.userId) {
      return res.status(404).json({ message: "Уведомление не найдено" });
    }
    res.json(await storage.markNotificationRead(id));
  });

  app.post("/api/notifications/read-all", requireAuth, async (req, res) => {
    await storage.markAllNotificationsRead(req.session!.userId);
    res.status(204).end();
  });

  // --- Task attachments (files on disk in ./uploads, metadata in the DB) ---
  app.get("/api/tasks/:id/attachments", requireAuth, async (req, res) => {
    const taskId = Number(req.params.id);
    if (Number.isNaN(taskId)) return res.status(400).json({ message: "Некорректный id" });
    if (!(await canAccessTask(taskId, req.session!))) {
      return res.status(403).json({ message: "Нет доступа к задаче" });
    }
    res.json(await storage.getAttachments(taskId));
  });

  app.post(
    "/api/tasks/:id/attachments",
    requireAuth,
    (req, res, next) => {
      upload.single("file")(req, res, (err) => {
        if (err) {
          const msg =
            err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE"
              ? "Файл слишком большой (макс. 10 МБ)"
              : "Не удалось загрузить файл";
          return res.status(400).json({ message: msg });
        }
        next();
      });
    },
    async (req, res) => {
      const taskId = Number(req.params.id);
      const file = req.file;
      const cleanup = () => {
        if (file) fs.rm(path.join(UPLOAD_DIR, file.filename), () => {});
      };
      if (Number.isNaN(taskId)) {
        cleanup();
        return res.status(400).json({ message: "Некорректный id" });
      }
      if (!file) return res.status(400).json({ message: "Файл не выбран" });
      if (!(await canAccessTask(taskId, req.session!))) {
        cleanup();
        return res.status(403).json({ message: "Нет доступа к задаче" });
      }
      const existing = await storage.getAttachments(taskId);
      if (existing.length >= MAX_ATTACHMENTS_PER_TASK) {
        cleanup();
        return res
          .status(400)
          .json({ message: `Слишком много вложений (макс. ${MAX_ATTACHMENTS_PER_TASK})` });
      }
      const originalName = Buffer.from(file.originalname, "latin1").toString("utf8");
      const attachment = await storage.createAttachment({
        taskId,
        filename: file.filename,
        originalName,
        mimeType: file.mimetype,
        size: file.size,
        uploadedBy: req.session!.userId,
      });
      res.status(201).json(attachment);
    }
  );

  app.get("/api/attachments/:id/download", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ message: "Некорректный id" });
    const attachment = await storage.getAttachment(id);
    if (!attachment) return res.status(404).json({ message: "Вложение не найдено" });
    if (!(await canAccessTask(attachment.taskId, req.session!))) {
      return res.status(403).json({ message: "Нет доступа к вложению" });
    }
    const filePath = path.join(UPLOAD_DIR, attachment.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "Файл не найден на диске" });
    }
    res.download(filePath, attachment.originalName);
  });

  app.delete("/api/attachments/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ message: "Некорректный id" });
    const attachment = await storage.getAttachment(id);
    if (!attachment) return res.status(404).json({ message: "Вложение не найдено" });
    if (!(await canAccessTask(attachment.taskId, req.session!))) {
      return res.status(403).json({ message: "Нет доступа к вложению" });
    }
    // Only an admin or the original uploader may delete.
    if (req.session!.role !== "admin" && attachment.uploadedBy !== req.session!.userId) {
      return res.status(403).json({ message: "Можно удалять только свои вложения" });
    }
    await storage.deleteAttachment(id);
    fs.rm(path.join(UPLOAD_DIR, attachment.filename), () => {});
    res.status(204).end();
  });

  // --- Reports (admin only): completed tasks in a date range + Excel export ---
  app.get("/api/reports/completed", requireAuth, requireAdmin, async (req, res) => {
    const parsed = reportRangeSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ message: "Некорректный диапазон дат" });
    const rows = await completedInRange(parsed.data.from, parsed.data.to);
    res.json(
      rows.map((t) => ({
        id: t.id,
        title: t.title,
        goal: t.goal,
        department: t.department?.name ?? "",
        assignee: t.assignee?.username ?? null,
        completedAt: t.completedAt,
        deadline: t.deadline,
      }))
    );
  });

  app.get("/api/reports/completed.xlsx", requireAuth, requireAdmin, async (req, res) => {
    const parsed = reportRangeSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ message: "Некорректный диапазон дат" });
    const rows = await completedInRange(parsed.data.from, parsed.data.to);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Завершённые задачи");
    ws.columns = [
      { header: "Задача", key: "title", width: 40 },
      { header: "Цель", key: "goal", width: 40 },
      { header: "Отдел", key: "department", width: 22 },
      { header: "Ответственный", key: "assignee", width: 20 },
      { header: "Дата завершения", key: "completed", width: 18 },
      { header: "Дедлайн", key: "deadline", width: 18 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const t of rows) {
      ws.addRow({
        title: t.title,
        goal: t.goal,
        department: t.department?.name ?? "",
        assignee: t.assignee?.username ?? "—",
        completed: t.completedAt ? formatRuDate(new Date(t.completedAt)) : "—",
        deadline: t.deadline,
      });
    }

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", 'attachment; filename="completed-tasks.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  });

  // --- Comments ---
  // Members may only touch comments on tasks in their own department.
  async function canAccessTask(taskId: number, session: SessionInfo): Promise<boolean> {
    if (session.role === "admin") return true;
    const task = await storage.getTask(taskId);
    return !!task && task.departmentId === session.departmentId;
  }

  app.get("/api/tasks/:id/comments", requireAuth, async (req, res) => {
    const taskId = Number(req.params.id);
    if (Number.isNaN(taskId)) return res.status(400).json({ message: "Некорректный id" });
    if (!(await canAccessTask(taskId, req.session!))) {
      return res.status(403).json({ message: "Нет доступа к задаче" });
    }
    res.json(await storage.getComments(taskId));
  });

  app.post("/api/tasks/:id/comments", requireAuth, async (req, res) => {
    const taskId = Number(req.params.id);
    if (Number.isNaN(taskId)) return res.status(400).json({ message: "Некорректный id" });
    if (!(await canAccessTask(taskId, req.session!))) {
      return res.status(403).json({ message: "Нет доступа к задаче" });
    }
    const parsed = insertCommentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Введите комментарий" });
    const comment = await storage.createComment(taskId, req.session!.userId, parsed.data.body);
    // Notify the assignee (unless they wrote the comment themselves).
    const task = await storage.getTask(taskId);
    if (task?.assigneeId && task.assigneeId !== req.session!.userId) {
      await storage.createNotification({
        userId: task.assigneeId,
        type: "comment",
        taskId,
        message: `Новый комментарий к задаче «${task.title}»`,
      });
    }
    const [withAuthor] = (await storage.getComments(taskId)).filter((c) => c.id === comment.id);
    res.status(201).json(withAuthor ?? comment);
  });

  // Comments can be removed by their author or an admin (no editing others').
  app.delete("/api/comments/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ message: "Некорректный id" });
    const comment = await storage.getComment(id);
    if (!comment) return res.status(404).json({ message: "Комментарий не найден" });
    if (req.session!.role !== "admin" && comment.userId !== req.session!.userId) {
      return res.status(403).json({ message: "Можно удалять только свои комментарии" });
    }
    await storage.deleteComment(id);
    res.status(204).end();
  });

  // --- Checklist items ---
  app.get("/api/tasks/:id/checklist", requireAuth, async (req, res) => {
    const taskId = Number(req.params.id);
    if (Number.isNaN(taskId)) return res.status(400).json({ message: "Некорректный id" });
    if (!(await canAccessTask(taskId, req.session!))) {
      return res.status(403).json({ message: "Нет доступа к задаче" });
    }
    res.json(await storage.getChecklist(taskId));
  });

  app.post("/api/tasks/:id/checklist", requireAuth, async (req, res) => {
    const taskId = Number(req.params.id);
    if (Number.isNaN(taskId)) return res.status(400).json({ message: "Некорректный id" });
    if (!(await canAccessTask(taskId, req.session!))) {
      return res.status(403).json({ message: "Нет доступа к задаче" });
    }
    const parsed = insertChecklistItemSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Введите пункт" });
    const item = await storage.createChecklistItem(taskId, parsed.data.text);
    res.status(201).json(item);
  });

  app.patch("/api/checklist/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ message: "Некорректный id" });
    const item = await storage.getChecklistItem(id);
    if (!item) return res.status(404).json({ message: "Пункт не найден" });
    if (!(await canAccessTask(item.taskId, req.session!))) {
      return res.status(403).json({ message: "Нет доступа к задаче" });
    }
    const parsed = updateChecklistItemSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Некорректные данные" });
    const updated = await storage.updateChecklistItem(id, parsed.data);
    res.json(updated);
  });

  app.delete("/api/checklist/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ message: "Некорректный id" });
    const item = await storage.getChecklistItem(id);
    if (!item) return res.status(404).json({ message: "Пункт не найден" });
    if (!(await canAccessTask(item.taskId, req.session!))) {
      return res.status(403).json({ message: "Нет доступа к задаче" });
    }
    await storage.deleteChecklistItem(id);
    res.status(204).end();
  });

  // --- Labels (read for everyone, CRUD admin-only) ---
  app.get("/api/labels", requireAuth, async (_req, res) => {
    res.json(await storage.getLabels());
  });

  app.post("/api/labels", requireAuth, requireAdmin, async (req, res) => {
    const parsed = insertLabelSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Некорректные данные метки" });
    const existing = await storage.getLabels();
    if (existing.some((l) => l.name.toLowerCase() === parsed.data.name.toLowerCase())) {
      return res.status(409).json({ message: "Метка с таким названием уже существует" });
    }
    res.status(201).json(await storage.createLabel(parsed.data.name, parsed.data.color));
  });

  app.patch("/api/labels/:id", requireAuth, requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ message: "Некорректный id" });
    const parsed = updateLabelSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Некорректные данные метки" });
    const label = await storage.updateLabel(id, parsed.data);
    if (!label) return res.status(404).json({ message: "Метка не найдена" });
    res.json(label);
  });

  app.delete("/api/labels/:id", requireAuth, requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ message: "Некорректный id" });
    const ok = await storage.deleteLabel(id);
    if (!ok) return res.status(404).json({ message: "Метка не найдена" });
    res.status(204).end();
  });

  // Assign / unassign a label to a task (dept-scoped for members).
  app.post("/api/tasks/:id/labels", requireAuth, async (req, res) => {
    const taskId = Number(req.params.id);
    const labelId = Number(req.body?.labelId);
    if (Number.isNaN(taskId) || Number.isNaN(labelId)) {
      return res.status(400).json({ message: "Некорректный id" });
    }
    if (!(await canAccessTask(taskId, req.session!))) {
      return res.status(403).json({ message: "Нет доступа к задаче" });
    }
    if (!(await storage.getLabel(labelId))) {
      return res.status(404).json({ message: "Метка не найдена" });
    }
    await storage.addTaskLabel(taskId, labelId);
    res.status(204).end();
  });

  app.delete("/api/tasks/:id/labels/:labelId", requireAuth, async (req, res) => {
    const taskId = Number(req.params.id);
    const labelId = Number(req.params.labelId);
    if (Number.isNaN(taskId) || Number.isNaN(labelId)) {
      return res.status(400).json({ message: "Некорректный id" });
    }
    if (!(await canAccessTask(taskId, req.session!))) {
      return res.status(403).json({ message: "Нет доступа к задаче" });
    }
    await storage.removeTaskLabel(taskId, labelId);
    res.status(204).end();
  });

  return httpServer;
}
