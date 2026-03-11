-- Add exportFormat column to User table
ALTER TABLE "User" ADD COLUMN "exportFormat" TEXT NOT NULL DEFAULT 'xlsx';