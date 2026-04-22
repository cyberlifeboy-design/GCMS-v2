-- CreateTable
CREATE TABLE "Stadium" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "stadiumId" TEXT NOT NULL,
    "focalPointId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Department_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "Stadium" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Department_focalPointId_fkey" FOREIGN KEY ("focalPointId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Fleet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "carNumber" TEXT NOT NULL,
    "carType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Available',
    "requiresVAP" BOOLEAN NOT NULL DEFAULT false,
    "stadiumId" TEXT NOT NULL,
    "departmentId" TEXT,
    "assignedUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Fleet_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "Stadium" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Fleet_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Fleet_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "phone" TEXT,
    "accreditationNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "resetPasswordToken" TEXT,
    "resetPasswordExpires" DATETIME,
    "exportFormat" TEXT NOT NULL DEFAULT 'xlsx',
    "exportPreferences" TEXT,
    "assignAllStadiums" BOOLEAN NOT NULL DEFAULT false,
    "grantedPages" TEXT DEFAULT '[]',
    "venueReportAccess" TEXT NOT NULL DEFAULT 'assigned',
    "stadiumId" TEXT,
    "departmentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "Stadium" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HandoverLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fleetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conditionNotes" TEXT,
    "photosUrls" TEXT DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HandoverLog_fleetId_fkey" FOREIGN KEY ("fleetId") REFERENCES "Fleet" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HandoverLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MaintenanceLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fleetId" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,
    "issueDescription" TEXT NOT NULL,
    "photosUrls" TEXT DEFAULT '[]',
    "reportedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "resolutionNotes" TEXT,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MaintenanceLog_fleetId_fkey" FOREIGN KEY ("fleetId") REFERENCES "Fleet" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MaintenanceLog_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SystemSettings" (
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
    "systemAnnouncement" TEXT,
    "announcementExpiry" DATETIME,
    "handoverDefaultDurationDays" INTEGER NOT NULL DEFAULT 1,
    "handoverEventStartDate" DATETIME,
    "handoverEventEndDate" DATETIME,
    "enableHandoverReminder" BOOLEAN NOT NULL DEFAULT true,
    "handoverReminderHoursBefore" INTEGER NOT NULL DEFAULT 1,
    "timezone" TEXT DEFAULT 'UTC',
    "updatedAt" DATETIME NOT NULL,
    "updatedById" TEXT
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'info',
    "targetType" TEXT NOT NULL DEFAULT 'all',
    "targetUserIds" TEXT DEFAULT '[]',
    "targetRole" TEXT,
    "stadiumId" TEXT,
    "createdBy" TEXT,
    "scheduledAt" DATETIME,
    "sentAt" DATETIME,
    "expiresAt" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CarRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requesterName" TEXT NOT NULL,
    "requesterEmail" TEXT NOT NULL,
    "requesterPhone" TEXT,
    "accreditationNumber" TEXT,
    "requestType" TEXT NOT NULL DEFAULT 'one-time',
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

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Stadium_code_key" ON "Stadium"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_stadiumId_key" ON "Department"("name", "stadiumId");

-- CreateIndex
CREATE UNIQUE INDEX "Fleet_carNumber_key" ON "Fleet"("carNumber");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_resetPasswordToken_key" ON "User"("resetPasswordToken");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "CarRequest_requestToken_key" ON "CarRequest"("requestToken");
