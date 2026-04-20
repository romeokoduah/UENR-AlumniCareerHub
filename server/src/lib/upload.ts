import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { put } from '@vercel/blob';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Use Vercel Blob when BLOB_READ_WRITE_TOKEN is set (auto-injected on Vercel
// when a Blob store is linked to the project). Locally, if the token is in
// .env, dev uploads go to the same prod store. Without it, we fall back to
// writing under server/uploads/ and serving via the /uploads static route.
const USE_BLOB = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

export const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');
const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
if (!USE_BLOB && !IS_SERVERLESS && !fs.existsSync(UPLOAD_DIR)) {
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  } catch {
    // Read-only FS — local disk fallback not available here.
  }
}

export const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG, WebP, and GIF images are allowed'));
    }
    cb(null, true);
  }
});

// Document uploads (vault, CV exports, cover letters). Accepts PDFs, common
// office formats, and plain text up to 25 MB.
const ALLOWED_DOC_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'image/jpeg',
  'image/png',
  'image/webp'
]);

export const uploadDocument = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_DOC_MIMES.has(file.mimetype)) {
      return cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
    cb(null, true);
  }
});

export type UploadResult = {
  url: string;
  filename: string;
  size: number;
  mimetype: string;
};

function sanitizeName(original: string): string {
  const ext = path.extname(original).toLowerCase();
  const base = path
    .basename(original, ext)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40);
  return `${Date.now()}-${base || 'image'}${ext}`;
}

export async function storeUpload(file: {
  buffer: Buffer;
  originalname: string;
  size: number;
  mimetype: string;
}): Promise<UploadResult> {
  const filename = sanitizeName(file.originalname);

  if (USE_BLOB) {
    const result = await put(`uenr-career-hub/${filename}`, file.buffer, {
      access: 'public',
      contentType: file.mimetype,
      addRandomSuffix: false
    });
    return {
      url: result.url,
      filename,
      size: file.size,
      mimetype: file.mimetype
    };
  }

  const diskPath = path.join(UPLOAD_DIR, filename);
  await fs.promises.writeFile(diskPath, file.buffer);
  return {
    url: `/uploads/${filename}`,
    filename,
    size: file.size,
    mimetype: file.mimetype
  };
}
