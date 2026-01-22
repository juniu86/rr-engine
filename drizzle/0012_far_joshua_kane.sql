CREATE TABLE `agent_interactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`agentExecutionId` int NOT NULL,
	`agentType` enum('engenheiro_tecnico','logistica','orcamentista','tributario','comercial','gestao_projetos','financeiro','juridico','board','auditor') NOT NULL,
	`iterationNumber` int NOT NULL,
	`questions` json,
	`responses` json,
	`reasonForQuestions` text,
	`questionedAt` timestamp NOT NULL DEFAULT (now()),
	`respondedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `agent_interactions_id` PRIMARY KEY(`id`)
);
