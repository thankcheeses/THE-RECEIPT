CREATE TABLE `retiredUsernames` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(40) NOT NULL,
	`retiredAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `retiredUsernames_id` PRIMARY KEY(`id`),
	CONSTRAINT `retiredUsernames_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
ALTER TABLE `challenges` MODIFY COLUMN `challengerId` int;--> statement-breakpoint
ALTER TABLE `challenges` MODIFY COLUMN `challengedId` int;--> statement-breakpoint
ALTER TABLE `moderationActions` MODIFY COLUMN `moderatorId` int;--> statement-breakpoint
ALTER TABLE `receiptInteractions` MODIFY COLUMN `userId` int;--> statement-breakpoint
ALTER TABLE `receiptReports` MODIFY COLUMN `reporterId` int;--> statement-breakpoint
ALTER TABLE `receipts` MODIFY COLUMN `userId` int;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_username_unique` UNIQUE(`username`);