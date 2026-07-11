import { db, hashPassword } from "./storage";
import { users, departments, tasks } from "@shared/schema";
import seedData from "./seed-data.json";

const DEFAULT_USERNAME = "admin";
const DEFAULT_PASSWORD = "kanban2026";

export async function seedDatabase() {
  const existingUsers = db.select().from(users).all();
  if (existingUsers.length === 0) {
    db.insert(users)
      .values({
        username: DEFAULT_USERNAME,
        passwordHash: hashPassword(DEFAULT_PASSWORD),
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
      db.insert(tasks)
        .values({
          departmentId,
          goal: t.goal,
          title: t.title,
          week: t.week,
          deadline: t.deadline,
          status: t.status,
        })
        .run();
    }
    console.log(`[seed] created ${seedData.tasks.length} tasks`);
  }
}
