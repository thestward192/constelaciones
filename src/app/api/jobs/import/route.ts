import { isAuthorizedJob, unauthorized } from "@/server/auth";
import { runJob } from "@/server/admin/jobs";
import { ImportError, importComments, type IncomingComment } from "@/server/import";
import { getAdminClient } from "@/server/supabase/admin";

// Manual import: POST { day: number, comments: [{ username, text? }] }
export async function POST(request: Request) {
  if (!isAuthorizedJob(request)) return unauthorized();

  let body: { day?: unknown; comments?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "El cuerpo debe ser JSON." }, { status: 400 });
  }

  try {
    const db = getAdminClient();
    const summary = await runJob(db, "import", () =>
      importComments(db, Number(body.day), body.comments as IncomingComment[]),
    );
    return Response.json(summary);
  } catch (error) {
    if (error instanceof ImportError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
