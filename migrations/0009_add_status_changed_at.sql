ALTER TABLE `tasks` ADD `status_changed_at` integer;--> statement-breakpoint
-- Backfill existing rows: use completedAt when the task is already completed,
-- otherwise approximate with "now" (we have no historical status-change record
-- for pre-migration tasks, so freshly-migrated open tasks start their staleness
-- clock at migration time).
UPDATE `tasks` SET `status_changed_at` = COALESCE(`completed_at`, unixepoch() * 1000) WHERE `status_changed_at` IS NULL;
