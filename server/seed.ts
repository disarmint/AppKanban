import { eq, isNull } from "drizzle-orm";
import { db, hashPassword, isLegacyHash } from "./storage";
import { users, departments, tasks } from "@shared/schema";
import { parseRuDate, toIsoDate } from "@shared/ru-date";
import seedData from "./seed-data.json";

const DEFAULT_USERNAME = "admin";
const DEFAULT_PASSWORD = "kanban2026";

/** One-time migration of legacy (sha256) password hashes to scrypt.
 * Legacy passwords cannot be recovered, so each affected user gets a
 * temporary password "<login>2026!" and is forced to change it on next login.
 * Returns the list of resets so the business owner can be informed. */
export function migrateLegacyPasswords(): { username: string; tempPassword: string }[] {
  const resets: { username: string; tempPassword: string }[] = [];
  const all = db.select().from(users).all();
  for (const u of all) {
    if (isLegacyHash(u.passwordHash)) {
      const tempPassword = `${u.username}2026!`;
      db.update(users)
        .set({ passwordHash: hashPassword(tempPassword), mustChangePassword: true })
        .where(eq(users.id, u.id))
        .run();
      resets.push({ username: u.username, tempPassword });
    }
  }
  if (resets.length > 0) {
    console.log(
      `[migrate] reset ${resets.length} legacy password(s): ` +
        resets.map((r) => `${r.username} -> ${r.tempPassword}`).join(", ")
    );
  }
  return resets;
}

export async function seedDatabase() {
  const existingUsers = db.select().from(users).all();
  if (existingUsers.length === 0) {
    db.insert(users)
      .values({
        username: DEFAULT_USERNAME,
        passwordHash: hashPassword(DEFAULT_PASSWORD),
        role: "admin",
        departmentId: null,
      })
      .run();
    console.log(`[seed] created default user "${DEFAULT_USERNAME}"`);
  }

  const existingDepartments = db.select().from(departments).all();
  let departmentIdByName = new Map<string, number>();

  if (existingDepartments.length === 0) {
    for (const dept of seedData.departments) {
      const row = db
        .insert(departments)
        .values({
          name: dept.name,
          color: dept.color,
          orderIndex: dept.orderIndex,
          roadmapPeriod: dept.roadmapPeriod,
          roadmapStatus: dept.roadmapStatus,
        })
        .returning()
        .get();
      departmentIdByName.set(row.name, row.id);
    }
    console.log(`[seed] created ${seedData.departments.length} departments`);
  } else {
    for (const d of existingDepartments) {
      departmentIdByName.set(d.name, d.id);
    }
  }

  const existingTasks = db.select().from(tasks).all();
  if (existingTasks.length === 0) {
    for (const t of seedData.tasks) {
      const departmentId = departmentIdByName.get(t.departmentName);
      if (!departmentId) continue;
      const parsed = parseRuDate(t.deadline);
      db.insert(tasks)
        .values({
          departmentId,
          goal: t.goal,
          title: t.title,
          week: t.week,
          deadline: t.deadline,
          deadlineDate: parsed ? toIsoDate(parsed) : null,
          status: t.status,
          // Seed data may create tasks already in the final column; give them a
          // completedAt so Reports/auto-archive treat them the same as tasks
          // that transitioned through the normal update path.
          completedAt: t.status === "Завершено" ? (parsed ? parsed.getTime() : Date.now()) : null,
        })
        .run();
    }
    console.log(`[seed] created ${seedData.tasks.length} tasks`);
  }
}

/** One-time normalization of free-text `deadline` into machine-readable
 * `deadlineDate` (ISO). Runs for rows where deadlineDate is still null.
 * Returns the tasks whose deadline could not be parsed (left as null) so the
 * owner can fix them by hand. */
export function backfillDeadlineDates(): { id: number; title: string; deadline: string }[] {
  const rows = db.select().from(tasks).where(isNull(tasks.deadlineDate)).all();
  const unparsed: { id: number; title: string; deadline: string }[] = [];
  let filled = 0;
  for (const t of rows) {
    const parsed = parseRuDate(t.deadline);
    if (parsed) {
      db.update(tasks)
        .set({ deadlineDate: toIsoDate(parsed) })
        .where(eq(tasks.id, t.id))
        .run();
      filled++;
    } else {
      unparsed.push({ id: t.id, title: t.title, deadline: t.deadline });
    }
  }
  if (filled > 0 || unparsed.length > 0) {
    console.log(
      `[deadline] backfilled ${filled} deadline date(s)` +
        (unparsed.length > 0
          ? `; ${unparsed.length} unparseable: ` +
            unparsed.map((u) => `#${u.id} "${u.deadline}"`).join(", ")
          : "")
    );
  }
  return unparsed;
}
