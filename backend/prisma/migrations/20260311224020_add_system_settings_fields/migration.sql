-- AlterTable
ALTER TABLE "SystemSettings" ADD COLUMN IF NOT EXISTS "maintenanceNotificationEmails" TEXT;
ALTER TABLE "SystemSettings" ADD COLUMN IF NOT EXISTS "handoverTimeoutMinutes" INTEGER NOT NULL DEFAULT 120;
ALTER TABLE "SystemSettings" ADD COLUMN IF NOT EXISTS "defaultStadiumId" TEXT;
ALTER TABLE "SystemSettings" ADD COLUMN IF NOT EXISTS "enableMaintenanceReports" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SystemSettings" ADD COLUMN IF NOT EXISTS "enableHandoverPhotos" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SystemSettings" ADD COLUMN IF NOT EXISTS "systemAnnouncement" TEXT;
ALTER TABLE "SystemSettings" ADD COLUMN IF NOT EXISTS "announcementExpiry" TIMESTAMP(3);