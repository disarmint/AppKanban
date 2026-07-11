import { users, departments, tasks, taskComments, checklistItems, labels, taskLabels } from "@shared/schema";
import type {
  User,
  UserPublic,
  InsertUser,
  Department,
  InsertDepartment,
  UpdateDepartment,
  Task,
  InsertTask,
  UpdateTask,
  TaskWithDepartment,
  TaskComment,
  CommentWithAuthor,
  ChecklistItem,
  Label,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and } from "drizzle-orm";
import crypto from "node:crypto";
import { initDatabase } from "./db-init";

const sqlite = new Database("data.db");

// Schema is owned by shared/schema.ts (Drizzle) and materialized into
// ./migrations. initDatabase applies those migrations (and sets the WAL +
// foreign_keys pragmas). No raw CREATE TABLE / ALTER lives here anymore.
initDatabase(sqlite);

export const db = drizzle(sqlite);

// Password hashing: scrypt with a per-user random salt.
// Stored format: "scrypt$<saltHex>$<hashHex>". Legacy hashes (bare sha256 hex,
// 64 chars, no "$") are detected by isLegacyHash and migrated on startup.
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const derived = crypto.scryptSync(password, salt, expected.length);
  return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
}

export function isLegacyHash(stored: string): boolean {
  return !stored.startsWith("scrypt$");
}

