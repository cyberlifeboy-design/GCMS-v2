/*
  Warnings:

  - A unique constraint covering the columns `[resetPasswordToken]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "HandoverLog" DROP CONSTRAINT "HandoverLog_fleetId_fkey";

-- DropForeignKey
ALTER TABLE "MaintenanceLog" DROP CONSTRAINT "MaintenanceLog_fleetId_fkey";

-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "focalPointId" TEXT;

-- AlterTable
ALTER TABLE "SystemSettings" ADD COLUMN     "enableAdvancedReports" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "enableAssignmentMatrix" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "enableBulkOperations" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "enableCarRequests" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "enableFleetManagement" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "enableHandoverReminder" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "enableUserImport" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "handoverDefaultDurationDays" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "handoverEventEndDate" TIMESTAMP(3),
ADD COLUMN     "handoverEventStartDate" TIMESTAMP(3),
ADD COLUMN     "handoverReminderHoursBefore" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "timezone" TEXT DEFAULT 'UTC';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "accreditationNumber" TEXT,
ADD COLUMN     "assignAllStadiums" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "exportFormat" TEXT NOT NULL DEFAULT 'xlsx',
ADD COLUMN     "exportPreferences" JSONB,
ADD COLUMN     "isBlocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "resetPasswordExpires" TIMESTAMP(3),
ADD COLUMN     "resetPasswordToken" TEXT;

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'info',
    "targetType" TEXT NOT NULL DEFAULT 'all',
    "targetUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetRole" TEXT,
    "stadiumId" TEXT,
    "createdBy" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarRequest" (
    "id" TEXT NOT NULL,
    "requesterName" TEXT NOT NULL,
    "requesterEmail" TEXT NOT NULL,
    "requesterPhone" TEXT,
    "departmentId" TEXT NOT NULL,
    "stadiumId" TEXT NOT NULL,
    "cargoCount" INTEGER NOT NULL DEFAULT 0,
    "fourSeaterCount" INTEGER NOT NULL DEFAULT 0,
    "sixSeaterCount" INTEGER NOT NULL DEFAULT 0,
    "accessibilityCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "requestToken" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Announcement_type_idx" ON "Announcement"("type");

-- CreateIndex
CREATE INDEX "Announcement_targetType_idx" ON "Announcement"("targetType");

-- CreateIndex
CREATE INDEX "Announcement_isActive_idx" ON "Announcement"("isActive");

-- CreateIndex
CREATE INDEX "Announcement_scheduledAt_idx" ON "Announcement"("scheduledAt");

-- CreateIndex
CREATE INDEX "Announcement_expiresAt_idx" ON "Announcement"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CarRequest_requestToken_key" ON "CarRequest"("requestToken");

-- CreateIndex
CREATE INDEX "CarRequest_status_idx" ON "CarRequest"("status");

-- CreateIndex
CREATE INDEX "CarRequest_stadiumId_idx" ON "CarRequest"("stadiumId");

-- CreateIndex
CREATE INDEX "CarRequest_departmentId_idx" ON "CarRequest"("departmentId");

-- CreateIndex
CREATE INDEX "CarRequest_requestToken_idx" ON "CarRequest"("requestToken");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_isRead_idx" ON "Notification"("isRead");

-- CreateIndex
CREATE INDEX "Notification_type_idx" ON "Notification"("type");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "Department_focalPointId_idx" ON "Department"("focalPointId");

-- CreateIndex
CREATE UNIQUE INDEX "User_resetPasswordToken_key" ON "User"("resetPasswordToken");

-- CreateIndex
CREATE INDEX "User_isBlocked_idx" ON "User"("isBlocked");

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_focalPointId_fkey" FOREIGN KEY ("focalPointId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoverLog" ADD CONSTRAINT "HandoverLog_fleetId_fkey" FOREIGN KEY ("fleetId") REFERENCES "Fleet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceLog" ADD CONSTRAINT "MaintenanceLog_fleetId_fkey" FOREIGN KEY ("fleetId") REFERENCES "Fleet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarRequest" ADD CONSTRAINT "CarRequest_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarRequest" ADD CONSTRAINT "CarRequest_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "Stadium"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarRequest" ADD CONSTRAINT "CarRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
