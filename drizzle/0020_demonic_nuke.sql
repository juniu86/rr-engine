CREATE TABLE `price_database_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`source` varchar(20) NOT NULL,
	`code` varchar(50) NOT NULL,
	`description` text NOT NULL,
	`unit` varchar(20) NOT NULL,
	`price` decimal(12,4) NOT NULL,
	`state` varchar(5),
	`category` varchar(100),
	`referenceDate` date NOT NULL,
	`componentsJson` json,
	`dataSource` varchar(50),
	`scrapedAt` timestamp NOT NULL DEFAULT (now()),
	`isActive` boolean NOT NULL DEFAULT true,
	CONSTRAINT `price_database_entries_id` PRIMARY KEY(`id`),
	CONSTRAINT `price_db_uq_source_code_state_date` UNIQUE(`source`,`code`,`state`,`referenceDate`)
);
--> statement-breakpoint
CREATE INDEX `price_db_search_idx` ON `price_database_entries` (`source`,`state`,`isActive`);--> statement-breakpoint
CREATE INDEX `price_db_description_idx` ON `price_database_entries` (`description`);--> statement-breakpoint
CREATE INDEX `price_db_active_source_idx` ON `price_database_entries` (`isActive`,`source`);