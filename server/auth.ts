import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";

type SessionInfo = {
  userId: number;
  username: string;
  role: string;
  departmentId: number | null;
};

const tokens = new Map<string, SessionInfo>();

export function createToken(session: SessionInfo): string {
  const token = crypto.randomBytes(24).toString("hex");
  tokens.set(token, session);
  return token;
}

export function destroyToken(token: string) {
  tokens.delete(token);
}

export function getSession(token: string | undefined): SessionInfo | undefined {
  if (!token) return undefined;
  return tokens.get(token);
}

declare module "express-serve-static-core" {
  interface Request {
    session?: SessionInfo;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  const session = getSession(token);
  if (!session) {
    return res.status(401).json({ message: "Требуется авторизация" });
  }
  req.session = session;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.session?.role !== "admin") {
    return res.status(403).json({ message: "Недостаточно прав" });
  }
  next();
}
