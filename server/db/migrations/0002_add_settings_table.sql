CREATE TABLE `settings` (
	`scope` text DEFAULT 'global' NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`value_type` text DEFAULT 'string' NOT NULL,
	`is_encrypted` integer DEFAULT false NOT NULL,
	`group_key` text,
	`updated_by` text,
	`updated_at` integer NOT NULL,
	`note` text,
	PRIMARY KEY(`scope`, `key`)
);
--> statement-breakpoint
CREATE INDEX `idx_settings_key` ON `settings` (`key`);--> statement-breakpoint
CREATE INDEX `idx_settings_group` ON `settings` (`group_key`);