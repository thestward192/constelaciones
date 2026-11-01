import { isAuthorizedJob, unauthorized } from "@/server/auth";
import { runHourly } from "@/server/instagram/hourly";
import { getAdminClient } from "@/server/supabase/admin";

export const maxDuration = 300;

// Called every hour by Supabase (pg_cron + pg_net, see scripts/schedule-hourly.ts):
// renew the Instagram token when due, import the open days' comments, process and publish.
export async function POST(request: Request) {
  if (!isAuthorizedJob(request)) return unauthorized();
  const summary = await runHourly(getAdminClient());
  return Response.json(summary);
}
