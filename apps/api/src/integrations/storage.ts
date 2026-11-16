import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';

/**
 * Two visibility levels:
 *  - public:  vehicle photos, package images → served directly / via CDN.
 *  - private: KYC & vehicle documents → only via authorised /api/files/:key route or short-lived S3 URLs.
 */
export type Visibility = 'public' | 'private';

export const UPLOAD_ROOT = path.resolve(process.cwd(), 'uploads');

const ALLOWED: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

export function assertAllowedMime(mime: string, allowPdf: boolean) {
  if (!ALLOWED[mime] || (!allowPdf && mime === 'application/pdf')) {
    throw Object.assign(new Error(`Unsupported file type ${mime}`), { status: 400 });
  }
}

/** Verify magic bytes so a renamed .exe cannot pass as an image. */
export function sniffMime(buf: Buffer): string | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buf.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  return null;
}

let s3: S3Client | null = null;
const getS3 = () =>
  (s3 ??= new S3Client({
    region: env.S3_REGION,
    credentials: env.S3_ACCESS_KEY_ID
      ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
      : undefined,
  }));

export async function putFile(buf: Buffer, mime: string, visibility: Visibility, folder: string): Promise<string> {
  const ext = ALLOWED[mime] ?? '';
  const key = `${visibility}/${folder}/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}${ext}`;
  if (env.STORAGE_DRIVER === 's3') {
    await getS3().send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        Body: buf,
        ContentType: mime,
        ServerSideEncryption: 'AES256',
        CacheControl: visibility === 'public' ? 'public, max-age=31536000, immutable' : 'private, no-store',
      }),
    );
  } else {
    const full = path.join(UPLOAD_ROOT, key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, buf);
  }
  return key;
}

/** Public URL for public keys (images). */
export function publicUrl(key: string): string {
  // Already a URL (absolute, or a local /uploads path) → idempotent.
  if (/^https?:\/\//.test(key) || key.startsWith('/')) return key;
  if (env.STORAGE_DRIVER === 's3') {
    return env.S3_PUBLIC_BASE_URL
      ? `${env.S3_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`
      : `https://${env.S3_BUCKET}.s3.${env.S3_REGION}.amazonaws.com/${key}`;
  }
  return `/uploads/${key}`;
}

/** Returns either a short-lived URL (S3) or the local absolute path for streaming. */
export async function privateFile(key: string): Promise<{ url?: string; localPath?: string }> {
  if (!key.startsWith('private/') || key.includes('..') || key.includes('\\')) throw new AppError(404, 'Document not found', 'NOT_FOUND');
  if (env.STORAGE_DRIVER === 's3') {
    const url = await getSignedUrl(getS3(), new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }), {
      expiresIn: 300,
    });
    return { url };
  }
  return { localPath: path.join(UPLOAD_ROOT, key) };
}

export async function deleteFile(key: string) {
  if (/^https?:\/\//.test(key)) return;
  if (env.STORAGE_DRIVER === 's3') {
    await getS3().send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  } else {
    await fs.rm(path.join(UPLOAD_ROOT, key), { force: true });
  }
}
