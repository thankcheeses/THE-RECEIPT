CREATE INDEX `receipts_visibility_id` ON `receipts` (`visibility`,`id`);--> statement-breakpoint
CREATE INDEX `receipts_visibility_category_id` ON `receipts` (`visibility`,`category`,`id`);--> statement-breakpoint
CREATE INDEX `receipts_user_id` ON `receipts` (`userId`,`id`);