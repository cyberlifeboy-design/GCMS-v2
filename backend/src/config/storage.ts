import * as Minio from 'minio';
import * as fs from 'fs';
import * as path from 'path';

// MinIO client configuration
export const minioClient = new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9000'),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin123',
});

// Local fallback directory when MinIO is unavailable
export const UPLOADS_DIR = path.join(__dirname, '../../../uploads');

// Bucket names
export const BUCKETS = {
    SIGNATURES: 'signatures',
    INCIDENT_PHOTOS: 'incident-photos',
    MAINTENANCE_PHOTOS: 'maintenance-photos',
    BRANDING: 'branding',
};

/**
 * Initialize MinIO buckets on server startup.
 * Also creates local fallback directories.
 */
export async function initializeMinIO(): Promise<void> {
    // Always create local fallback dirs
    for (const bucket of Object.values(BUCKETS)) {
        await fs.promises.mkdir(path.join(UPLOADS_DIR, bucket), { recursive: true });
    }

    try {
        const bucketList = [BUCKETS.SIGNATURES, BUCKETS.INCIDENT_PHOTOS, BUCKETS.MAINTENANCE_PHOTOS, BUCKETS.BRANDING];
        for (const bucket of bucketList) {
            const exists = await minioClient.bucketExists(bucket);
            if (!exists) {
                await minioClient.makeBucket(bucket, 'us-east-1');
                console.log(`✓ Created MinIO bucket: ${bucket}`);
            } else {
                console.log(`✓ MinIO bucket exists: ${bucket}`);
            }
        }
        console.log('✓ MinIO initialization complete');
    } catch (error) {
        console.warn('⚠️  MinIO unavailable — using local disk fallback for storage');
    }
}

/**
 * Upload a file. Tries MinIO first; falls back to local disk if MinIO is unavailable.
 */
export async function uploadFile(
    bucket: string,
    fileName: string,
    fileBuffer: Buffer,
    contentType: string = 'application/octet-stream'
): Promise<string> {
    try {
        await minioClient.putObject(bucket, fileName, fileBuffer, fileBuffer.length, {
            'Content-Type': contentType,
        });
    } catch {
        // MinIO unavailable — save to local disk
        const dir = path.join(UPLOADS_DIR, bucket);
        await fs.promises.mkdir(dir, { recursive: true });
        await fs.promises.writeFile(path.join(dir, fileName), fileBuffer);
    }

    return `/api/v1/storage/${bucket}/${fileName}`;
}

/**
 * Read a file buffer. Tries MinIO first; falls back to local disk.
 */
export async function getFileBuffer(bucket: string, fileName: string): Promise<Buffer> {
    try {
        const stream = await minioClient.getObject(bucket, fileName);
        return await new Promise<Buffer>((resolve, reject) => {
            const chunks: Buffer[] = [];
            stream.on('data', (chunk: Buffer) => chunks.push(chunk));
            stream.on('end', () => resolve(Buffer.concat(chunks)));
            stream.on('error', reject);
        });
    } catch {
        // MinIO unavailable — read from local disk
        return fs.promises.readFile(path.join(UPLOADS_DIR, bucket, fileName));
    }
}

/**
 * Upload signature image
 */
export async function uploadSignature(fileName: string, imageBuffer: Buffer): Promise<string> {
    return uploadFile(BUCKETS.SIGNATURES, fileName, imageBuffer, 'image/png');
}

/**
 * Upload incident photo
 */
export async function uploadIncidentPhoto(fileName: string, imageBuffer: Buffer): Promise<string> {
    return uploadFile(BUCKETS.INCIDENT_PHOTOS, fileName, imageBuffer, 'image/jpeg');
}

/**
 * Get presigned URL for temporary access (expires in 7 days).
 * Falls back to the storage proxy URL if MinIO is unavailable.
 */
export async function getPresignedUrl(bucket: string, fileName: string): Promise<string> {
    try {
        return await minioClient.presignedGetObject(bucket, fileName, 7 * 24 * 60 * 60);
    } catch {
        return `/api/v1/storage/${bucket}/${fileName}`;
    }
}

/**
 * Delete file from MinIO and local disk.
 */
export async function deleteFile(bucket: string, fileName: string): Promise<void> {
    try {
        await minioClient.removeObject(bucket, fileName);
    } catch {
        // MinIO unavailable — try local disk
        try {
            await fs.promises.unlink(path.join(UPLOADS_DIR, bucket, fileName));
        } catch {
            // file may not exist
        }
    }
}
