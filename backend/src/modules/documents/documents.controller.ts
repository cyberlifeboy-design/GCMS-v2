import { Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { AuthRequest } from '../../middleware/auth.middleware';
import { documentFileFilter } from '../../middleware/uploadFilters';
import { documentsService } from './documents.service';
import { settingsService } from '../settings/settings.service';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 }, fileFilter: documentFileFilter });

const createDocumentSchema = z.object({
    category: z.enum(['training', 'policy']),
    // Only meaningful for a single-file upload — a multi-file batch always titles
    // each document from its own filename (see DocumentsController.create).
    title: z.string().max(200).optional(),
    description: z.string().max(2000).optional(),
});

const listQuerySchema = z.object({
    category: z.enum(['training', 'policy']),
});

function titleFromFilename(filename: string): string {
    const withoutExt = filename.replace(/\.[^./]+$/, '');
    return withoutExt.trim() || filename;
}

export class DocumentsController {
    static uploadMiddleware = upload.array('files', 10);

    static async list(req: AuthRequest, res: Response) {
        try {
            const { category } = listQuerySchema.parse(req.query);
            const documents = await documentsService.list(category);
            res.json({ data: documents });
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else {
                res.status(500).json({ error: 'Failed to list documents' });
            }
        }
    }

    static async create(req: AuthRequest, res: Response) {
        try {
            const validatedData = createDocumentSchema.parse(req.body);
            const files = req.files as Express.Multer.File[] | undefined;
            if (!files || files.length === 0) {
                res.status(400).json({ error: 'At least one file is required' });
                return;
            }
            const useSharedTitle = files.length === 1 && !!validatedData.title;
            const created = [];
            for (const file of files) {
                const doc = await documentsService.create(
                    {
                        category: validatedData.category,
                        title: useSharedTitle ? validatedData.title! : titleFromFilename(file.originalname),
                        description: validatedData.description,
                        uploadedById: req.user?.userId,
                    },
                    file
                );
                created.push(doc);
            }
            res.status(201).json({ data: created });
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else {
                res.status(500).json({ error: 'Failed to upload document' });
            }
        }
    }

    static async remove(req: AuthRequest, res: Response) {
        try {
            const id = req.params.id as string;
            await documentsService.delete(id);
            res.json({ success: true });
        } catch (error: any) {
            if (error.message === 'Document not found') {
                res.status(404).json({ error: error.message });
            } else {
                res.status(500).json({ error: 'Failed to delete document' });
            }
        }
    }

    static async getFile(req: AuthRequest, res: Response) {
        try {
            const id = req.params.id as string;
            const wantsDownload = !!req.query.download;
            const isManager = req.user?.role === 'SuperAdmin';
            if (wantsDownload && !isManager) {
                const settings = await settingsService.get();
                if (settings.allowDocumentDownloads === false) {
                    res.status(403).json({ error: 'Downloads are currently disabled' });
                    return;
                }
            }
            const { buffer, doc } = await documentsService.getFileBuffer(id);
            res.setHeader('Content-Type', doc.mimeType);
            const disposition = wantsDownload ? 'attachment' : 'inline';
            res.setHeader('Content-Disposition', `${disposition}; filename="${doc.originalName.replace(/"/g, '')}"`);
            res.send(buffer);
        } catch (error: any) {
            if (error.message === 'Document not found') {
                res.status(404).json({ error: error.message });
            } else {
                res.status(500).json({ error: 'Failed to load document' });
            }
        }
    }
}
