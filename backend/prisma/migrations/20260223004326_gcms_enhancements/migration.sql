/*
  Warnings:

  - You are about to drop the column `assignedToFA` on the `Fleet` table. All the data in the column will be lost.
  - You are about to drop the column `keyColorCode` on the `Fleet` table. All the data in the column will be lost.
  - You are about to drop the column `keyId` on the `Fleet` table. All the data in the column will be lost.
  - You are about to drop the column `unitNumber` on the `Fleet` table. All the data in the column will be lost.
  - You are about to drop the column `vapsPermit` on the `Fleet` table. All the data in the column will be lost.
  - You are about to drop the column `latitude` on the `HandoverLog` table. All the data in the column will be lost.
  - You are about to drop the column `longitude` on the `HandoverLog` table. All the data in the column will be lost.
  - You are about to drop the column `signatureUrl` on the `HandoverLog` table. All the data in the column will be lost.
  - You are about to drop the column `contractorId` on the `MaintenanceLog` table. All the data in the column will be lost.
  - You are about to drop the column `fixDescription` on the `MaintenanceLog` table. All the data in the column will be lost.
  - You are about to drop the column `fixedAt` on the `MaintenanceLog` table. All the data in the column will be lost.
  - You are about to drop the column `reportedBy` on the `MaintenanceLog` table. All the data in the column will be lost.
  - You are about to drop the column `accreditationId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `faTrigram` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[carNumber]` on the table `Fleet` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `carNumber` to the `Fleet` table without a default value. This is not possible if the table is not empty.
  - Added the required column `reportedById` to the `MaintenanceLog` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Fleet_keyId_key";

-- DropIndex
DROP INDEX "Fleet_unitNumber_key";

-- DropIndex
DROP INDEX "User_accreditationId_key";

-- AlterTable
ALTER TABLE "Fleet" DROP COLUMN "assignedToFA",
DROP COLUMN "keyColorCode",
DROP COLUMN "keyId",
DROP COLUMN "unitNumber",
DROP COLUMN "vapsPermit",
ADD COLUMN     "assignedUserId" TEXT,
ADD COLUMN     "carNumber" TEXT NOT NULL,
ADD COLUMN     "requiresVAP" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "status" SET DEFAULT 'Available';

-- AlterTable
ALTER TABLE "HandoverLog" DROP COLUMN "latitude",
DROP COLUMN "longitude",
DROP COLUMN "signatureUrl";

-- AlterTable
ALTER TABLE "MaintenanceLog" DROP COLUMN "contractorId",
DROP COLUMN "fixDescription",
DROP COLUMN "fixedAt",
DROP COLUMN "reportedBy",
ADD COLUMN     "photosUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "reportedById" TEXT NOT NULL,
ADD COLUMN     "resolutionNotes" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ALTER COLUMN "status" SET DEFAULT 'Open';

-- AlterTable
ALTER TABLE "Stadium" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "accreditationId",
DROP COLUMN "faTrigram",
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "phone" TEXT;

-- CreateTable
CREATE TABLE "SystemSettings" (
    "id" TEXT NOT NULL,
    "tournamentName" TEXT NOT NULL DEFAULT 'Golf Cart Management System',
    "logoUrl" TEXT,
    "headerUrl" TEXT,
    "footerUrl" TEXT,
    "footerText" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "SystemSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_idx" ON "AuditLog"("entityType");

-- CreateIndex
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "Fleet_carNumber_key" ON "Fleet"("carNumber");

-- CreateIndex
CREATE INDEX "Fleet_stadiumId_idx" ON "Fleet"("stadiumId");

-- CreateIndex
CREATE INDEX "Fleet_status_idx" ON "Fleet"("status");

-- CreateIndex
CREATE INDEX "Fleet_assignedUserId_idx" ON "Fleet"("assignedUserId");

-- CreateIndex
CREATE INDEX "HandoverLog_fleetId_idx" ON "HandoverLog"("fleetId");

-- CreateIndex
CREATE INDEX "HandoverLog_userId_idx" ON "HandoverLog"("userId");

-- CreateIndex
CREATE INDEX "HandoverLog_timestamp_idx" ON "HandoverLog"("timestamp");

-- CreateIndex
CREATE INDEX "MaintenanceLog_fleetId_idx" ON "MaintenanceLog"("fleetId");

-- CreateIndex
CREATE INDEX "MaintenanceLog_status_idx" ON "MaintenanceLog"("status");

-- CreateIndex
CREATE INDEX "MaintenanceLog_reportedById_idx" ON "MaintenanceLog"("reportedById");

-- CreateIndex
CREATE INDEX "User_stadiumId_idx" ON "User"("stadiumId");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- AddForeignKey
ALTER TABLE "Fleet" ADD CONSTRAINT "Fleet_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceLog" ADD CONSTRAINT "MaintenanceLog_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
