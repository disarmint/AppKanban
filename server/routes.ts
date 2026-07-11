import type { Express } from "express";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { storage, hashPassword } from "./storage";
import { seedDatabase } from "./seed";
import { createToken, destroyToken, requireAuth } from "./auth";
import { insertTaskSchema, updateTaskSchema } from "@shared/schema";
import { z } from "zod";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await seedDatabase();

  app.post("/api/login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Введите логин и пароль" });
    }
    const { username, password } = parsed.data;
    const user = await storage.getUserByUsername(username);
    if (!user || user.passwordHash !== hashPassword(password)) {
      return res.status(401).json({ message: "Неверный логин или пароль" });
    }
    const token = createToken({ userId: user.id, username: user.username });
    res.json({ token, user: { id: user.id, username: user.username } });
  });

  app.post("/api/logout", requireAuth, (req, res) => {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (token) destroyToken(token);
    res.json({ ok: true });
  });

  app.get("/api/me", requireAuth, (req, res) => {
    res.json({ id: req.session!.userId, username: req.session!.username });
  });

  app.get("/api/departments", requireAuth, async (_req, res) => {
    const departments = await storage.getDepartments();
    res.json(departments);
  });

  app.get("/api/tasks", requireAuth, async (_req, res) => {
    const tasks = await storage.getTasks();
    res.json(tasks);
  });

  app.post("/api/tasks", requireAuth, async (req, res) => {
    const parsed = insertTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Некорректные данные задачи" });
    }
    const task = await storage.createTask(parsed.data);
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
    const task = await storage.updateTask(id, parsed.data);
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
    const ok = await storage.deleteTask(id);
    if (!ok) {
      return res.status(404).json({ message: "Задача не найдена" });
    }
    res.status(204).end();
  });

  return httpServer;
}
