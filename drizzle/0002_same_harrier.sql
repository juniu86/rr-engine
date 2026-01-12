ALTER TABLE `projects` ADD `parentProjectId` int;--> statement-breakpoint
ALTER TABLE `projects` ADD `revisionNumber` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `projects` ADD `originalName` varchar(255);