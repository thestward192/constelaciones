import type { SupabaseClient } from "@supabase/supabase-js";

// The only place that knows where public files live. To move them to Cloudflare R2
// (docs/constelaciones.md, 10.6), write another PublicStorage and swap it here.

export interface PutOptions {
  contentType: string;
  /** Seconds browsers and the CDN may keep the file. */
  cacheSeconds: number;
  /** Versioned files are never overwritten; only latest.json is. */
  overwrite?: boolean;
}

export interface PublicStorage {
  ensureReady(): Promise<void>;
  put(path: string, body: Buffer | string, options: PutOptions): Promise<void>;
  list(folder: string): Promise<string[]>;
  remove(paths: string[]): Promise<void>;
  publicUrl(path: string): string;
}

export const SKY_BUCKET = "files";
export const IMMUTABLE = 31_536_000; // one year
export const SHORT = 60;

/** Public base URL of the sky files, usable from the browser. */
export function skyFilesBaseUrl(supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL): string {
  return `${supabaseUrl}/storage/v1/object/public/${SKY_BUCKET}`;
}

export function supabaseStorage(db: SupabaseClient): PublicStorage {
  const bucket = () => db.storage.from(SKY_BUCKET);
  return {
    async ensureReady() {
      const { data } = await db.storage.getBucket(SKY_BUCKET);
      if (data) return;
      const { error } = await db.storage.createBucket(SKY_BUCKET, {
        public: true,
        allowedMimeTypes: ["application/json", "image/webp"],
        fileSizeLimit: "5MB",
      });
      if (error && !/already exists/i.test(error.message)) {
        throw new Error(`Could not create bucket ${SKY_BUCKET}: ${error.message}`);
      }
    },
    async put(path, body, { contentType, cacheSeconds, overwrite = false }) {
      const { error } = await bucket().upload(
        path,
        typeof body === "string" ? Buffer.from(body) : body,
        {
          contentType,
          cacheControl: String(cacheSeconds),
          upsert: overwrite,
        },
      );
      // A versioned file that already exists has the same content: nothing to do.
      if (error && !(!overwrite && /exists|duplicate/i.test(error.message))) {
        throw new Error(`Could not upload ${path}: ${error.message}`);
      }
    },
    async list(folder) {
      const { data, error } = await bucket().list(folder, { limit: 1000 });
      if (error) throw new Error(`Could not list ${folder}: ${error.message}`);
      return data.map((f) => `${folder}/${f.name}`);
    },
    async remove(paths) {
      if (!paths.length) return;
      const { error } = await bucket().remove(paths);
      if (error) throw new Error(`Could not remove files: ${error.message}`);
    },
    publicUrl(path) {
      return `${skyFilesBaseUrl()}/${path}`;
    },
  };
}
