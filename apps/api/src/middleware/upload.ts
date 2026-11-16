import multer from 'multer';
import { badRequest } from '../lib/errors.js';
import { putFile, sniffMime, type Visibility } from '../integrations/storage.js';

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 10 },
});

/** Validate by magic bytes (not the client-supplied mimetype) and store. Returns the storage key. */
export async function storeUpload(file: Express.Multer.File | undefined, visibility: Visibility, folder: string, allowPdf = visibility === 'private'): Promise<string> {
  if (!file) throw badRequest('File is required');
  const mime = sniffMime(file.buffer);
  if (!mime || (mime === 'application/pdf' && !allowPdf)) {
    throw badRequest(allowPdf ? 'Only JPG, PNG, WEBP or PDF files are allowed' : 'Only JPG, PNG or WEBP images are allowed');
  }
  return putFile(file.buffer, mime, visibility, folder);
}
