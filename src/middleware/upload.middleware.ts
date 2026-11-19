import multer from "multer";
import { fromBuffer } from "file-type";
import sharp from "sharp";
import { Request, Response, NextFunction } from "express";
import { BadRequestError } from "../utils/customError.util";

// sharp otherwise uses one thread per CPU core; on shared hosting each thread
// counts against the account's process limit. Uploads are rare, so one will do.
sharp.concurrency(1);

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
export const MAX_FILES_PER_REQUEST = 10;
const MAX_DIMENSION = 2000; // px — cap the longest edge

// sharp re-encodes these (which drops EXIF/metadata and caps dimensions).
// Animated GIFs are passed through untouched to avoid flattening the animation.
const REPROCESSABLE = new Set(["image/jpeg", "image/png", "image/webp"]);

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES_PER_REQUEST },
  fileFilter: (_req, file, cb) => {
    // Header-level check — client-reported MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new BadRequestError("Only JPEG, PNG, WebP, and GIF images are allowed"));
    }
    cb(null, true);
  },
});

// Runs after multer. Validates the real file bytes (not just the Content-Type
// header), then strips metadata (EXIF) and caps dimensions by re-encoding through
// sharp. Mutates each file in place so the storage upload uses the sanitised image.
export const validateImageBuffer = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  const files: Express.Multer.File[] = req.file
    ? [req.file]
    : Array.isArray(req.files)
    ? req.files
    : Object.values(req.files ?? {}).flat();

  try {
    for (const file of files) {
      const detected = await fromBuffer(file.buffer);
      if (!detected || !ALLOWED_MIME_TYPES.includes(detected.mime)) {
        return next(new BadRequestError("Uploaded file is not a valid image"));
      }
      file.mimetype = detected.mime;

      if (REPROCESSABLE.has(detected.mime)) {
        // .rotate() bakes in EXIF orientation before metadata is dropped.
        const processed = await sharp(file.buffer, { failOn: "none" })
          .rotate()
          .resize({
            width: MAX_DIMENSION,
            height: MAX_DIMENSION,
            fit: "inside",
            withoutEnlargement: true,
          })
          .toBuffer();

        file.buffer = processed;
        file.size = processed.length;
      }
    }
    next();
  } catch {
    next(new BadRequestError("Could not process uploaded file"));
  }
};

// Ready-made chains for routes.
export const uploadSingleImage = (field: string) => [
  upload.single(field),
  validateImageBuffer,
];

// Several named single-image fields in one request (e.g. "image" + "actualImage").
// Files arrive in req.files as { fieldName: [file] }.
export const uploadImageFields = (fields: string[]) => [
  upload.fields(fields.map((name) => ({ name, maxCount: 1 }))),
  validateImageBuffer,
];

export const uploadImages = (field: string, maxCount = MAX_FILES_PER_REQUEST) => [
  upload.array(field, maxCount),
  validateImageBuffer,
];
