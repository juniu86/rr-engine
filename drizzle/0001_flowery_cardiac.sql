CREATE TABLE `agent_executions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`agentType` enum('engenheiro_tecnico','logistica','orcamentista','tributario','comercial','gestao_projetos','financeiro','juridico','board') NOT NULL,
	`agentOrder` int NOT NULL,
	`status` enum('pending','running','completed','failed','needs_review') NOT NULL DEFAULT 'pending',
	`input` json,
	`output` json,
	`errors` json,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `agent_executions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `budget_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`parentId` int,
	`category` varchar(100),
	`code` varchar(50),
	`description` text NOT NULL,
	`unit` varchar(20),
	`quantity` decimal(15,4),
	`unitCostMaterial` decimal(15,2),
	`unitCostLabor` decimal(15,2),
	`unitCostLogistics` decimal(15,2),
	`unitCostTotal` decimal(15,2),
	`totalCost` decimal(15,2),
	`taxType` enum('iss','icms','both','none'),
	`taxAmount` decimal(15,2),
	`bdiAmount` decimal(15,2),
	`finalPrice` decimal(15,2),
	`source` varchar(100),
	`sourceCode` varchar(50),
	`sourceDate` varchar(20),
	`isPendingReview` boolean DEFAULT false,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `budget_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cash_flow_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`weekNumber` int NOT NULL,
	`plannedExpense` decimal(15,2),
	`plannedIncome` decimal(15,2),
	`cumulativeExpense` decimal(15,2),
	`cumulativeIncome` decimal(15,2),
	`cashBalance` decimal(15,2),
	`hasAlert` boolean DEFAULT false,
	`alertMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cash_flow_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `generated_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`documentType` enum('proposta_comercial','memoria_calculo') NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`fileUrl` varchar(1000) NOT NULL,
	`fileKey` varchar(500) NOT NULL,
	`version` int DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `generated_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `logistics_costs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`category` enum('frete','bota_fora','deslocamento','hospedagem','alimentacao','equipamentos','outros') NOT NULL,
	`description` text NOT NULL,
	`quantity` decimal(15,4),
	`unit` varchar(20),
	`unitCost` decimal(15,2),
	`totalCost` decimal(15,2),
	`source` varchar(100),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `logistics_costs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `price_cache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`source` enum('sinapi','pini','mercado') NOT NULL,
	`code` varchar(100) NOT NULL,
	`description` text,
	`unit` varchar(20),
	`price` decimal(15,2),
	`region` varchar(100),
	`referenceDate` varchar(20),
	`rawData` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp,
	CONSTRAINT `price_cache_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`contractType` enum('manutencao','obra') NOT NULL,
	`location` varchar(500),
	`restrictions` text,
	`memorialDescritivo` text,
	`memorialFileUrl` varchar(1000),
	`status` enum('draft','processing','review','approved','rejected') NOT NULL DEFAULT 'draft',
	`currentAgentId` int DEFAULT 1,
	`totalCostDirect` decimal(15,2),
	`totalCostIndirect` decimal(15,2),
	`totalTaxes` decimal(15,2),
	`totalBdi` decimal(15,2),
	`totalPrice` decimal(15,2),
	`estimatedDuration` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `schedule_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`budgetItemId` int,
	`phase` varchar(100),
	`description` text NOT NULL,
	`startWeek` int,
	`endWeek` int,
	`duration` int,
	`percentComplete` decimal(5,2) DEFAULT '0',
	`dependencies` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `schedule_items_id` PRIMARY KEY(`id`)
);
