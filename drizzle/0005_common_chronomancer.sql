CREATE TABLE `receiptInteractions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`receiptId` int NOT NULL,
	`userId` int NOT NULL,
	`type` enum('AGREE','DISAGREE','SUPPORT','REACT') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `receiptInteractions_id` PRIMARY KEY(`id`),
	CONSTRAINT `receiptInteractions_receipt_user` UNIQUE(`receiptId`,`userId`)
);
--> statement-breakpoint
ALTER TABLE `receipts` ADD `semanticType` enum('PREDICTION','GOAL','PERSONAL','FUN');--> statement-breakpoint
ALTER TABLE `receipts` ADD `derivedFromId` int;--> statement-breakpoint
CREATE INDEX `receiptInteractions_receipt_type` ON `receiptInteractions` (`receiptId`,`type`);--> statement-breakpoint
CREATE INDEX `receipts_visibility_status_resolution` ON `receipts` (`visibility`,`status`,`resolutionDate`);--> statement-breakpoint
CREATE INDEX `receipts_derived_from` ON `receipts` (`derivedFromId`);