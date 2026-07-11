import { users, departments, tasks } from "@shared/schema";
import type {
  User,
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
    password_hash TEXT NOT NULL
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

export function hashPassword(password: string): string {
  const salt = "kanban-app-static-salt";
  return crypto.createHash("sha256").update(salt + password).digest("hex");
}

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getDepartments(): Promise<Department[]>;
  createDepartment(dept: InsertDepartment): Promise<Department>;

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

  async createUser(insertUser: InsertUser): Promise<User> {
    return db.insert(users).values(insertUser).returning().get();
  }

  async getDepartments(): Promise<Department[]> {
    return db.select().from(departments).orderBy(departments.orderIndex).all();
  }

  async createDepartment(dept: InsertDepartment): Promise<Department> {
    return db.insert(departments).values(dept).returning().get();
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