export function toPublicUser(user: User): UserPublic {
  const { passwordHash, ...rest } = user;
  return rest;
}

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: number): Promise<boolean>;

  getDepartments(): Promise<Department[]>;
  getDepartment(id: number): Promise<Department | undefined>;
  createDepartment(dept: InsertDepartment): Promise<Department>;
  updateDepartment(id: number, data: UpdateDepartment): Promise<Department | undefined>;
  deleteDepartment(id: number): Promise<boolean>;
  countTasksByDepartment(id: number): Promise<number>;
  countUsersByDepartment(id: number): Promise<number>;

  getTask(id: number): Promise<Task | undefined>;
  getTasks(): Promise<TaskWithDepartment[]>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: number, task: UpdateTask): Promise<Task | undefined>;
  deleteTask(id: number): Promise<boolean>;

  getComments(taskId: number): Promise<CommentWithAuthor[]>;
  getComment(id: number): Promise<TaskComment | undefined>;
  createComment(taskId: number, userId: number, body: string): Promise<TaskComment>;
  deleteComment(id: number): Promise<boolean>;

  getChecklist(taskId: number): Promise<ChecklistItem[]>;
  getChecklistItem(id: number): Promise<ChecklistItem | undefined>;
  createChecklistItem(taskId: number, text: string): Promise<ChecklistItem>;
  updateChecklistItem(id: number, data: { text?: string; done?: boolean }): Promise<ChecklistItem | undefined>;
  deleteChecklistItem(id: number): Promise<boolean>;

  getLabels(): Promise<Label[]>;
  getLabel(id: number): Promise<Label | undefined>;
  createLabel(name: string, color: string): Promise<Label>;
  updateLabel(id: number, data: { name?: string; color?: string }): Promise<Label | undefined>;
  deleteLabel(id: number): Promise<boolean>;
  addTaskLabel(taskId: number, labelId: number): Promise<void>;
  removeTaskLabel(taskId: number, labelId: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.id, id)).get();
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.username, username)).get();
  }

  async getUsers(): Promise<User[]> {
    return db.select().from(users).all();
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    return db.insert(users).values(insertUser).returning().get();
  }

  async updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined> {
    return db.update(users).set(data).where(eq(users.id, id)).returning().get();
  }

  async deleteUser(id: number): Promise<boolean> {
    const result = db.delete(users).where(eq(users.id, id)).run();
    return result.changes > 0;
  }

  async getDepartments(): Promise<Department[]> {
    return db.select().from(departments).orderBy(departments.orderIndex).all();
  }

  async getDepartment(id: number): Promise<Department | undefined> {
    return db.select().from(departments).where(eq(departments.id, id)).get();
  }

  async createDepartment(dept: InsertDepartment): Promise<Department> {
    return db.insert(departments).values(dept).returning().get();
  }

  async updateDepartment(id: number, data: UpdateDepartment): Promise<Department | undefined> {
    return db.update(departments).set(data).where(eq(departments.id, id)).returning().get();
  }

  async deleteDepartment(id: number): Promise<boolean> {
    const result = db.delete(departments).where(eq(departments.id, id)).run();
    return result.changes > 0;
  }

  async countTasksByDepartment(id: number): Promise<number> {
    return db.select().from(tasks).where(eq(tasks.departmentId, id)).all().length;
  }

  async countUsersByDepartment(id: number): Promise<number> {
    return db.select().from(users).where(eq(users.departmentId, id)).all().length;
  }

  async getTask(id: number): Promise<Task | undefined> {
    return db.select().from(tasks).where(eq(tasks.id, id)).get();
  }

  async getTasks(): Promise<TaskWithDepartment[]> {
    const rows = db.select().from(tasks).all();
    const depts = await this.getDepartments();
    const deptMap = new Map(depts.map((d) => [d.id, d]));
    const userList = db.select().from(users).all();
    const userMap = new Map(userList.map((u) => [u.id, toPublicUser(u)]));
    const commentRows = db.select().from(taskComments).all();
    const countByTask = new Map<number, number>();
    for (const c of commentRows) {
      countByTask.set(c.taskId, (countByTask.get(c.taskId) ?? 0) + 1);
    }
    const checkRows = db.select().from(checklistItems).all();
    const checkTotal = new Map<number, number>();
    const checkDone = new Map<number, number>();
    for (const it of checkRows) {
      checkTotal.set(it.taskId, (checkTotal.get(it.taskId) ?? 0) + 1);
      if (it.done) checkDone.set(it.taskId, (checkDone.get(it.taskId) ?? 0) + 1);
    }
    const labelRows = db.select().from(labels).all();
    const labelMap = new Map(labelRows.map((l) => [l.id, l]));
    const linkRows = db.select().from(taskLabels).all();
    const labelsByTask = new Map<number, Label[]>();
    for (const link of linkRows) {
      const label = labelMap.get(link.labelId);
      if (!label) continue;
      const arr = labelsByTask.get(link.taskId) ?? [];
      arr.push(label);
      labelsByTask.set(link.taskId, arr);
    }
    return rows.map((t) => ({
      ...t,
      department: deptMap.get(t.departmentId)!,
      assignee: t.assigneeId ? userMap.get(t.assigneeId) ?? null : null,
      commentCount: countByTask.get(t.id) ?? 0,
      checklistTotal: checkTotal.get(t.id) ?? 0,
      checklistDone: checkDone.get(t.id) ?? 0,
      labels: labelsByTask.get(t.id) ?? [],
    }));
  }

  async getLabels(): Promise<Label[]> {
    return db.select().from(labels).orderBy(labels.name).all();
  }

  async getLabel(id: number): Promise<Label | undefined> {
    return db.select().from(labels).where(eq(labels.id, id)).get();
  }

  async createLabel(name: string, color: string): Promise<Label> {
    return db.insert(labels).values({ name, color }).returning().get();
  }

  async updateLabel(id: number, data: { name?: string; color?: string }): Promise<Label | undefined> {
    return db.update(labels).set(data).where(eq(labels.id, id)).returning().get();
  }

  async deleteLabel(id: number): Promise<boolean> {
    db.delete(taskLabels).where(eq(taskLabels.labelId, id)).run();
    return db.delete(labels).where(eq(labels.id, id)).run().changes > 0;
  }

  async addTaskLabel(taskId: number, labelId: number): Promise<void> {
    db.insert(taskLabels).values({ taskId, labelId }).onConflictDoNothing().run();
  }

  async removeTaskLabel(taskId: number, labelId: number): Promise<void> {
    db.delete(taskLabels)
      .where(and(eq(taskLabels.taskId, taskId), eq(taskLabels.labelId, labelId)))
      .run();
  }

  async getChecklist(taskId: number): Promise<ChecklistItem[]> {
    return db
      .select()
      .from(checklistItems)
      .where(eq(checklistItems.taskId, taskId))
      .all()
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async getChecklistItem(id: number): Promise<ChecklistItem | undefined> {
    return db.select().from(checklistItems).where(eq(checklistItems.id, id)).get();
  }

  async createChecklistItem(taskId: number, text: string): Promise<ChecklistItem> {
    return db
      .insert(checklistItems)
      .values({ taskId, text, done: false, createdAt: Date.now() })
      .returning()
      .get();
  }

  async updateChecklistItem(
    id: number,
    data: { text?: string; done?: boolean }
  ): Promise<ChecklistItem | undefined> {
    return db.update(checklistItems).set(data).where(eq(checklistItems.id, id)).returning().get();
  }

  async deleteChecklistItem(id: number): Promise<boolean> {
    return db.delete(checklistItems).where(eq(checklistItems.id, id)).run().changes > 0;
  }

  async getComments(taskId: number): Promise<CommentWithAuthor[]> {
    const rows = db
      .select()
      .from(taskComments)
      .where(eq(taskComments.taskId, taskId))
      .all()
      .sort((a, b) => a.createdAt - b.createdAt);
    const userList = db.select().from(users).all();
    const userMap = new Map(userList.map((u) => [u.id, toPublicUser(u)]));
    return rows.map((c) => ({ ...c, author: userMap.get(c.userId) ?? null }));
  }

  async getComment(id: number): Promise<TaskComment | undefined> {
    return db.select().from(taskComments).where(eq(taskComments.id, id)).get();
  }

  async createComment(taskId: number, userId: number, body: string): Promise<TaskComment> {
    return db
      .insert(taskComments)
      .values({ taskId, userId, body, createdAt: Date.now() })
      .returning()
      .get();
  }

  async deleteComment(id: number): Promise<boolean> {
    return db.delete(taskComments).where(eq(taskComments.id, id)).run().changes > 0;
  }

  async createTask(task: InsertTask): Promise<Task> {
    return db.insert(tasks).values(task).returning().get();
  }

  async updateTask(id: number, task: UpdateTask): Promise<Task | undefined> {
    return db.update(tasks).set(task).where(eq(tasks.id, id)).returning().get();
  }

  async deleteTask(id: number): Promise<boolean> {
    db.delete(taskComments).where(eq(taskComments.taskId, id)).run();
    db.delete(checklistItems).where(eq(checklistItems.taskId, id)).run();
    db.delete(taskLabels).where(eq(taskLabels.taskId, id)).run();
    const result = db.delete(tasks).where(eq(tasks.id, id)).run();
    return result.changes > 0;
  }
}

export const storage = new DatabaseStorage();
