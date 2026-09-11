-- CreateTable
CREATE TABLE "PoolBooking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fleetId" TEXT NOT NULL,
    "driverName" TEXT NOT NULL,
    "driverPhone" TEXT,
    "accreditationNumber" TEXT,
    "purpose" TEXT,
    "checkoutAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedReturnAt" DATETIME,
    "returnedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "returnNotes" TEXT,
    "createdById" TEXT NOT NULL,
    "returnedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PoolBooking_fleetId_fkey" FOREIGN KEY ("fleetId") REFERENCES "Fleet" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PoolBooking_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PoolBooking_returnedById_fkey" FOREIGN KEY ("returnedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Fleet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "carNumber" TEXT NOT NULL,
    "carType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Available',
    "requiresVAP" BOOLEAN NOT NULL DEFAULT false,
    "stadiumId" TEXT NOT NULL,
    "departmentId" TEXT,
    "assignedUserId" TEXT,
    "handoverSigned" BOOLEAN NOT NULL DEFAULT false,
    "handoverSignedAt" DATETIME,
    "checkedInAt" DATETIME,
    "additionalDrivers" TEXT DEFAULT '[]',
    "isPool" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Fleet_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "Stadium" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Fleet_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Fleet_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Fleet" ("additionalDrivers", "assignedUserId", "carNumber", "carType", "checkedInAt", "createdAt", "departmentId", "handoverSigned", "handoverSignedAt", "id", "requiresVAP", "stadiumId", "status", "updatedAt") SELECT "additionalDrivers", "assignedUserId", "carNumber", "carType", "checkedInAt", "createdAt", "departmentId", "handoverSigned", "handoverSignedAt", "id", "requiresVAP", "stadiumId", "status", "updatedAt" FROM "Fleet";
DROP TABLE "Fleet";
ALTER TABLE "new_Fleet" RENAME TO "Fleet";
CREATE UNIQUE INDEX "Fleet_carNumber_key" ON "Fleet"("carNumber");
CREATE INDEX "Fleet_stadiumId_idx" ON "Fleet"("stadiumId");
CREATE INDEX "Fleet_status_idx" ON "Fleet"("status");
CREATE INDEX "Fleet_assignedUserId_idx" ON "Fleet"("assignedUserId");
CREATE INDEX "Fleet_departmentId_idx" ON "Fleet"("departmentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PoolBooking_fleetId_idx" ON "PoolBooking"("fleetId");

-- CreateIndex
CREATE INDEX "PoolBooking_status_idx" ON "PoolBooking"("status");

-- CreateIndex
CREATE INDEX "PoolBooking_createdById_idx" ON "PoolBooking"("createdById");

-- CreateIndex
CREATE INDEX "PoolBooking_checkoutAt_idx" ON "PoolBooking"("checkoutAt");
