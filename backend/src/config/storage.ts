import * as Minio from 'minio';

// MinIO client configuration
export const minioClient = new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9000'),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin123',
});

// Bucket names
export const BUCKETS = {
    SIGNATURES: 'signatures',
    INCIDENT_PHOTOS: 'incident-photos',
    MAINTENANCE_PHOTOS: 'maintenance-photos',
    BRANDING: 'branding',
};

/**
 * Initialize MinIO buckets on server startup
 */
export async function initializeMinIO(): Promise<void> {
    try {
        // Create signatures bucket
        const signaturesExists = await minioClient.bucketExists(BUCKETS.SIGNATURES);
        if (!signaturesExists) {
            await minioClient.makeBucket(BUCKETS.SIGNATURES, 'us-east-1');
            console.log(`✓ Created MinIO bucket: ${BUCKETS.SIGNATURES}`);
        } else {
            console.log(`✓ MinIO bucket exists: ${BUCKETS.SIGNATURES}`);
        }

        // Create incident photos bucket
        const photosExists = await minioClient.bucketExists(BUCKETS.INCIDENT_PHOTOS);
        if (!photosExists) {
            await minioClient.makeBucket(BUCKETS.INCIDENT_PHOTOS, 'us-east-1');
            console.log(`✓ Created MinIO bucket: ${BUCKETS.INCIDENT_PHOTOS}`);
        } else {
            console.log(`✓ MinIO bucket exists: ${BUCKETS.INCIDENT_PHOTOS}`);
        }

        // Bucket policy setup skipped for development - can be configured manually if needed

        console.log('✓ MinIO initialization complete');
    } catch (error) {
        console.warn('⚠️  MinIO initialization failed (non-critical):', error);
        // Don't throw - allow server to start even if MinIO is not available
    }
}

/**
 * Upload a file to MinIO
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

        // Generate file URL
        const url = `http://${process.env.MINIO_ENDPOINT || 'localhost'}:${process.env.MINIO_PORT || '9000'}/${bucket}/${fileName}`;
        return url;
    } catch (error) {
        console.error('File upload failed:', error);
        throw new Error('Failed to upload file');
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
 * Get presigned URL for temporary access (expires in 7 days)
 */
export async function getPresignedUrl(bucket: string, fileName: string): Promise<string> {
    try {
        return await minioClient.presignedGetObject(bucket, fileName, 7 * 24 * 60 * 60);
    } catch (error) {
        console.error('Failed to generate presigned URL:', error);
        throw new Error('Failed to generate file URL');
    }
}

/**
 * Delete file from MinIO
 */
export async function deleteFile(bucket: string, fileName: string): Promise<void> {
    try {
        await minioClient.removeObject(bucket, fileName);
    } catch (error) {
        console.error('File deletion failed:', error);
        throw new Error('Failed to delete file');
    }
}
