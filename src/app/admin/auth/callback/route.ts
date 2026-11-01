import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { isAdminEmail } from "@/server/admin/emails";
import { createSessionClient } from "@/server/admin/session";

// Where the email link lands. Supports both link styles Supabase can send:
// ?code=... (default template) and ?token_hash=...&type=... (custom template).
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const supabase = await createSessionClient();
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  const { data, error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { data: { user: null }, error: new Error("missing code") };

  const email = data.user?.email;
  if (error || !email || !isAdminEmail(email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/admin/login?error=enlace", url));
  }
  return NextResponse.redirect(new URL("/admin", url));
}
