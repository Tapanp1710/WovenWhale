/** Runs every background job once — for cron / scheduled functions. */
import { sqlClient } from "../db/client";
import { JOBS, runJob } from "./index";

for (const name of Object.keys(JOBS) as (keyof typeof JOBS)[]) await runJob(name);
await sqlClient.end();
