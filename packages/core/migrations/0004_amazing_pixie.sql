CREATE TABLE `short_link` (
	`id` int AUTO_INCREMENT NOT NULL,
	`time_created` timestamp(3) NOT NULL DEFAULT (now()),
	`time_updated` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
	`time_deleted` timestamp(3),
	`slug` varchar(255) NOT NULL,
	`url` text NOT NULL,
	`click_count` bigint NOT NULL DEFAULT 0,
	CONSTRAINT `short_link_id` PRIMARY KEY(`id`)
);
