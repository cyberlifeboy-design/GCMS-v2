-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CarRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requesterName" TEXT NOT NULL,
    "requesterEmail" TEXT NOT NULL,
    "requesterPhone" TEXT,
    "accreditationNumber" TEXT,
    "requestType" TEXT NOT NULL DEFAULT 'pool-shared',
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
    "reviewedAt" DATETIME,
    "reviewNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CarRequest_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CarRequest_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "Stadium" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CarRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CarRequest" ("accessibilityCount", "accreditationNumber", "cargoCount", "createdAt", "departmentId", "fourSeaterCount", "id", "notes", "requestToken", "requestType", "requesterEmail", "requesterName", "requesterPhone", "reviewNotes", "reviewedAt", "reviewedById", "sixSeaterCount", "stadiumId", "status", "updatedAt") SELECT "accessibilityCount", "accreditationNumber", "cargoCount", "createdAt", "departmentId", "fourSeaterCount", "id", "notes", "requestToken", "requestType", "requesterEmail", "requesterName", "requesterPhone", "reviewNotes", "reviewedAt", "reviewedById", "sixSeaterCount", "stadiumId", "status", "updatedAt" FROM "CarRequest";
DROP TABLE "CarRequest";
ALTER TABLE "new_CarRequest" RENAME TO "CarRequest";
CREATE UNIQUE INDEX "CarRequest_requestToken_key" ON "CarRequest"("requestToken");
CREATE INDEX "CarRequest_status_idx" ON "CarRequest"("status");
CREATE INDEX "CarRequest_stadiumId_idx" ON "CarRequest"("stadiumId");
CREATE INDEX "CarRequest_departmentId_idx" ON "CarRequest"("departmentId");
CREATE INDEX "CarRequest_requestToken_idx" ON "CarRequest"("requestToken");
CREATE TABLE "new_SystemSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tournamentName" TEXT NOT NULL DEFAULT 'Golf Cart Management System',
    "logoUrl" TEXT,
    "headerUrl" TEXT,
    "footerUrl" TEXT,
    "footerText" TEXT,
    "maintenanceNotificationEmails" TEXT,
    "handoverTimeoutMinutes" INTEGER NOT NULL DEFAULT 120,
    "defaultStadiumId" TEXT,
    "enableMaintenanceReports" BOOLEAN NOT NULL DEFAULT true,
    "enableHandoverPhotos" BOOLEAN NOT NULL DEFAULT true,
    "enableFleetManagement" BOOLEAN NOT NULL DEFAULT true,
    "enableCarRequests" BOOLEAN NOT NULL DEFAULT true,
    "enableUserImport" BOOLEAN NOT NULL DEFAULT true,
    "enableBulkOperations" BOOLEAN NOT NULL DEFAULT true,
    "enableAdvancedReports" BOOLEAN NOT NULL DEFAULT true,
    "enableAssignmentMatrix" BOOLEAN NOT NULL DEFAULT true,
    "requestWindowMode" TEXT NOT NULL DEFAULT 'open',
    "requestWindowStart" DATETIME,
    "requestWindowEnd" DATETIME,
    "requestWindowClosedMessage" TEXT,
    "systemAnnouncement" TEXT,
    "announcementExpiry" DATETIME,
    "handoverDefaultDurationDays" INTEGER NOT NULL DEFAULT 1,
    "handoverEventStartDate" DATETIME,
    "handoverEventEndDate" DATETIME,
    "enableHandoverReminder" BOOLEAN NOT NULL DEFAULT true,
    "handoverReminderHoursBefore" INTEGER NOT NULL DEFAULT 1,
    "timezone" TEXT DEFAULT 'UTC',
    "handoverTcEnTitle" TEXT,
    "handoverTcEnBody" TEXT,
    "handoverTcArTitle" TEXT,
    "handoverTcArBody" TEXT,
    "handoverTcCheckboxes" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedById" TEXT
);
INSERT INTO "new_SystemSettings" ("announcementExpiry", "defaultStadiumId", "enableAdvancedReports", "enableAssignmentMatrix", "enableBulkOperations", "enableCarRequests", "enableFleetManagement", "enableHandoverPhotos", "enableHandoverReminder", "enableMaintenanceReports", "enableUserImport", "footerText", "footerUrl", "handoverDefaultDurationDays", "handoverEventEndDate", "handoverEventStartDate", "handoverReminderHoursBefore", "handoverTcArBody", "handoverTcArTitle", "handoverTcCheckboxes", "handoverTcEnBody", "handoverTcEnTitle", "handoverTimeoutMinutes", "headerUrl", "id", "logoUrl", "maintenanceNotificationEmails", "systemAnnouncement", "timezone", "tournamentName", "updatedAt", "updatedById") SELECT "announcementExpiry", "defaultStadiumId", "enableAdvancedReports", "enableAssignmentMatrix", "enableBulkOperations", "enableCarRequests", "enableFleetManagement", "enableHandoverPhotos", "enableHandoverReminder", "enableMaintenanceReports", "enableUserImport", "footerText", "footerUrl", "handoverDefaultDurationDays", "handoverEventEndDate", "handoverEventStartDate", "handoverReminderHoursBefore", "handoverTcArBody", "handoverTcArTitle", "handoverTcCheckboxes", "handoverTcEnBody", "handoverTcEnTitle", "handoverTimeoutMinutes", "headerUrl", "id", "logoUrl", "maintenanceNotificationEmails", "systemAnnouncement", "timezone", "tournamentName", "updatedAt", "updatedById" FROM "SystemSettings";
DROP TABLE "SystemSettings";
ALTER TABLE "new_SystemSettings" RENAME TO "SystemSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Backfill legacy request type values to the new vocabulary
UPDATE "CarRequest" SET "requestType" = 'pool-shared' WHERE "requestType" = 'one-time';
