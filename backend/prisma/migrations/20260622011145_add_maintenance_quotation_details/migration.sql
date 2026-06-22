-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MaintenanceLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fleetId" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,
    "issueDescription" TEXT NOT NULL,
    "issueType" TEXT,
    "photosUrls" TEXT DEFAULT '[]',
    "reportedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "resolutionNotes" TEXT,
    "resolvedAt" DATETIME,
    "quotationStatus" TEXT,
    "fixCost" REAL,
    "quotationDescription" TEXT,
    "quotationTimeline" TEXT,
    "quotationRequestedAt" DATETIME,
    "costSubmittedAt" DATETIME,
    "costApprovedAt" DATETIME,
    "contractsEscalatedAt" DATETIME,
    "contractsEscalatedById" TEXT,
    "rejectionReason" TEXT,
    "rejectedAt" DATETIME,
    "approvedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MaintenanceLog_fleetId_fkey" FOREIGN KEY ("fleetId") REFERENCES "Fleet" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MaintenanceLog_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MaintenanceLog_contractsEscalatedById_fkey" FOREIGN KEY ("contractsEscalatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MaintenanceLog_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_MaintenanceLog" ("approvedById", "costApprovedAt", "costSubmittedAt", "createdAt", "fixCost", "fleetId", "id", "issueDescription", "issueType", "photosUrls", "quotationRequestedAt", "quotationStatus", "reportedAt", "reportedById", "resolutionNotes", "resolvedAt", "status", "updatedAt") SELECT "approvedById", "costApprovedAt", "costSubmittedAt", "createdAt", "fixCost", "fleetId", "id", "issueDescription", "issueType", "photosUrls", "quotationRequestedAt", "quotationStatus", "reportedAt", "reportedById", "resolutionNotes", "resolvedAt", "status", "updatedAt" FROM "MaintenanceLog";
DROP TABLE "MaintenanceLog";
ALTER TABLE "new_MaintenanceLog" RENAME TO "MaintenanceLog";
CREATE INDEX "MaintenanceLog_fleetId_idx" ON "MaintenanceLog"("fleetId");
CREATE INDEX "MaintenanceLog_status_idx" ON "MaintenanceLog"("status");
CREATE INDEX "MaintenanceLog_reportedById_idx" ON "MaintenanceLog"("reportedById");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
