import app from './app';
import { initializeMinIO } from './config/storage';
import { checkDatabaseConnection } from './config/database';

const PORT = process.env.PORT || 3001;

async function startServer() {
    try {
        // Check database connection
        console.log('🔍 Checking database connection...');
        const dbConnected = await checkDatabaseConnection();
        if (!dbConnected) {
            console.error('❌ Database connection failed');
            process.exit(1);
        }
        console.log('✅ Database connected');

        // Initialize MinIO storage
        console.log('🔍 Initializing MinIO storage...');
        await initializeMinIO();

        // Start server
        app.listen(PORT, () => {
            console.log(`🚀 GCMS Backend API running on port ${PORT}`);
            console.log(`📊 Health check: http://localhost:${PORT}/health`);
            console.log(`🔗 API v1: http://localhost:${PORT}/api/v1`);
            console.log(`🔐 Auth: http://localhost:${PORT}/api/v1/auth`);
            console.log(`\n🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
        });
    } catch (error) {
        console.error('❌ Server startup failed:', error);
        process.exit(1);
    }
}

startServer();
