-- AlterTable
ALTER TABLE "Incident" ADD COLUMN     "escalatedAt" TIMESTAMP(3),
ADD COLUMN     "escalatedToContracts" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "escalatedToMaintenance" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "formData" TEXT,
ADD COLUMN     "formSignatureData" TEXT,
ADD COLUMN     "formSignedAt" TIMESTAMP(3),
ADD COLUMN     "formSignedById" TEXT;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_formSignedById_fkey" FOREIGN KEY ("formSignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
