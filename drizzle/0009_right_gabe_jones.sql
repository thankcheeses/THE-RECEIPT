ALTER TABLE `receipts` MODIFY COLUMN `resolutionDate` timestamp;--> statement-breakpoint
ALTER TABLE `receipts` MODIFY COLUMN `semanticType` enum('PREDICTION','GOAL','PERSONAL','FUN','MEMORY','DREAM');--> statement-breakpoint
ALTER TABLE `receipts` ADD `title` varchar(120);--> statement-breakpoint
CREATE INDEX `receipts_user_type_id` ON `receipts` (`userId`,`semanticType`,`id`);