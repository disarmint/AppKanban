import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
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

export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  departmentId: integer("department_id")
    .notNull()
    .references(() => departments.id),
  goal: text("goal").notNull(),
  title: text("title").notNull(),
  week: text("week").notNull(),
  deadline: text("deadline").notNull(),
  status: text("status").notNull().default("Запланировано"),
});

export const insertTaskSchema = createInsertSchema(tasks)
  .omit({ id: true })
  .extend({ status: z.enum(STATUSES).default("Запланировано") });

export const updateTaskSchema = insertTaskSchema.partial();

export type InsertTask = z.infer<typeof insertTaskSchema>;
export type UpdateTask = z.infer<typeof updateTaskSchema>;
export type Task = typeof tasks.$inferSelect;

export type TaskWithDepartment = Task & {
  department: Department;
};
