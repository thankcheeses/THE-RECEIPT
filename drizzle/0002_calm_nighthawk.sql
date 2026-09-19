CREATE TABLE `analyticsEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`event` varchar(64) NOT NULL,
	`properties` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `analyticsEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dailyActivity` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`activityDate` timestamp NOT NULL,
	`dailyChallengeId` int,
	`receiptId` int,
	`streakAfter` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `dailyActivity_id` PRIMARY KEY(`id`),
	CONSTRAINT `dailyActivity_user_date` UNIQUE(`userId`,`activityDate`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`type` enum('CHALLENGE_RECEIVED','CHALLENGE_ACCEPTED','RECEIPT_RESOLVED') NOT NULL,
	`title` varchar(160) NOT NULL,
	`body` text,
	`linkPath` varchar(200),
	`actorId` int,
	`challengeId` int,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `lastDailyDate` timestamp;