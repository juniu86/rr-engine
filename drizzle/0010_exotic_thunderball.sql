ALTER TABLE `agent_executions` MODIFY COLUMN `status` enum('pending','running','completed','failed','needs_review','waiting_for_user_input') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `agent_executions` ADD `missingInfoRequests` json;--> statement-breakpoint
ALTER TABLE `agent_executions` ADD `userResponses` json;--> statement-breakpoint
ALTER TABLE `agent_executions` ADD `iterationCount` int DEFAULT 0;