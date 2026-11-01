import { isAuthorizedJob, unauthorized } from "@/server/auth";
import { runJob } from "@/server/admin/jobs";
import { processInbox, supabaseStore } from "@/server/processing";
import { publishSky } from "@/server/publish/publish";
import { supabaseStorage } from "@/server/storage";
import { getAdminClient } from "@/server/supabase/admin";

export const maxDuration = 300;

// Processes every pending comment, then publishes the public files. Safe to call repeatedly.
export async function POST(request: Request) {
  if (!isAuthorizedJob(request)) return unauthorized();
  const db = getAdminClient();
  const processed = await runJob(db, "process", () => processInbox(supabaseStore(db)));
  if (processed.busy) return Response.json({ processed }, { status: 409 });
  const published = await runJob(db, "publish", () => publishSky(db, supabaseStorage(db)));
  return Response.json({ processed, published });
}
