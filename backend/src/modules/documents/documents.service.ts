import { prisma } from '../../config/database';
import { uploadFile, deleteFile, getFileBuffer, DOCUMENT_BUCKETS, uniqueFileToken } from '../../config/storage';

export type DocumentCategory = 'training' | 'policy';

export interface CreateDocumentData {
    category: DocumentCategory;
    title: string;
    description?: string;
    uploadedById?: string;
}

function extOf(filename: string): string {
    const parts = filename.split('.');
    return parts.length > 1 ? `.${parts.pop()}` : '';
}

export class DocumentsService {
    async list(category: DocumentCategory) {
        return prisma.resourceDocument.findMany({
            where: { category },
            orderBy: { createdAt: 'desc' },
        });
    }

    async getById(id: string) {
        return prisma.resourceDocument.findUnique({ where: { id } });
    }

    async create(data: CreateDocumentData, file: { originalname: string; mimetype: string; buffer: Buffer; size: number }) {
        const fileName = `${data.category}_${uniqueFileToken()}${extOf(file.originalname)}`;
        await uploadFile(DOCUMENT_BUCKETS.DOCUMENTS, fileName, file.buffer, file.mimetype);

        return prisma.resourceDocument.create({
            data: {
                category: data.category,
                title: data.title,
                description: data.description,
                fileName,
                originalName: file.originalname,
                mimeType: file.mimetype,
                fileSize: file.size,
                uploadedById: data.uploadedById,
            },
        });
    }

    async delete(id: string) {
        const doc = await prisma.resourceDocument.findUnique({ where: { id } });
        if (!doc) throw new Error('Document not found');
        await deleteFile(DOCUMENT_BUCKETS.DOCUMENTS, doc.fileName);
        await prisma.resourceDocument.delete({ where: { id } });
    }

    async getFileBuffer(id: string): Promise<{ buffer: Buffer; doc: { originalName: string; mimeType: string } }> {
        const doc = await prisma.resourceDocument.findUnique({ where: { id } });
        if (!doc) throw new Error('Document not found');
        const buffer = await getFileBuffer(DOCUMENT_BUCKETS.DOCUMENTS, doc.fileName);
        return { buffer, doc };
    }
}

export const documentsService = new DocumentsService();
