import cron from "node-cron";
import { storage } from "./storage";

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

export function startCronJobs(): void {
  void runArchivePass();
  // Top of every hour.
  cron.schedule("0 * * * *", () => void runArchivePass());
}
