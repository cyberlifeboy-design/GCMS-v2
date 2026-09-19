import app from './app';
import { initializeStorage } from './config/storage';
import { checkDatabaseConnection } from './config/database';
import { poolBookingRequestsService } from './modules/pool-booking-requests/pool-booking-requests.service';
import { notificationTemplatesService } from './modules/notification-templates/notification-templates.service';

const PORT = process.env.PORT || 3005;
const POOL_REMINDER_MINUTES_BEFORE = parseInt(process.env.POOL_REMINDER_MINUTES_BEFORE || '30', 10);
const POOL_REMINDER_POLL_MS = 60 * 1000;
const INSTANT_EXPIRY_POLL_MS = 30 * 1000;

/** No external scheduler in this app — a simple interval is enough for this poll's cadence. */
function startPoolBookingReminderLoop() {
    setInterval(() => {
        poolBookingRequestsService.scanReminders(POOL_REMINDER_MINUTES_BEFORE).catch((err) => {
            console.error('Pool booking reminder scan failed:', err);
        });
    }, POOL_REMINDER_POLL_MS);
    console.log(`⏰ Pool booking reminder loop started (checks every ${POOL_REMINDER_POLL_MS / 1000}s, warns ${POOL_REMINDER_MINUTES_BEFORE}min before due)`);

    setInterval(() => {
        poolBookingRequestsService.scanInstantExpiry().catch((err) => {
            console.error('Instant booking expiry scan failed:', err);
        });
    }, INSTANT_EXPIRY_POLL_MS);
    console.log(`⏰ Instant booking expiry loop started (checks every ${INSTANT_EXPIRY_POLL_MS / 1000}s)`);
}

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

        // Initialize storage (local / MinIO / Azure Blob, per STORAGE_DRIVER)
        console.log('🔍 Initializing storage...');
        await initializeStorage();

        // Seed default notification/email templates (idempotent — only inserts missing keys).
        // Non-fatal: a schema-drift/migration gap here shouldn't take down the whole API.
        try {
            await notificationTemplatesService.seedDefaults();
        } catch (err) {
            console.error('⚠️  Notification template seeding failed (continuing startup):', err);
        }

        // Start server
        app.listen(PORT, () => {
            console.log(`🚀 GCMS Backend API running on port ${PORT}`);
            console.log(`📊 Health check: http://localhost:${PORT}/health`);
            console.log(`🔗 API v1: http://localhost:${PORT}/api/v1`);
            console.log(`🔐 Auth: http://localhost:${PORT}/api/v1/auth`);
            console.log(`\n🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
        });

        startPoolBookingReminderLoop();
    } catch (error) {
        console.error('❌ Server startup failed:', error);
        process.exit(1);
    }
}

startServer();
