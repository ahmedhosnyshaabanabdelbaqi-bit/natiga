/** Environment for every e2e worker (before any app module is imported). */
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL ??= 'silent';
process.env.JOBS_ENABLED ??= 'false';
process.env.SWAGGER_ENABLED ??= 'true';
