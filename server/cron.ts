import cron from "node-cron";
import { storage } from "./storage";
import { daysOverdueFromIso, parseIsoDate, formatRuDate } from "@shared/ru-date";

/**
 * Autoarchival job. Runs in-process (no separate worker) once an hour and
 * soft-archives completed tasks that have sat in the final column longer than
 * the admin-configured threshold. Also runs once at startup so a long-idle
 * server catches up immediately.
 */
async function runArchivePass(): Promise<void> {
  try {
    const { archiveDays } = await storage.getConfig();
    const count = await storage.archiveStaleCompleted(archiveDays);
    if (count > 0) console.log(`[cron] autoarchived ${count} task(s) completed >${archiveDays}d ago`);
  } catch (err) {
    console.error("[cron] autoarchive pass failed:", err);
  }
}

// Notify assignees when a task's deadline is today or 1/3 days out. Fires at
// most once per task per ~day (dedup via a 20h lookback) so an hourly cron
// doesn't spam. Tasks without an assignee are skipped — there's no single
// person to notify.
const DEADLINE_THRESHOLDS = new Set([0, 1, 3]);
const DEDUP_WINDOW_MS = 20 * 60 * 60 * 1000;

async function runDeadlinePass(): Promise<void> {
  try {
    const tasks = await storage.getTasks();
    const since = Date.now() - DEDUP_WINDOW_MS;
    for (const t of tasks) {
      if (t.archived || t.status === "Завершено" || !t.assigneeId || !t.deadlineDate) continue;
      const overdue = daysOverdueFromIso(t.deadlineDate);
      if (overdue === null || overdue > 0) continue; // skip unparsable / already overdue
      const daysUntil = -overdue; // 0 = today, positive = days remaining
      if (!DEADLINE_THRESHOLDS.has(daysUntil)) continue;
      if (await storage.hasRecentDeadlineNotification(t.id, since)) continue;
      const parsed = parseIsoDate(t.deadlineDate);
      const dateLabel = parsed ? formatRuDate(parsed) : t.deadline;
      const when = daysUntil === 0 ? "сегодня" : `через ${daysUntil} дн.`;
      await storage.createNotification({
        userId: t.assigneeId,
        type: "deadline",
        taskId: t.id,
        message: `Дедлайн задачи «${t.title}» — ${dateLabel} (${when})`,
      });
    }
  } catch (err) {
    console.error("[cron] deadline pass failed:", err);
  }
}

export function startCronJobs(): void {
  void runArchivePass();
  void runDeadlinePass();
  // Top of every hour.
  cron.schedule("0 * * * *", () => {
    void runArchivePass();
    void runDeadlinePass();
  });
}
