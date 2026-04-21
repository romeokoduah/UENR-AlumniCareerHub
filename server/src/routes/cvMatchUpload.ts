// CV Match — PDF / DOCX upload endpoint.
// Mounted at /api/cv-match/upload. Multer runs first to parse the
// multipart body, then requireAuth enforces the JWT.

import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadDocument } from '../lib/upload.js';
import { extractCvText, CvExtractError } from '../lib/cvExtract.js';

const router = Router();

router.post('/', uploadDocument.single('file') as any, requireAuth, async (req: any, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_FILE', message: 'No file uploaded' }
      });
    }
    const result = await extractCvText(req.file.buffer, req.file.mimetype, req.file.originalname);

    prisma.careerToolsActivity.create({
      data: {
        userId: req.auth!.sub,
        tool: 'cv-match',
        action: result.format === 'pdf' ? 'pdf_upload' : 'docx_upload',
        metadata: { charCount: result.charCount }
      }
    }).catch(() => { /* best-effort */ });

    res.json({
      success: true,
      data: { text: result.text, charCount: result.charCount, format: result.format }
    });
  } catch (e: any) {
    if (e instanceof CvExtractError) {
      return res.status(400).json({
        success: false,
        error: { code: e.code, message: e.message }
      });
    }
    next(e);
  }
});

export default router;
