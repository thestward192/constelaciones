import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { isAdminEmail } from "./emails";

/** Supabase client bound to the request cookies (the admin's session), with the public key. */
export async function createSessionClient() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            for (const { name, value, options } of list) store.set(name, value, options);
          } catch {
            // Server Components cannot set cookies; the proxy refreshes the session instead.
          }
        },
      },
    },
  );
}

/**
 * The signed-in admin, or a redirect to the login page. Every admin page and every admin
 * action calls this: the allowed emails are checked on the server each time.
 */
export async function requireAdmin(): Promise<{ email: string }> {
  await connection(); // per request: never prerendered
  const supabase = await createSessionClient();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email;
  if (!email || !isAdminEmail(email)) redirect("/admin/login");
  return { email };
}
