import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v2 as cloudinary } from 'cloudinary';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configure Cloudinary automatically from CLOUDINARY_URL env var if set.
// (Format: cloudinary://api_key:api_secret@cloud_name)
const USE_CLOUDINARY = Boolean(process.env.CLOUDINARY_URL || process.env.CLOUDINARY_CLOUD_NAME);
if (USE_CLOUDINARY && !process.env.CLOUDINARY_URL) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

// Local dev fallback — writes to server/uploads/ when Cloudinary isn't set.
// Skip on serverless runtimes where the project directory is read-only.
export const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');
const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
if (!USE_CLOUDINARY && !IS_SERVERLESS && !fs.existsSync(UPLOAD_DIR)) {
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  } catch {
    // Read-only FS — local disk fallback not available here.
  }
}

// Use memory storage universally — the route handler decides whether to
// pipe the buffer to Cloudinary or write it to disk.
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

  if (USE_CLOUDINARY) {
    // Upload buffer to Cloudinary. Returns secure_url (absolute https URL).
    const result: any = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'uenr-career-hub',
          public_id: filename.replace(/\.[^.]+$/, ''),
          resource_type: 'image'
        },
        (err, res) => (err ? reject(err) : resolve(res))
      );
      stream.end(file.buffer);
    });
    return {
      url: result.secure_url,
      filename,
      size: file.size,
      mimetype: file.mimetype
    };
  }

  // Dev fallback: write to disk, serve via /uploads static route.
  const diskPath = path.join(UPLOAD_DIR, filename);
  await fs.promises.writeFile(diskPath, file.buffer);
  return {
    url: `/uploads/${filename}`,
    filename,
    size: file.size,
    mimetype: file.mimetype
  };
}
