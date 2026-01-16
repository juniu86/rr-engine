ALTER TABLE `projects` ADD `financialRevisionCycle` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `projects` ADD `financialRevisionReason` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `financialRevisionInstructions` json;