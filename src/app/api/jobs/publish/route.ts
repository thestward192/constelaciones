import { isAuthorizedJob, unauthorized } from "@/server/auth";
import { publishSky } from "@/server/publish/publish";
import { supabaseStorage } from "@/server/storage";
import { getAdminClient } from "@/server/supabase/admin";

export const maxDuration = 300;

// Regenerates the public files (changed constellations, index, spiral image).
export async function POST(request: Request) {
  if (!isAuthorizedJob(request)) return unauthorized();
  const db = getAdminClient();
  const summary = await publishSky(db, supabaseStorage(db));
  return Response.json(summary, { status: summary.busy ? 409 : 200 });
}
