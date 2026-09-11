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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Fleet_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "Stadium" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Fleet_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Fleet_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Fleet" ("assignedUserId", "carNumber", "carType", "createdAt", "departmentId", "id", "requiresVAP", "stadiumId", "status", "updatedAt") SELECT "assignedUserId", "carNumber", "carType", "createdAt", "departmentId", "id", "requiresVAP", "stadiumId", "status", "updatedAt" FROM "Fleet";
DROP TABLE "Fleet";
ALTER TABLE "new_Fleet" RENAME TO "Fleet";
CREATE UNIQUE INDEX "Fleet_carNumber_key" ON "Fleet"("carNumber");
CREATE INDEX "Fleet_stadiumId_idx" ON "Fleet"("stadiumId");
CREATE INDEX "Fleet_status_idx" ON "Fleet"("status");
CREATE INDEX "Fleet_assignedUserId_idx" ON "Fleet"("assignedUserId");
CREATE INDEX "Fleet_departmentId_idx" ON "Fleet"("departmentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
