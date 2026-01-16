ALTER TABLE `projects` MODIFY COLUMN `status` enum('draft','processing','review','approved','rejected','blocked','pending_confirmation') NOT NULL DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE `projects` ADD `blockReason` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `warningMessages` text;