-- Add accreditationNumber and requestType to CarRequest table
ALTER TABLE "CarRequest" ADD COLUMN IF NOT EXISTS "accreditationNumber" TEXT;
ALTER TABLE "CarRequest" ADD COLUMN IF NOT EXISTS "requestType" TEXT NOT NULL DEFAULT 'one-time';
