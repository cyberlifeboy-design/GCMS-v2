-- AlterTable
ALTER TABLE "PoolBookingRequest" ADD COLUMN     "extensionRequestedAt" TIMESTAMP(3),
ADD COLUMN     "extensionRequestedEndDate" TEXT,
ADD COLUMN     "extensionRequestedEndTime" TEXT,
ADD COLUMN     "extensionStatus" TEXT,
ADD COLUMN     "overdueNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "reminderSentAt" TIMESTAMP(3);
