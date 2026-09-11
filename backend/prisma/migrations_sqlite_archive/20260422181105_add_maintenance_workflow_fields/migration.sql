-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MaintenanceLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fleetId" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,
    "issueDescription" TEXT NOT NULL,
    "photosUrls" TEXT DEFAULT '[]',
    "reportedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "resolutionNotes" TEXT,
    "resolvedAt" DATETIME,
    "quotationStatus" TEXT,
    "fixCost" REAL,
    "quotationRequestedAt" DATETIME,
    "costSubmittedAt" DATETIME,
    "costApprovedAt" DATETIME,
    "approvedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MaintenanceLog_fleetId_fkey" FOREIGN KEY ("fleetId") REFERENCES "Fleet" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MaintenanceLog_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MaintenanceLog_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_MaintenanceLog" ("createdAt", "fleetId", "id", "issueDescription", "photosUrls", "reportedAt", "reportedById", "resolutionNotes", "resolvedAt", "status", "updatedAt") SELECT "createdAt", "fleetId", "id", "issueDescription", "photosUrls", "reportedAt", "reportedById", "resolutionNotes", "resolvedAt", "status", "updatedAt" FROM "MaintenanceLog";
DROP TABLE "MaintenanceLog";
ALTER TABLE "new_MaintenanceLog" RENAME TO "MaintenanceLog";
CREATE INDEX "MaintenanceLog_fleetId_idx" ON "MaintenanceLog"("fleetId");
CREATE INDEX "MaintenanceLog_status_idx" ON "MaintenanceLog"("status");
CREATE INDEX "MaintenanceLog_reportedById_idx" ON "MaintenanceLog"("reportedById");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

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
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_idx" ON "AuditLog"("entityType");

-- CreateIndex
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");

-- CreateIndex
CREATE INDEX "CarRequest_status_idx" ON "CarRequest"("status");

-- CreateIndex
CREATE INDEX "CarRequest_stadiumId_idx" ON "CarRequest"("stadiumId");

-- CreateIndex
CREATE INDEX "CarRequest_departmentId_idx" ON "CarRequest"("departmentId");

-- CreateIndex
CREATE INDEX "CarRequest_requestToken_idx" ON "CarRequest"("requestToken");

-- CreateIndex
CREATE INDEX "Department_stadiumId_idx" ON "Department"("stadiumId");

-- CreateIndex
CREATE INDEX "Department_focalPointId_idx" ON "Department"("focalPointId");

-- CreateIndex
CREATE INDEX "Fleet_stadiumId_idx" ON "Fleet"("stadiumId");

-- CreateIndex
CREATE INDEX "Fleet_status_idx" ON "Fleet"("status");

-- CreateIndex
CREATE INDEX "Fleet_assignedUserId_idx" ON "Fleet"("assignedUserId");

-- CreateIndex
CREATE INDEX "Fleet_departmentId_idx" ON "Fleet"("departmentId");

-- CreateIndex
CREATE INDEX "HandoverLog_fleetId_idx" ON "HandoverLog"("fleetId");

-- CreateIndex
CREATE INDEX "HandoverLog_userId_idx" ON "HandoverLog"("userId");

-- CreateIndex
CREATE INDEX "HandoverLog_timestamp_idx" ON "HandoverLog"("timestamp");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_isRead_idx" ON "Notification"("isRead");

-- CreateIndex
CREATE INDEX "Notification_type_idx" ON "Notification"("type");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "User_stadiumId_idx" ON "User"("stadiumId");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_departmentId_idx" ON "User"("departmentId");

-- CreateIndex
CREATE INDEX "User_isBlocked_idx" ON "User"("isBlocked");
