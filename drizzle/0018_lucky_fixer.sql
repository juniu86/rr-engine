CREATE TABLE `deterministic_engine_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`totalDirectCost` decimal(12,2) NOT NULL,
	`totalLogisticsCost` decimal(12,2) NOT NULL,
	`totalBaseCost` decimal(12,2) NOT NULL,
	`totalItemsParsed` int NOT NULL,
	`warningsJson` json,
	`rawOutputJson` json,
	`llmTotal` decimal(12,2),
	`divergencePercent` decimal(6,2),
	`divergenceClass` varchar(20),
	`latencyMs` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `deterministic_engine_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `deterministic_engine_runs` ADD CONSTRAINT `deterministic_engine_runs_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `deterministic_engine_runs_projectId_idx` ON `deterministic_engine_runs` (`projectId`);--> statement-breakpoint
CREATE INDEX `deterministic_engine_runs_createdAt_idx` ON `deterministic_engine_runs` (`createdAt`);