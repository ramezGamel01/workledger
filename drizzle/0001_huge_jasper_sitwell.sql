CREATE TABLE `ledger_snapshot_chunks` (
	`user_id` text NOT NULL,
	`version` integer NOT NULL,
	`chunk_index` integer NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`user_id`, `version`, `chunk_index`)
);
--> statement-breakpoint
CREATE TABLE `ledger_versions` (
	`user_id` text NOT NULL,
	`version` integer NOT NULL,
	`email` text NOT NULL,
	`chunk_count` integer NOT NULL,
	`byte_length` integer NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `version`)
);
