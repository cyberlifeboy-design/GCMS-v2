import * as Minio from 'minio';
import * as fs from 'fs';
import * as path from 'path';
import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';

export type StorageDriver = 'local' | 'minio' | 'azure-blob';
const DRIVER: StorageDriver = (process.env.STORAGE_DRIVER as StorageDriver) || 'minio';

// MinIO client configuration
export const minioClient = new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9000'),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin123',
});

// Local fallback directory when the selected driver is unavailable
// Relative to cwd (not __dirname) so it resolves the same whether running
// from src/ via tsx (dev) or from the compiled dist/ (prod) — dist sits one
// directory shallower than src, which broke a fixed "../../../uploads" offset.
export const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

// Bucket names
export const BUCKETS = {
    SIGNATURES: 'signatures',
    INCIDENT_PHOTOS: 'incident-photos',
    MAINTENANCE_PHOTOS: 'maintenance-photos',
    BRANDING: 'branding',
};

// Azure Blob: a single container, buckets become path prefixes ("<bucket>/<fileName>")
let azureContainer: ContainerClient | null = null;
function getAzureContainer(): ContainerClient {
    if (azureContainer) return azureContainer;
    const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!connStr) throw new Error('AZURE_STORAGE_CONNECTION_STRING is not set (STORAGE_DRIVER=azure-blob)');
    const containerName = process.env.AZURE_STORAGE_CONTAINER || 'gcms-uploads';
    const service = BlobServiceClient.fromConnectionString(connStr);
    azureContainer = service.getContainerClient(containerName);
    return azureContainer;
}
const azureBlobPath = (bucket: string, fileName: string) => `${bucket}/${fileName}`;

async function localWrite(bucket: string, fileName: string, buffer: Buffer): Promise<void> {
    const dir = path.join(UPLOADS_DIR, bucket);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(path.join(dir, fileName), buffer);
}
async function localRead(bucket: string, fileName: string): Promise<Buffer> {
    return fs.promises.readFile(path.join(UPLOADS_DIR, bucket, fileName));
}

/**
 * Initialize storage on server startup: local fallback dirs always; MinIO buckets or the
 * Azure container only when that driver is selected (STORAGE_DRIVER).
 */
export async function initializeStorage(): Promise<void> {
    // Always create local fallback dirs
    for (const bucket of Object.values(BUCKETS)) {
        await fs.promises.mkdir(path.join(UPLOADS_DIR, bucket), { recursive: true });
    }

    if (DRIVER === 'minio') {
        try {
            for (const bucket of Object.values(BUCKETS)) {
                const exists = await minioClient.bucketExists(bucket);
                if (!exists) {
                    await minioClient.makeBucket(bucket, 'us-east-1');
                    console.log(`✓ Created MinIO bucket: ${bucket}`);
                } else {
                    console.log(`✓ MinIO bucket exists: ${bucket}`);
                }
            }
            console.log('✓ MinIO initialization complete');
        } catch {
            console.warn('⚠️  MinIO unavailable — using local disk fallback for storage');
        }
    } else if (DRIVER === 'azure-blob') {
        try {
            const container = getAzureContainer();
            await container.createIfNotExists();
            console.log(`✓ Azure Blob container ready: ${container.containerName}`);
        } catch (err) {
            console.warn('⚠️  Azure Blob unavailable — using local disk fallback for storage:', (err as Error).message);
        }
    } else {
        console.log('✓ Storage driver: local disk');
    }
}

/** Back-compat alias — server.ts historically imported initializeMinIO(). */
export const initializeMinIO = initializeStorage;

/**
 * Upload a file via the selected driver (STORAGE_DRIVER); falls back to local disk if
 * the driver is unavailable.
 */
export async function uploadFile(
    bucket: string,
    fileName: string,
    fileBuffer: Buffer,
    contentType: string = 'application/octet-stream'
): Promise<string> {
    try {
        if (DRIVER === 'azure-blob') {
            const container = getAzureContainer();
            const blob = container.getBlockBlobClient(azureBlobPath(bucket, fileName));
            await blob.uploadData(fileBuffer, { blobHTTPHeaders: { blobContentType: contentType } });
        } else if (DRIVER === 'minio') {
            await minioClient.putObject(bucket, fileName, fileBuffer, fileBuffer.length, {
                'Content-Type': contentType,
            });
        } else {
            await localWrite(bucket, fileName, fileBuffer);
        }
    } catch {
        // Selected driver unavailable — save to local disk
        await localWrite(bucket, fileName, fileBuffer);
    }

    return `/api/v1/storage/${bucket}/${fileName}`;
}

/**
 * Read a file buffer via the selected driver; falls back to local disk.
 */
export async function getFileBuffer(bucket: string, fileName: string): Promise<Buffer> {
    try {
        if (DRIVER === 'azure-blob') {
            const container = getAzureContainer();
            const blob = container.getBlockBlobClient(azureBlobPath(bucket, fileName));
            return await blob.downloadToBuffer();
        }
        if (DRIVER === 'minio') {
            const stream = await minioClient.getObject(bucket, fileName);
            return await new Promise<Buffer>((resolve, reject) => {
                const chunks: Buffer[] = [];
                stream.on('data', (chunk: Buffer) => chunks.push(chunk));
                stream.on('end', () => resolve(Buffer.concat(chunks)));
                stream.on('error', reject);
            });
        }
        return await localRead(bucket, fileName);
    } catch {
        return localRead(bucket, fileName);
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
 * Get presigned URL for temporary access (MinIO only; other drivers fall back to the
 * storage proxy URL, which stays driver-agnostic).
 */
export async function getPresignedUrl(bucket: string, fileName: string): Promise<string> {
    try {
        if (DRIVER === 'minio') {
            return await minioClient.presignedGetObject(bucket, fileName, 7 * 24 * 60 * 60);
        }
        return `/api/v1/storage/${bucket}/${fileName}`;
    } catch {
        return `/api/v1/storage/${bucket}/${fileName}`;
    }
}

/**
 * Delete file from the selected driver and local disk.
 */
export async function deleteFile(bucket: string, fileName: string): Promise<void> {
    try {
        if (DRIVER === 'azure-blob') {
            const container = getAzureContainer();
            await container.getBlockBlobClient(azureBlobPath(bucket, fileName)).deleteIfExists();
            return;
        }
        if (DRIVER === 'minio') {
            await minioClient.removeObject(bucket, fileName);
            return;
        }
    } catch {
        // fall through to local cleanup attempt
    }
    try {
        await fs.promises.unlink(path.join(UPLOADS_DIR, bucket, fileName));
    } catch {
        // file may not exist
    }
}

/** Used by the /api/v1/health/ready probe. */
export async function checkStorageConnection(): Promise<boolean> {
    try {
        if (DRIVER === 'azure-blob') {
            await getAzureContainer().exists();
            return true;
        }
        if (DRIVER === 'minio') {
            await minioClient.listBuckets();
            return true;
        }
        return true; // local disk — always "ok" if the process is running
    } catch {
        return false;
    }
}
