CREATE TABLE `departments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`order_index` integer NOT NULL,
	`roadmap_period` text NOT NULL,
	`roadmap_status` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `departments_name_unique` ON `departments` (`name`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`department_id` integer NOT NULL,
	`goal` text NOT NULL,
	`title` text NOT NULL,
	`week` text NOT NULL,
	`deadline` text NOT NULL,
	`status` text DEFAULT 'Запланировано' NOT NULL,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`department_id` integer,
	`must_change_password` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);