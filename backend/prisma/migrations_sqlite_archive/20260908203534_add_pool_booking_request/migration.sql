-- AlterTable
ALTER TABLE "Stadium" ADD COLUMN "poolBookingEndTime" TEXT;
ALTER TABLE "Stadium" ADD COLUMN "poolBookingStartTime" TEXT;

-- CreateTable
CREATE TABLE "PoolBookingRequest" (
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
    "requestToken" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PoolBookingRequest_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "Stadium" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PoolBookingRequest_fleetId_fkey" FOREIGN KEY ("fleetId") REFERENCES "Fleet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PoolBookingRequest_faUserId_fkey" FOREIGN KEY ("faUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PoolBookingRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PoolBookingRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PoolBookingRequest_requestToken_key" ON "PoolBookingRequest"("requestToken");

-- CreateIndex
CREATE INDEX "PoolBookingRequest_stadiumId_idx" ON "PoolBookingRequest"("stadiumId");

-- CreateIndex
CREATE INDEX "PoolBookingRequest_fleetId_idx" ON "PoolBookingRequest"("fleetId");

-- CreateIndex
CREATE INDEX "PoolBookingRequest_status_idx" ON "PoolBookingRequest"("status");

-- CreateIndex
CREATE INDEX "PoolBookingRequest_requestToken_idx" ON "PoolBookingRequest"("requestToken");
