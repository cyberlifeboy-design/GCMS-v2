-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_HandoverForm" (
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
    "tcData" TEXT,
    "finalName" TEXT,
    "finalDate" TEXT,
    "finalSignatureData" TEXT,
    "adminSignatureData" TEXT,
    "adminSignedAt" DATETIME,
    "adminSignedById" TEXT,
    "userSignatureData" TEXT,
    "userSignedAt" DATETIME,
    "userSignedById" TEXT,
    "afteruseSignatureData" TEXT,
    "afteruseSignedAt" DATETIME,
    "afteruseSignedById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HandoverForm_fleetId_fkey" FOREIGN KEY ("fleetId") REFERENCES "Fleet" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HandoverForm_adminSignedById_fkey" FOREIGN KEY ("adminSignedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "HandoverForm_userSignedById_fkey" FOREIGN KEY ("userSignedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "HandoverForm_afteruseSignedById_fkey" FOREIGN KEY ("afteruseSignedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_HandoverForm" ("additionalDrivers", "adminSignatureData", "adminSignedAt", "adminSignedById", "approvedReturnDate", "cartTypeData", "conditionData", "createdAt", "faCode", "finalDate", "finalName", "finalSignatureData", "fleetId", "handedOverTo", "handoverBy", "handoverByContact", "handoverDate", "handoverLocation", "id", "inspectionDone", "issuesNotes", "receivedBy", "receiverContact", "receiverLicenseNo", "returnAdminSigData", "returnDate", "returnReceiverContact", "returnUserSigData", "returnedBy", "returnedByContact", "serialNumber", "status", "tc1", "tc2", "tc3", "tcData", "updatedAt", "userSignatureData", "userSignedAt", "userSignedById") SELECT "additionalDrivers", "adminSignatureData", "adminSignedAt", "adminSignedById", "approvedReturnDate", "cartTypeData", "conditionData", "createdAt", "faCode", "finalDate", "finalName", "finalSignatureData", "fleetId", "handedOverTo", "handoverBy", "handoverByContact", "handoverDate", "handoverLocation", "id", "inspectionDone", "issuesNotes", "receivedBy", "receiverContact", "receiverLicenseNo", "returnAdminSigData", "returnDate", "returnReceiverContact", "returnUserSigData", "returnedBy", "returnedByContact", "serialNumber", "status", "tc1", "tc2", "tc3", "tcData", "updatedAt", "userSignatureData", "userSignedAt", "userSignedById" FROM "HandoverForm";
DROP TABLE "HandoverForm";
ALTER TABLE "new_HandoverForm" RENAME TO "HandoverForm";
CREATE UNIQUE INDEX "HandoverForm_fleetId_key" ON "HandoverForm"("fleetId");
CREATE INDEX "HandoverForm_fleetId_idx" ON "HandoverForm"("fleetId");
CREATE INDEX "HandoverForm_status_idx" ON "HandoverForm"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
