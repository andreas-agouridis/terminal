CREATE TABLE `system_job_run` (
	`name` varchar(255) NOT NULL,
	`time_created` timestamp(3) NOT NULL DEFAULT (now()),
	`time_updated` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
	`time_deleted` timestamp(3),
	`time_last_run` timestamp(3),
	`metadata` json,
	CONSTRAINT `system_job_run_name` PRIMARY KEY(`name`)
);

