// Where the public sky files live (Supabase Storage today). Shared by server and browser.
export const SKY_BUCKET = "files";

export function skyFilesBaseUrl(
  override = process.env.NEXT_PUBLIC_SKY_FILES_URL,
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
): string {
  return override || `${supabaseUrl}/storage/v1/object/public/${SKY_BUCKET}`;
}
