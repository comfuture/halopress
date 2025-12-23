CREATE TABLE `content_date_data` (
	`content_id` text NOT NULL,
	`field_id` text NOT NULL,
	`value` integer NOT NULL,
	PRIMARY KEY(`content_id`, `field_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_filter_content_date_data` ON `content_date_data` (`field_id`,`value`,`content_id`);--> statement-breakpoint
CREATE TABLE `content_fields` (
	`schema_key` text NOT NULL,
	`field_id` text NOT NULL,
	`field_key` text NOT NULL,
	`kind` text NOT NULL,
	`search_mode` text DEFAULT 'off' NOT NULL,
	`filterable` integer DEFAULT false NOT NULL,
	`sortable` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`schema_key`, `field_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_content_fields_schema` ON `content_fields` (`schema_key`);--> statement-breakpoint
CREATE INDEX `idx_content_fields_key` ON `content_fields` (`schema_key`,`field_key`);--> statement-breakpoint
CREATE TABLE `content_number_data` (
	`content_id` text NOT NULL,
	`field_id` text NOT NULL,
	`value` real NOT NULL,
	PRIMARY KEY(`content_id`, `field_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_filter_content_number_data` ON `content_number_data` (`field_id`,`value`,`content_id`);--> statement-breakpoint
CREATE TABLE `content_string_data` (
	`content_id` text NOT NULL,
	`field_id` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`content_id`, `field_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_filter_content_string_data` ON `content_string_data` (`field_id`,`value`,`content_id`);