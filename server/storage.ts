import { users, departments, tasks } from "@shared/schema";
import type {
  User,
  UserPublic,
  InsertUser,
  Department,
  InsertDepartment,
  Task,
  InsertTask,
  UpdateTask,
  TaskWithDepartment,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    department_id INTEGER
  );
  CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL,
    order_index INTEGER NOT NULL,
    roadmap_period TEXT NOT NULL,
    roadmap_status TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    department_id INTEGER NOT NULL REFERENCES departments(id),
    goal TEXT NOT NULL,
    title TEXT NOT NULL,
    week TEXT NOT NULL,
    deadline TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Запланировано'
  );
`);

// Migration guard: add columns to a users table created before roles existed.
const userColumns = sqlite.prepare("PRAGMA table_info(users)").all() as { name: string }[];
const userColumnNames = new Set(userColumns.map((c) => c.name));
if (!userColumnNames.has("role")) {
  sqlite.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member'");
  sqlite.exec("UPDATE users SET role = 'admin' WHERE username = 'admin'");
}
if (!userColumnNames.has("department_id")) {
  sqlite.exec("ALTER TABLE users ADD COLUMN department_id INTEGER");
}

export function hashPassword(password: string): string {
  const salt = "kanban-app-static-salt";
  return crypto.createHash("sha256").update(salt + password).digest("hex");
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
  createDepartment(dept: InsertDepartment): Promise<Department>;

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

  async createDepartment(dept: InsertDepartment): Promise<Department> {
    return db.insert(departments).values(dept).returning().get();
  }

  async getTask(id: number): Promise<Task | undefined> {
    return db.select().from(tasks).where(eq(tasks.id, id)).get();
  }

  async getTasks(): Promise<TaskWithDepartment[]> {
    const rows = db.select().from(tasks).all();
    const depts = await this.getDepartments();
    const deptMap = new Map(depts.map((d) => [d.id, d]));
    return rows.map((t) => ({ ...t, department: deptMap.get(t.departmentId)! }));
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
