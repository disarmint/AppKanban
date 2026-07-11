import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const ROLES = ["admin", "member"] as const;
export type Role = (typeof ROLES)[number];

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("member"),
  departmentId: integer("department_id"),
  mustChangePassword: integer("must_change_password", { mode: "boolean" })
    .notNull()
    .default(false),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  passwordHash: true,
  role: true,
  departmentId: true,
  mustChangePassword: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type UserPublic = Omit<User, "passwordHash">;

export const departments = sqliteTable("departments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  color: text("color").notNull(),
  orderIndex: integer("order_index").notNull(),
  roadmapPeriod: text("roadmap_period").notNull(),
  roadmapStatus: text("roadmap_status").notNull(),
});

export const insertDepartmentSchema = createInsertSchema(departments).omit({
  id: true,
});

export const updateDepartmentSchema = insertDepartmentSchema.partial();

export type InsertDepartment = z.infer<typeof insertDepartmentSchema>;
export type UpdateDepartment = z.infer<typeof updateDepartmentSchema>;
export type Department = typeof departments.$inferSelect;

export const STATUSES = ["Запланировано", "В процессе", "Завершено"] as const;
export type TaskStatus = (typeof STATUSES)[number];

export const PRIORITIES = ["Низкий", "Средний", "Высокий", "Критический"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  departmentId: integer("department_id")
    .notNull()
    .references(() => departments.id),
  goal: text("goal").notNull(),
  title: text("title").notNull(),
  week: text("week").notNull(),
  deadline: text("deadline").notNull(),
  // Canonical machine-readable deadline, ISO "YYYY-MM-DD". Nullable because a
  // legacy free-text `deadline` may not be parseable. `deadline` is kept as the
  // human-facing label; `deadlineDate` drives sorting and urgency colors.
  deadlineDate: text("deadline_date"),
  assigneeId: integer("assignee_id").references(() => users.id),
  status: text("status").notNull().default("Запланировано"),
  // Task priority. NOT NULL with a "Средний" default so every row always has a
  // value (existing rows backfilled by migration).
  priority: text("priority").notNull().default("Средний"),
  // Epoch ms when the task most recently entered the final ("Завершено")
  // column. Drives autoarchival. Null while the task is not completed.
  completedAt: integer("completed_at"),
  // Epoch ms when the task's status last changed (also set on creation). Drives
  // the "stale" indicator for tasks that have sat in a non-final column too
  // long. Not null once migrated (see 0009 migration for the backfill note).
  statusChangedAt: integer("status_changed_at"),
  // Soft archive flag: archived tasks are hidden from the main board but kept
  // in the database and shown in the dedicated Archive view.
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
});

export const insertTaskSchema = createInsertSchema(tasks)
  .omit({ id: true, completedAt: true, archived: true, statusChangedAt: true })
  .extend({
    status: z.enum(STATUSES).default("Запланировано"),
    priority: z.enum(PRIORITIES).default("Средний"),
    deadlineDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Неверная дата").nullable().optional(),
    assigneeId: z.number().nullable().optional(),
  });

export const updateTaskSchema = insertTaskSchema.partial();

export type InsertTask = z.infer<typeof insertTaskSchema>;
export type UpdateTask = z.infer<typeof updateTaskSchema>;
export type Task = typeof tasks.$inferSelect;

export type TaskWithDepartment = Task & {
  department: Department;
  assignee: UserPublic | null;
  commentCount: number;
  checklistTotal: number;
  checklistDone: number;
  attachmentCount: number;
  labels: Label[];
};

export const taskComments = sqliteTable("task_comments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("task_id")
    .notNull()
    .references(() => tasks.id),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  body: text("body").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const insertCommentSchema = z.object({
  body: z.string().min(1, "Введите комментарий").max(2000),
});

export type TaskComment = typeof taskComments.$inferSelect;
export type CommentWithAuthor = TaskComment & { author: UserPublic | null };

export const checklistItems = sqliteTable("checklist_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("task_id")
    .notNull()
    .references(() => tasks.id),
  text: text("text").notNull(),
  done: integer("done", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
});

export const insertChecklistItemSchema = z.object({
  text: z.string().min(1, "Введите пункт").max(500),
});

export const updateChecklistItemSchema = z
  .object({
    text: z.string().min(1).max(500).optional(),
    done: z.boolean().optional(),
  })
  .refine((d) => d.text !== undefined || d.done !== undefined, {
    message: "Нечего обновлять",
  });

export type ChecklistItem = typeof checklistItems.$inferSelect;

export const labels = sqliteTable("labels", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  color: text("color").notNull(),
});

export const taskLabels = sqliteTable(
  "task_labels",
  {
    taskId: integer("task_id")
      .notNull()
      .references(() => tasks.id),
    labelId: integer("label_id")
      .notNull()
      .references(() => labels.id),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.taskId, t.labelId] }),
  })
);

export const insertLabelSchema = z.object({
  name: z.string().min(1, "Введите название").max(50),
  color: z.string().min(1),
});

export const updateLabelSchema = insertLabelSchema.partial().refine(
  (d) => d.name !== undefined || d.color !== undefined,
  { message: "Нечего обновлять" }
);

export type Label = typeof labels.$inferSelect;

// Files uploaded against a task. The binary lives on disk in uploads/; this
// row holds the metadata. `filename` is the unique on-disk name.
export const taskAttachments = sqliteTable("task_attachments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("task_id")
    .notNull()
    .references(() => tasks.id),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  uploadedBy: integer("uploaded_by")
    .notNull()
    .references(() => users.id),
  createdAt: integer("created_at").notNull(),
});

export type TaskAttachment = typeof taskAttachments.$inferSelect;

// In-app notifications (no email/push). One row per event addressed to a user.
export const NOTIFICATION_TYPES = ["comment", "assignment", "deadline"] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  type: text("type").notNull(),
  taskId: integer("task_id")
    .notNull()
    .references(() => tasks.id),
  // Pre-rendered Russian string shown verbatim in the UI.
  message: text("message").notNull(),
  read: integer("read", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
});

export type Notification = typeof notifications.$inferSelect;

// Simple key/value store for app-wide admin settings (autoarchive threshold,
// per-column WIP limits). Values are JSON-encoded strings.
export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type AppSetting = typeof appSettings.$inferSelect;

// Typed view of the settings the UI cares about. `archiveDays <= 0` disables
// autoarchival; wipLimits maps a status label to a max task count (null/absent
// = no limit).
export type AppConfig = {
  archiveDays: number;
  staleDays: number;
  wipLimits: Record<string, number | null>;
};

export const updateConfigSchema = z.object({
  archiveDays: z.number().int().min(0).max(3650).optional(),
  staleDays: z.number().int().min(0).max(3650).optional(),
  wipLimits: z.record(z.string(), z.number().int().min(0).nullable()).optional(),
});
