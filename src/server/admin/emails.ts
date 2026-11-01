/** Emails allowed into the admin panel (ADMIN_EMAILS, comma separated). */
export function adminEmails(value = process.env.ADMIN_EMAILS ?? ""): string[] {
  return value
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string, list = adminEmails()): boolean {
  return list.includes(email.trim().toLowerCase());
}
