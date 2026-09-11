-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "subjectUserId" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,
    "fleetId" TEXT,
    "stadiumId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "photosUrls" TEXT DEFAULT '[]',
    "occurredAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Incident_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Incident_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Incident_fleetId_fkey" FOREIGN KEY ("fleetId") REFERENCES "Fleet" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Incident_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "Stadium" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Warning" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "incidentId" TEXT,
    "level" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "issuedById" TEXT NOT NULL,
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" DATETIME,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "revokedById" TEXT,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Warning_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Warning_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Warning_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Warning_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
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
    "blockedAt" DATETIME,
    "blockedReason" TEXT,
    "blockedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "Stadium" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_blockedById_fkey" FOREIGN KEY ("blockedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("accreditationNumber", "assignAllStadiums", "createdAt", "departmentId", "email", "exportFormat", "exportPreferences", "grantedPages", "id", "isActive", "isBlocked", "name", "passwordHash", "phone", "resetPasswordExpires", "resetPasswordToken", "role", "stadiumId", "updatedAt", "venueReportAccess") SELECT "accreditationNumber", "assignAllStadiums", "createdAt", "departmentId", "email", "exportFormat", "exportPreferences", "grantedPages", "id", "isActive", "isBlocked", "name", "passwordHash", "phone", "resetPasswordExpires", "resetPasswordToken", "role", "stadiumId", "updatedAt", "venueReportAccess" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_resetPasswordToken_key" ON "User"("resetPasswordToken");
CREATE INDEX "User_stadiumId_idx" ON "User"("stadiumId");
CREATE INDEX "User_role_idx" ON "User"("role");
CREATE INDEX "User_departmentId_idx" ON "User"("departmentId");
CREATE INDEX "User_isBlocked_idx" ON "User"("isBlocked");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Incident_reference_key" ON "Incident"("reference");

-- CreateIndex
CREATE INDEX "Incident_subjectUserId_idx" ON "Incident"("subjectUserId");

-- CreateIndex
CREATE INDEX "Incident_status_idx" ON "Incident"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Warning_reference_key" ON "Warning"("reference");

-- CreateIndex
CREATE INDEX "Warning_userId_idx" ON "Warning"("userId");

-- CreateIndex
CREATE INDEX "Warning_level_idx" ON "Warning"("level");
