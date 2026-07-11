import type { Express } from "express";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { storage, hashPassword, verifyPassword, toPublicUser } from "./storage";
import { seedDatabase, migrateLegacyPasswords, backfillDeadlineDates } from "./seed";
import { createToken, destroyToken, requireAuth, requireAdmin, type SessionInfo } from "./auth";
import { insertTaskSchema, updateTaskSchema, ROLES } from "@shared/schema";
import { parseIsoDate, formatRuDate } from "@shared/ru-date";
import { z } from "zod";

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
  app.get("/api/tasks", requireAuth, async (req, res) => {
    const tasks = await storage.getTasks();
    if (req.session!.role === "admin") {
      return res.json(tasks);
    }
    const scoped = tasks.filter((t) => t.departmentId === req.session!.departmentId);
    res.json(scoped);
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
    const assigneeError = await checkAssignee(parsed.data.assigneeId, req.session!);
    if (assigneeError) return res.status(400).json({ message: assigneeError });
    const task = await storage.createTask(syncDeadline(parsed.data));
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
    const task = await storage.updateTask(id, syncDeadline(parsed.data));
    if (!task) {
      return res.status(404).json({ message: "Задача не найдена" });
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

  return httpServer;
}
