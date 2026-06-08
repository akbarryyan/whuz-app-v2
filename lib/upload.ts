import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { z } from "zod";

export const UPLOAD_FOLDERS = ["promos", "brands", "banners", "payment-methods", "sellers", "site", "footer"] as const;
export type UploadFolder = (typeof UPLOAD_FOLDERS)[number];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const MIME_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * Accepts both legacy absolute URLs (third-party hosting, e.g. https://i.ibb.co.com/...)
 * and local paths produced by /api/upload (e.g. /uploads/promos/xxx.png), so existing
 * stored values keep working while new uploads use local storage.
 */
export const imageRefSchema = z
  .string()
  .refine(
    (value) => /^https?:\/\//i.test(value) || value.startsWith("/uploads/"),
    "URL atau path gambar tidak valid"
  );

export class UploadError extends Error {
  constructor(message: string, public status: number = 400) {
    super(message);
  }
}

export async function saveUploadedImage(file: File, folder: UploadFolder): Promise<string> {
  if (!MIME_EXTENSIONS[file.type]) {
    throw new UploadError("Format gambar tidak didukung. Gunakan PNG, JPG, WEBP, atau GIF.");
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new UploadError("Ukuran gambar maksimal 5MB.");
  }

  const extension = MIME_EXTENSIONS[file.type];
  const filename = `${randomUUID()}.${extension}`;
  const dir = path.join(process.cwd(), "public", "uploads", folder);
  await mkdir(dir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, filename), buffer);

  return `/uploads/${folder}/${filename}`;
}
