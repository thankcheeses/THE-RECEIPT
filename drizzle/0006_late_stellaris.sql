CREATE TABLE `moderationActions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`receiptId` int NOT NULL,
	`moderatorId` int NOT NULL,
	`action` enum('HIDE','RESTORE','DISMISS') NOT NULL,
	`resultingStatus` enum('VISIBLE','HIDDEN') NOT NULL,
	`note` text,
	`reportsClosed` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `moderationActions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `receiptReports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`receiptId` int NOT NULL,
	`reporterId` int NOT NULL,
	`reason` enum('HARASSMENT','HATE','VIOLENCE','SEXUAL','SELF_HARM','PRIVACY','IMPERSONATION','SPAM','ILLEGAL','OTHER') NOT NULL,
	`detail` text,
	`status` enum('OPEN','ACTIONED','DISMISSED') NOT NULL DEFAULT 'OPEN',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`resolvedAt` timestamp,
	`resolvedBy` int,
	CONSTRAINT `receiptReports_id` PRIMARY KEY(`id`),
	CONSTRAINT `receiptReports_receipt_reporter` UNIQUE(`receiptId`,`reporterId`)
);
--> statement-breakpoint
ALTER TABLE `receipts` ADD `moderationStatus` enum('VISIBLE','HIDDEN') DEFAULT 'VISIBLE' NOT NULL;--> statement-breakpoint
CREATE INDEX `moderationActions_receipt_id` ON `moderationActions` (`receiptId`,`id`);--> statement-breakpoint
CREATE INDEX `receiptReports_status_id` ON `receiptReports` (`status`,`id`);--> statement-breakpoint
CREATE INDEX `receiptReports_receipt_id` ON `receiptReports` (`receiptId`,`id`);--> statement-breakpoint
CREATE INDEX `receiptReports_reporter_created` ON `receiptReports` (`reporterId`,`createdAt`);