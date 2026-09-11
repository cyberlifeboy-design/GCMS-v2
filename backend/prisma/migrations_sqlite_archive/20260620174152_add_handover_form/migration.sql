-- CreateTable
CREATE TABLE "HandoverForm" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fleetId" TEXT NOT NULL,
    "serialNumber" TEXT,
    "faCode" TEXT,
    "handoverDate" TEXT,
    "approvedReturnDate" TEXT,
    "handoverLocation" TEXT,
    "receiverLicenseNo" TEXT,
    "handoverBy" TEXT,
    "handedOverTo" TEXT,
    "handoverByContact" TEXT,
    "receiverContact" TEXT,
    "cartTypeData" TEXT,
    "conditionData" TEXT,
    "additionalDrivers" TEXT,
    "issuesNotes" TEXT,
    "inspectionDone" TEXT,
    "returnDate" TEXT,
    "receivedBy" TEXT,
    "returnedBy" TEXT,
    "returnReceiverContact" TEXT,
    "returnedByContact" TEXT,
    "returnAdminSigData" TEXT,
    "returnUserSigData" TEXT,
    "tc1" BOOLEAN NOT NULL DEFAULT false,
    "tc2" BOOLEAN NOT NULL DEFAULT false,
    "tc3" BOOLEAN NOT NULL DEFAULT false,
    "finalName" TEXT,
    "finalDate" TEXT,
    "finalSignatureData" TEXT,
    "adminSignatureData" TEXT,
    "adminSignedAt" DATETIME,
    "adminSignedById" TEXT,
    "userSignatureData" TEXT,
    "userSignedAt" DATETIME,
    "userSignedById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HandoverForm_fleetId_fkey" FOREIGN KEY ("fleetId") REFERENCES "Fleet" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HandoverForm_adminSignedById_fkey" FOREIGN KEY ("adminSignedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "HandoverForm_userSignedById_fkey" FOREIGN KEY ("userSignedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "HandoverForm_fleetId_key" ON "HandoverForm"("fleetId");

-- CreateIndex
CREATE INDEX "HandoverForm_fleetId_idx" ON "HandoverForm"("fleetId");

-- CreateIndex
CREATE INDEX "HandoverForm_status_idx" ON "HandoverForm"("status");
