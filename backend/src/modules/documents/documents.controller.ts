import { Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { AuthRequest } from '../../middleware/auth.middleware';
import { documentFileFilter } from '../../middleware/uploadFilters';
import { documentsService } from './documents.service';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 }, fileFilter: documentFileFilter });

const createDocumentSchema = z.object({
    category: z.enum(['training', 'policy']),
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
});

const listQuerySchema = z.object({
    category: z.enum(['training', 'policy']),
});

export class DocumentsController {
    static uploadMiddleware = upload.single('file');

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
            if (!req.file) {
                res.status(400).json({ error: 'A file is required' });
                return;
            }
            const doc = await documentsService.create(
                { ...validatedData, uploadedById: req.user?.userId },
                req.file
            );
            res.status(201).json({ data: doc });
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
            const { buffer, doc } = await documentsService.getFileBuffer(id);
            res.setHeader('Content-Type', doc.mimeType);
            const disposition = req.query.download ? 'attachment' : 'inline';
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
