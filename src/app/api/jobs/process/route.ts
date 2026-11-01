import { isAuthorizedJob, unauthorized } from "@/server/auth";
import { processInbox, supabaseStore } from "@/server/processing";
import { getAdminClient } from "@/server/supabase/admin";

export const maxDuration = 300;

// Processes every pending comment. Safe to call repeatedly.
export async function POST(request: Request) {
  if (!isAuthorizedJob(request)) return unauthorized();
  const summary = await processInbox(supabaseStore(getAdminClient()));
  return Response.json(summary, { status: summary.busy ? 409 : 200 });
}
