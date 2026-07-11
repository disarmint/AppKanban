import { users, departments, tasks } from "@shared/schema";
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
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
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
    return rows.map((t) => ({
      ...t,
      department: deptMap.get(t.departmentId)!,
      assignee: t.assigneeId ? userMap.get(t.assigneeId) ?? null : null,
    }));
  }

  async createTask(task: InsertTask): Promise<Task> {
    return db.insert(tasks).values(task).returning().get();
  }

  async updateTask(id: number, task: UpdateTask): Promise<Task | undefined> {
    return db.update(tasks).set(task).where(eq(tasks.id, id)).returning().get();
  }

  async deleteTask(id: number): Promise<boolean> {
    const result = db.delete(tasks).where(eq(tasks.id, id)).run();
    return result.changes > 0;
  }
}

export const storage = new DatabaseStorage();
