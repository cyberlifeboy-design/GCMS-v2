-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PoolBookingRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stadiumId" TEXT NOT NULL,
    "fleetId" TEXT NOT NULL,
    "requesterName" TEXT NOT NULL,
    "requesterEmail" TEXT NOT NULL,
    "requesterPhone" TEXT NOT NULL,
    "faUserId" TEXT NOT NULL,
    "bookingType" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "purpose" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "reviewComment" TEXT,
    "returnedAt" DATETIME,
    "returnedById" TEXT,
    "requestToken" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PoolBookingRequest_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "Stadium" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PoolBookingRequest_fleetId_fkey" FOREIGN KEY ("fleetId") REFERENCES "Fleet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PoolBookingRequest_faUserId_fkey" FOREIGN KEY ("faUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PoolBookingRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PoolBookingRequest_returnedById_fkey" FOREIGN KEY ("returnedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PoolBookingRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PoolBookingRequest" ("bookingType", "createdAt", "createdById", "endDate", "endTime", "faUserId", "fleetId", "id", "purpose", "requestToken", "requesterEmail", "requesterName", "requesterPhone", "reviewComment", "reviewedAt", "reviewedById", "stadiumId", "startDate", "startTime", "status", "updatedAt") SELECT "bookingType", "createdAt", "createdById", "endDate", "endTime", "faUserId", "fleetId", "id", "purpose", "requestToken", "requesterEmail", "requesterName", "requesterPhone", "reviewComment", "reviewedAt", "reviewedById", "stadiumId", "startDate", "startTime", "status", "updatedAt" FROM "PoolBookingRequest";
DROP TABLE "PoolBookingRequest";
ALTER TABLE "new_PoolBookingRequest" RENAME TO "PoolBookingRequest";
CREATE UNIQUE INDEX "PoolBookingRequest_requestToken_key" ON "PoolBookingRequest"("requestToken");
CREATE INDEX "PoolBookingRequest_stadiumId_idx" ON "PoolBookingRequest"("stadiumId");
CREATE INDEX "PoolBookingRequest_fleetId_idx" ON "PoolBookingRequest"("fleetId");
CREATE INDEX "PoolBookingRequest_status_idx" ON "PoolBookingRequest"("status");
CREATE INDEX "PoolBookingRequest_requestToken_idx" ON "PoolBookingRequest"("requestToken");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
