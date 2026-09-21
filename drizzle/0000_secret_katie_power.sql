CREATE TABLE `ledger_snapshots` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL
);
