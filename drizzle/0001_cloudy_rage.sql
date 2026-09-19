CREATE TABLE `achievements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`achievementType` varchar(64) NOT NULL,
	`earnedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `achievements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `challenges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`receiptId` int NOT NULL,
	`challengerId` int NOT NULL,
	`challengedId` int NOT NULL,
	`challengerPosition` text NOT NULL,
	`challengerConfidence` int NOT NULL,
	`challengedPosition` text,
	`challengedConfidence` int,
	`status` enum('OPEN','ACCEPTED','RESOLVED') NOT NULL DEFAULT 'OPEN',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `challenges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dailyChallenges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`prompt` text NOT NULL,
	`category` varchar(32) NOT NULL,
	`publishDate` timestamp NOT NULL,
	`resolutionDate` timestamp NOT NULL,
	`status` enum('OPEN','CLOSED') NOT NULL DEFAULT 'OPEN',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `dailyChallenges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `receipts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`prediction` text NOT NULL,
	`category` varchar(32) NOT NULL,
	`confidence` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`resolutionDate` timestamp NOT NULL,
	`status` enum('LOCKED','PENDING','RIGHT','WRONG','PARTIALLY RIGHT','TOO EARLY') NOT NULL DEFAULT 'PENDING',
	`result` text,
	`visibility` enum('PUBLIC','PRIVATE') NOT NULL DEFAULT 'PUBLIC',
	`challengeUserId` int,
	`dailyChallengeId` int,
	`resolvedAt` timestamp,
	CONSTRAINT `receipts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `username` varchar(40);--> statement-breakpoint
ALTER TABLE `users` ADD `avatar` varchar(500);--> statement-breakpoint
ALTER TABLE `users` ADD `currentStreak` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `longestStreak` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `accuracy` int DEFAULT 0 NOT NULL;