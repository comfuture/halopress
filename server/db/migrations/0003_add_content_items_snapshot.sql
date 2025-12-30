CREATE TABLE `content_items` (
	`content_id` text PRIMARY KEY NOT NULL,
	`schema_key` text NOT NULL,
	`schema_version` integer NOT NULL,
	`title` text,
	`description` text,
	`image` text,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_content_items_schema_updated` ON `content_items` (`schema_key`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_content_items_status` ON `content_items` (`schema_key`,`status`,`updated_at`);