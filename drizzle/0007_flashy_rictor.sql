ALTER TABLE `projects` ADD `bdiPercentual` decimal(6,2);--> statement-breakpoint
ALTER TABLE `projects` ADD `bdiPreset` enum('padrao','reduzido','majorado','personalizado') DEFAULT 'padrao';