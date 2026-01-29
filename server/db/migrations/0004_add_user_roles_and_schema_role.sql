CREATE TABLE `schema_role` (
	`schema_key` text NOT NULL,
	`role_key` text NOT NULL,
	`can_read` integer DEFAULT false NOT NULL,
	`can_write` integer DEFAULT false NOT NULL,
	`can_admin` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`schema_key`, `role_key`),
	FOREIGN KEY (`role_key`) REFERENCES `user_role`(`role_key`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_schema_role_schema` ON `schema_role` (`schema_key`);--> statement-breakpoint
CREATE INDEX `idx_schema_role_role` ON `schema_role` (`role_key`);--> statement-breakpoint
CREATE TABLE `user_role` (
	`role_key` text PRIMARY KEY NOT NULL,
	`title` text
);
--> statement-breakpoint
INSERT INTO `user_role` (`role_key`, `title`) VALUES
	('admin', 'Admin'),
	('user', 'User'),
	('anonymous', 'Anonymous');
--> statement-breakpoint
DROP TABLE `member`;--> statement-breakpoint
ALTER TABLE `user` RENAME TO `user__old`;
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`role_key` text DEFAULT 'user' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`role_key`) REFERENCES `user_role`(`role_key`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `user` (`id`, `email`, `name`, `role_key`, `status`, `created_at`)
SELECT `id`, `email`, `name`, 'user', `status`, `created_at` FROM `user__old`;
--> statement-breakpoint
DROP TABLE `user__old`;
--> statement-breakpoint
CREATE INDEX `idx_user_email` ON `user` (`email`);
