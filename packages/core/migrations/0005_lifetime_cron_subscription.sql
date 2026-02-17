CREATE TABLE IF NOT EXISTS `lifetime_cron_subscription` (
	`id` char(30) NOT NULL,
	`time_created` timestamp(3) NOT NULL DEFAULT (now()),
	`time_updated` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
	`time_deleted` timestamp(3),
	`time_next` timestamp(3),
	`user_id` char(30) NOT NULL,
	`product_variant_id` char(30) NOT NULL,
	`quantity` int NOT NULL,
	`shipping_id` char(30) NOT NULL,
	PRIMARY KEY (`id`),
	CONSTRAINT `unique` UNIQUE (`user_id`, `product_variant_id`)
);
