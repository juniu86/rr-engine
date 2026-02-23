ALTER TABLE `agent_executions` ADD CONSTRAINT `agent_executions_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agent_interactions` ADD CONSTRAINT `agent_interactions_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agent_interactions` ADD CONSTRAINT `agent_interactions_agentExecutionId_agent_executions_id_fk` FOREIGN KEY (`agentExecutionId`) REFERENCES `agent_executions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `budget_credits` ADD CONSTRAINT `budget_credits_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `budget_items` ADD CONSTRAINT `budget_items_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cash_flow_items` ADD CONSTRAINT `cash_flow_items_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `generated_documents` ADD CONSTRAINT `generated_documents_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `logistics_costs` ADD CONSTRAINT `logistics_costs_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `projects` ADD CONSTRAINT `projects_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedule_items` ADD CONSTRAINT `schedule_items_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `agent_executions_projectId_idx` ON `agent_executions` (`projectId`);--> statement-breakpoint
CREATE INDEX `agent_executions_agentType_idx` ON `agent_executions` (`agentType`);--> statement-breakpoint
CREATE INDEX `agent_interactions_projectId_idx` ON `agent_interactions` (`projectId`);--> statement-breakpoint
CREATE INDEX `agent_interactions_executionId_idx` ON `agent_interactions` (`agentExecutionId`);--> statement-breakpoint
CREATE INDEX `budget_credits_userId_idx` ON `budget_credits` (`userId`);--> statement-breakpoint
CREATE INDEX `budget_items_projectId_idx` ON `budget_items` (`projectId`);--> statement-breakpoint
CREATE INDEX `cash_flow_items_projectId_idx` ON `cash_flow_items` (`projectId`);--> statement-breakpoint
CREATE INDEX `generated_documents_projectId_idx` ON `generated_documents` (`projectId`);--> statement-breakpoint
CREATE INDEX `logistics_costs_projectId_idx` ON `logistics_costs` (`projectId`);--> statement-breakpoint
CREATE INDEX `projects_userId_idx` ON `projects` (`userId`);--> statement-breakpoint
CREATE INDEX `projects_status_idx` ON `projects` (`status`);--> statement-breakpoint
CREATE INDEX `schedule_items_projectId_idx` ON `schedule_items` (`projectId`);--> statement-breakpoint
CREATE INDEX `subscriptions_userId_idx` ON `subscriptions` (`userId`);