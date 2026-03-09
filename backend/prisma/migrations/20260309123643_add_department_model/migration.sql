-- AlterTable
ALTER TABLE "Fleet" ADD COLUMN     "departmentId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "departmentId" TEXT;

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "stadiumId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Department_stadiumId_idx" ON "Department"("stadiumId");

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_stadiumId_key" ON "Department"("name", "stadiumId");

-- CreateIndex
CREATE INDEX "Fleet_departmentId_idx" ON "Fleet"("departmentId");

-- CreateIndex
CREATE INDEX "User_departmentId_idx" ON "User"("departmentId");

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "Stadium"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fleet" ADD CONSTRAINT "Fleet_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
