ALTER TABLE `notifications` MODIFY COLUMN `type` enum('CHALLENGE_RECEIVED','CHALLENGE_ACCEPTED','RECEIPT_RESOLVED','RECEIPT_DUE') NOT NULL;--> statement-breakpoint
ALTER TABLE `notifications` ADD `receiptId` int;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_type_receipt` UNIQUE(`userId`,`type`,`receiptId`);