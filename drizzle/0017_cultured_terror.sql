CREATE TABLE `agent_llm_calls` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`agentExecutionId` int,
	`agentType` enum('engenheiro_tecnico','logistica','orcamentista','tributario','comercial','gestao_projetos','financeiro','juridico','board','auditor') NOT NULL,
	`model` varchar(100) NOT NULL,
	`promptTokens` int NOT NULL DEFAULT 0,
	`completionTokens` int NOT NULL DEFAULT 0,
	`totalTokens` int NOT NULL DEFAULT 0,
	`costUsd` decimal(10,6) NOT NULL DEFAULT '0',
	`costBrl` decimal(10,4) NOT NULL DEFAULT '0',
	`latencyMs` int NOT NULL DEFAULT 0,
	`finishReason` varchar(30),
	`attemptNumber` int NOT NULL DEFAULT 1,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `agent_llm_calls_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `agent_llm_calls` ADD CONSTRAINT `agent_llm_calls_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agent_llm_calls` ADD CONSTRAINT `agent_llm_calls_agentExecutionId_agent_executions_id_fk` FOREIGN KEY (`agentExecutionId`) REFERENCES `agent_executions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `agent_llm_calls_projectId_idx` ON `agent_llm_calls` (`projectId`);--> statement-breakpoint
CREATE INDEX `agent_llm_calls_agentType_idx` ON `agent_llm_calls` (`agentType`);--> statement-breakpoint
CREATE INDEX `agent_llm_calls_agentExecutionId_idx` ON `agent_llm_calls` (`agentExecutionId`);--> statement-breakpoint
CREATE INDEX `agent_llm_calls_createdAt_idx` ON `agent_llm_calls` (`createdAt`);