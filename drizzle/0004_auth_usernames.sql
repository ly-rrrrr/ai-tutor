ALTER TABLE `users` MODIFY COLUMN `loginMethod` varchar(64) DEFAULT 'password';--> statement-breakpoint
ALTER TABLE `auth_users` ADD `username` varchar(255);--> statement-breakpoint
ALTER TABLE `auth_users` ADD `displayUsername` varchar(255);--> statement-breakpoint
ALTER TABLE `auth_users` ADD CONSTRAINT `auth_users_username_unique` UNIQUE(`username`);