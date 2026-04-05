CREATE TABLE `conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`scenarioId` int,
	`title` varchar(200),
	`duration` int DEFAULT 0,
	`messageCount` int DEFAULT 0,
	`avgScore` float,
	`feedback` text,
	`grammarIssues` json,
	`status` enum('active','completed','archived') DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `learningRecords` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`date` varchar(10) NOT NULL,
	`practiceSeconds` int DEFAULT 0,
	`conversationCount` int DEFAULT 0,
	`avgPronunciationScore` float,
	`wordsSpoken` int DEFAULT 0,
	`weakAreas` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `learningRecords_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`role` enum('user','assistant','system') NOT NULL,
	`content` text NOT NULL,
	`audioUrl` varchar(500),
	`pronunciationScore` float,
	`pronunciationFeedback` json,
	`grammarCorrections` json,
	`expressionSuggestions` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scenarios` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(200) NOT NULL,
	`titleZh` varchar(200) NOT NULL,
	`description` text NOT NULL,
	`descriptionZh` text NOT NULL,
	`category` enum('daily','travel','business','academic','social') NOT NULL,
	`difficulty` enum('beginner','intermediate','advanced') NOT NULL,
	`icon` varchar(50) DEFAULT 'MessageCircle',
	`systemPrompt` text NOT NULL,
	`openingMessage` text NOT NULL,
	`vocabulary` json,
	`isActive` int DEFAULT 1,
	`sortOrder` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `scenarios_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `level` varchar(4) DEFAULT 'A2';--> statement-breakpoint
ALTER TABLE `users` ADD `totalPracticeSeconds` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `users` ADD `totalConversations` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `users` ADD `avgPronunciationScore` float DEFAULT 0;