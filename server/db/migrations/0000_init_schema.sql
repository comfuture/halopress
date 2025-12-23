CREATE TABLE `asset` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`object_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text,
	`width` integer,
	`height` integer,
	`duration_ms` integer,
	`created_by` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_asset_created_at` ON `asset` (`created_at`);--> statement-breakpoint
CREATE TABLE `asset_variant` (
	`asset_id` text NOT NULL,
	`variant_key` text NOT NULL,
	`object_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`width` integer,
	`height` integer,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`asset_id`, `variant_key`)
);
--> statement-breakpoint
CREATE TABLE `content` (
	`id` text PRIMARY KEY NOT NULL,
	`schema_key` text NOT NULL,
	`schema_version` integer NOT NULL,
	`title` text,
	`status` text NOT NULL,
	`extra_json` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_content_schema_updated` ON `content` (`schema_key`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_content_status` ON `content` (`schema_key`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `content_ref` (
	`content_id` text NOT NULL,
	`field_path` text NOT NULL,
	`target_kind` text NOT NULL,
	`target_schema_key` text,
	`target_id` text NOT NULL,
	PRIMARY KEY(`content_id`, `field_path`, `target_kind`, `target_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_content_ref_target` ON `content_ref` (`target_kind`,`target_id`);--> statement-breakpoint
CREATE INDEX `idx_content_ref_content` ON `content_ref` (`content_id`);--> statement-breakpoint
CREATE TABLE `content_ref_list` (
	`owner_content_id` text NOT NULL,
	`field_key` text NOT NULL,
	`position` integer NOT NULL,
	`item_kind` text NOT NULL,
	`item_schema_key` text,
	`item_id` text,
	`asset_id` text,
	`meta_json` text,
	PRIMARY KEY(`owner_content_id`, `field_key`, `position`)
);
--> statement-breakpoint
CREATE INDEX `idx_content_ref_list_owner` ON `content_ref_list` (`owner_content_id`,`field_key`);--> statement-breakpoint
CREATE TABLE `member` (
	`user_id` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `schema` (
	`schema_key` text NOT NULL,
	`version` integer NOT NULL,
	`title` text,
	`ast_json` text NOT NULL,
	`json_schema` text NOT NULL,
	`ui_schema` text,
	`registry_json` text,
	`diff_json` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`note` text,
	PRIMARY KEY(`schema_key`, `version`)
);
--> statement-breakpoint
CREATE INDEX `idx_schema_created_at` ON `schema` (`created_at`);--> statement-breakpoint
CREATE TABLE `schema_active` (
	`schema_key` text PRIMARY KEY NOT NULL,
	`active_version` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `schema_draft` (
	`schema_key` text PRIMARY KEY NOT NULL,
	`title` text,
	`ast_json` text NOT NULL,
	`updated_at` integer NOT NULL,
	`locked_by` text,
	`lock_expires_at` integer
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_user_email` ON `user` (`email`);