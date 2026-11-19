import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { promises as fs, constants as fsConstants } from "fs";
import path from "path";
import crypto from "crypto";
import { config } from "../config/env.config";

// Folders images are grouped under — one per uploadable entity.
export type UploadFolder =
  | "services"
  | "projects"
  | "team"
  | "blogs"
  | "testimonials"
  | "clients"
  | "events";

// One interface, two implementations (Supabase / local disk). Call sites only
// ever touch the resolved `StorageService` at the bottom of this file — they
// never import a concrete implementation or branch on environment.
export interface IStorageService {
  /** Store an image and return its absolute public URL (what gets persisted). */
  uploadImage(file: Express.Multer.File, folder: UploadFolder): Promise<string>;
  deleteImage(publicUrl: string): Promise<void>;
  deleteImages(publicUrls: string[]): Promise<void>;
  /** Parse a public URL back into a storage key; null for foreign URLs. */
  extractPath(publicUrl: string): string | null;
  /** Throws if storage is unusable. */
  healthCheck(): Promise<void>;
}

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

// Extension from the (already validated) MIME type, never from the client's filename.
const fileName = (file: Express.Multer.File): string =>
  `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${
    EXT_BY_MIME[file.mimetype] ?? "jpg"
  }`;

// ── Supabase Storage (development) ──────────────────────────────────────────
const BUCKET = config.supabaseStorageBucket;

// Created lazily so production never needs Supabase credentials.
let supabaseClient: SupabaseClient | null = null;
const supabase = (): SupabaseClient => {
  if (!supabaseClient) {
    supabaseClient = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });
  }
  return supabaseClient;
};

const SupabaseStorageService: IStorageService = {
  async uploadImage(file, folder) {
    const key = `${folder}/${fileName(file)}`;
    const { error } = await supabase()
      .storage.from(BUCKET)
      .upload(key, file.buffer, { contentType: file.mimetype, upsert: false });
    if (error) {
      throw new Error(`Image upload failed: ${error.message}`);
    }
    return supabase().storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
  },

  async deleteImage(publicUrl) {
    await this.deleteImages([publicUrl]);
  },

  async deleteImages(publicUrls) {
    const keys = publicUrls
      .map((url) => this.extractPath(url))
      .filter((key): key is string => key !== null);
    if (keys.length === 0) return;
    const { error } = await supabase().storage.from(BUCKET).remove(keys);
    if (error) {
      // Orphaned files are harmless — log rather than fail the request.
      console.warn(`⚠️ Failed to delete images from storage: ${error.message}`);
    }
  },

  extractPath(publicUrl) {
    const marker = `/object/public/${BUCKET}/`;
    const idx = publicUrl.indexOf(marker);
    if (idx === -1) return null;
    return decodeURIComponent(publicUrl.slice(idx + marker.length));
  },

  async healthCheck() {
    const { error } = await supabase().storage.from(BUCKET).list("", { limit: 1 });
    if (error) {
      throw new Error(`Storage unreachable: ${error.message}`);
    }
  },
};

// ── Local disk (production: cPanel / VPS) ───────────────────────────────────
const UPLOAD_DIR = path.resolve(config.uploadDir);
export const PUBLIC_UPLOADS_PREFIX = "/uploads"; // matches the express.static mount in app.ts

// Resolve a storage key to an absolute path, refusing anything that escapes
// UPLOAD_DIR (defence-in-depth against path traversal via a crafted URL).
const safeLocalPath = (key: string): string | null => {
  const dest = path.resolve(UPLOAD_DIR, key);
  if (!dest.startsWith(UPLOAD_DIR + path.sep)) return null;
  return dest;
};

const LocalStorageService: IStorageService = {
  async uploadImage(file, folder) {
    const name = fileName(file);
    await fs.mkdir(path.join(UPLOAD_DIR, folder), { recursive: true });
    await fs.writeFile(path.join(UPLOAD_DIR, folder, name), file.buffer);
    return `${config.publicBaseUrl}${PUBLIC_UPLOADS_PREFIX}/${folder}/${name}`;
  },

  async deleteImage(publicUrl) {
    const key = this.extractPath(publicUrl);
    const dest = key && safeLocalPath(key);
    if (!dest) return;
    try {
      await fs.unlink(dest);
    } catch {
      /* already gone / never existed — ignore */
    }
  },

  async deleteImages(publicUrls) {
    await Promise.all(publicUrls.map((url) => this.deleteImage(url)));
  },

  extractPath(publicUrl) {
    // Only URLs this driver issued — anything else (e.g. leftover Supabase
    // URLs) is foreign and left alone.
    const prefix = `${config.publicBaseUrl}${PUBLIC_UPLOADS_PREFIX}/`;
    if (!publicUrl.startsWith(prefix)) return null;
    return decodeURIComponent(publicUrl.slice(prefix.length));
  },

  async healthCheck() {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.access(UPLOAD_DIR, fsConstants.W_OK);
  },
};

// Resolved once at module load. This is the ONLY export call sites use.
export const StorageService: IStorageService = config.isProduction
  ? LocalStorageService
  : SupabaseStorageService;
