ALTER TABLE `dailyChallenges` MODIFY COLUMN `status` enum('DRAFT','OPEN','CLOSED','REJECTED') NOT NULL DEFAULT 'DRAFT';--> statement-breakpoint
ALTER TABLE `dailyChallenges` ADD `approvedBy` int;--> statement-breakpoint
ALTER TABLE `dailyChallenges` ADD `approvedAt` timestamp;--> statement-breakpoint
ALTER TABLE `dailyChallenges` ADD `reviewNote` text;