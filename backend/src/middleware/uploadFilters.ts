import { Request } from 'express';
import type { FileFilterCallback } from 'multer';

/**
 * Shared multer `fileFilter` callbacks. Multer's `limits.fileSize` alone only caps size —
 * without a fileFilter, any content type is accepted and later served back verbatim through
 * the storage proxy route, which is a stored-content risk (e.g. an uploaded HTML/SVG file
 * with a script payload). Reject anything outside the expected type up front instead.
 */

/** Rejection carries `status = 400` so app.ts's global error handler reports it as a client error, not a 500. */
class UnsupportedFileTypeError extends Error {
    status = 400;
}

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/** For photo/signature/branding-logo uploads — accepts common raster image types only. */
export const imageFileFilter = (
    _req: Request,
    file: Express.Multer.File,
    cb: FileFilterCallback
): void => {
    if (IMAGE_MIME_TYPES.has(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new UnsupportedFileTypeError('Only JPEG, PNG, WebP, or GIF image files are allowed'));
    }
};

const SPREADSHEET_MIME_TYPES = new Set([
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
    'text/csv',
]);

/** For bulk-import uploads — accepts Excel/CSV spreadsheet files only. */
export const spreadsheetFileFilter = (
    _req: Request,
    file: Express.Multer.File,
    cb: FileFilterCallback
): void => {
    if (SPREADSHEET_MIME_TYPES.has(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new UnsupportedFileTypeError('Only .xlsx, .xls, or .csv spreadsheet files are allowed'));
    }
};

const DOCUMENT_MIME_TYPES = new Set([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
    'application/vnd.ms-powerpoint', // .ppt
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/msword', // .doc
]);

/** For the Trainings/Policy & Procedures library — accepts PowerPoint, PDF, or Word files only. */
export const documentFileFilter = (
    _req: Request,
    file: Express.Multer.File,
    cb: FileFilterCallback
): void => {
    if (DOCUMENT_MIME_TYPES.has(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new UnsupportedFileTypeError('Only PowerPoint, PDF, or Word files are allowed'));
    }
};
