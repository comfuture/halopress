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
DROP TABLE `member`;--> statement-breakpoint
ALTER TABLE `user` ADD `role_key` text DEFAULT 'user' NOT NULL REFERENCES user_role(role_key);
