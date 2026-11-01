import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Jobs and imports are protected with `Authorization: Bearer <CRON_SECRET>`.
 * Vercel Cron sends this header itself; the admin panel (phase 9) calls them from the server.
 */
export function isAuthorizedJob(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || !header?.startsWith("Bearer ")) return false;
  // Compare digests so the comparison takes the same time whatever the input length.
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(header.slice("Bearer ".length)), digest(secret));
}

export function unauthorized(): Response {
  return Response.json({ error: "No autorizado." }, { status: 401 });
}
