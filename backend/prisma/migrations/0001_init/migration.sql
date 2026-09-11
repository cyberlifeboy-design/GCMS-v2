-- CreateTable
CREATE TABLE "Stadium" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "poolBookingStartTime" TEXT,
    "poolBookingEndTime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stadium_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "stadiumId" TEXT NOT NULL,
    "focalPointId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fleet" (
    "id" TEXT NOT NULL,
    "carNumber" TEXT NOT NULL,
    "carType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Available',
    "requiresVAP" BOOLEAN NOT NULL DEFAULT false,
    "stadiumId" TEXT NOT NULL,
    "departmentId" TEXT,
    "assignedUserId" TEXT,
    "handoverSigned" BOOLEAN NOT NULL DEFAULT false,
    "handoverSignedAt" TIMESTAMP(3),
    "checkedInAt" TIMESTAMP(3),
    "additionalDrivers" TEXT DEFAULT '[]',
    "isPool" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fleet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "phone" TEXT,
    "accreditationNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "resetPasswordToken" TEXT,
    "resetPasswordExpires" TIMESTAMP(3),
    "exportFormat" TEXT NOT NULL DEFAULT 'xlsx',
    "exportPreferences" TEXT,
    "assignAllStadiums" BOOLEAN NOT NULL DEFAULT false,
    "grantedPages" TEXT DEFAULT '[]',
    "venueReportAccess" TEXT NOT NULL DEFAULT 'assigned',
    "stadiumId" TEXT,
    "departmentId" TEXT,
    "blockedAt" TIMESTAMP(3),
    "blockedReason" TEXT,
    "blockedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandoverLog" (
    "id" TEXT NOT NULL,
    "fleetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conditionNotes" TEXT,
    "photosUrls" TEXT DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HandoverLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceLog" (
    "id" TEXT NOT NULL,
    "fleetId" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,
    "issueDescription" TEXT NOT NULL,
    "issueType" TEXT,
    "photosUrls" TEXT DEFAULT '[]',
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "resolutionNotes" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "quotationStatus" TEXT,
    "fixCost" DOUBLE PRECISION,
    "quotationDescription" TEXT,
    "quotationTimeline" TEXT,
    "quotationRequestedAt" TIMESTAMP(3),
    "costSubmittedAt" TIMESTAMP(3),
    "costApprovedAt" TIMESTAMP(3),
    "contractsEscalatedAt" TIMESTAMP(3),
    "contractsEscalatedById" TEXT,
    "rejectionReason" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSettings" (
    "id" TEXT NOT NULL,
    "tournamentName" TEXT NOT NULL DEFAULT 'Golf Cart Management System',
    "logoUrl" TEXT,
    "headerUrl" TEXT,
    "footerUrl" TEXT,
    "footerText" TEXT,
    "maintenanceNotificationEmails" TEXT,
    "handoverTimeoutMinutes" INTEGER NOT NULL DEFAULT 120,
    "defaultStadiumId" TEXT,
    "enableMaintenanceReports" BOOLEAN NOT NULL DEFAULT true,
    "enableHandoverPhotos" BOOLEAN NOT NULL DEFAULT true,
    "enableFleetManagement" BOOLEAN NOT NULL DEFAULT true,
    "enableCarRequests" BOOLEAN NOT NULL DEFAULT true,
    "enableUserImport" BOOLEAN NOT NULL DEFAULT true,
    "enableBulkOperations" BOOLEAN NOT NULL DEFAULT true,
    "enableAdvancedReports" BOOLEAN NOT NULL DEFAULT true,
    "enableAssignmentMatrix" BOOLEAN NOT NULL DEFAULT true,
    "requestWindowMode" TEXT NOT NULL DEFAULT 'open',
    "requestWindowStart" TIMESTAMP(3),
    "requestWindowEnd" TIMESTAMP(3),
    "requestWindowClosedMessage" TEXT,
    "systemAnnouncement" TEXT,
    "announcementExpiry" TIMESTAMP(3),
    "handoverDefaultDurationDays" INTEGER NOT NULL DEFAULT 1,
    "handoverEventStartDate" TIMESTAMP(3),
    "handoverEventEndDate" TIMESTAMP(3),
    "enableHandoverReminder" BOOLEAN NOT NULL DEFAULT true,
    "handoverReminderHoursBefore" INTEGER NOT NULL DEFAULT 1,
    "timezone" TEXT DEFAULT 'UTC',
    "handoverTcEnTitle" TEXT,
    "handoverTcEnBody" TEXT,
    "handoverTcArTitle" TEXT,
    "handoverTcArBody" TEXT,
    "handoverTcCheckboxes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "SystemSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'info',
    "targetType" TEXT NOT NULL DEFAULT 'all',
    "targetUserIds" TEXT DEFAULT '[]',
    "targetRole" TEXT,
    "stadiumId" TEXT,
    "createdBy" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarRequest" (
    "id" TEXT NOT NULL,
    "requesterName" TEXT NOT NULL,
    "requesterEmail" TEXT NOT NULL,
    "requesterPhone" TEXT,
    "accreditationNumber" TEXT,
    "requestType" TEXT NOT NULL DEFAULT 'pool-shared',
    "departmentId" TEXT NOT NULL,
    "stadiumId" TEXT NOT NULL,
    "cargoCount" INTEGER NOT NULL DEFAULT 0,
    "fourSeaterCount" INTEGER NOT NULL DEFAULT 0,
    "sixSeaterCount" INTEGER NOT NULL DEFAULT 0,
    "accessibilityCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "requestToken" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandoverForm" (
    "id" TEXT NOT NULL,
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
    "adminSignedAt" TIMESTAMP(3),
    "adminSignedById" TEXT,
    "userSignatureData" TEXT,
    "userSignedAt" TIMESTAMP(3),
    "userSignedById" TEXT,
    "afteruseSignatureData" TEXT,
    "afteruseSignedAt" TIMESTAMP(3),
    "afteruseSignedById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HandoverForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoolBooking" (
    "id" TEXT NOT NULL,
    "fleetId" TEXT NOT NULL,
    "driverName" TEXT NOT NULL,
    "driverPhone" TEXT,
    "accreditationNumber" TEXT,
    "purpose" TEXT,
    "checkoutAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedReturnAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'Active',
    "returnNotes" TEXT,
    "createdById" TEXT NOT NULL,
    "returnedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PoolBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoolBookingRequest" (
    "id" TEXT NOT NULL,
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
    "reviewedAt" TIMESTAMP(3),
    "reviewComment" TEXT,
    "returnedAt" TIMESTAMP(3),
    "returnedById" TEXT,
    "requestToken" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PoolBookingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "subjectUserId" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,
    "fleetId" TEXT,
    "stadiumId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "photosUrls" TEXT DEFAULT '[]',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warning" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "incidentId" TEXT,
    "level" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "issuedById" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "revokedById" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Warning_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Stadium_code_key" ON "Stadium"("code");

-- CreateIndex
CREATE INDEX "Department_stadiumId_idx" ON "Department"("stadiumId");

-- CreateIndex
CREATE INDEX "Department_focalPointId_idx" ON "Department"("focalPointId");

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_stadiumId_key" ON "Department"("name", "stadiumId");

-- CreateIndex
CREATE UNIQUE INDEX "Fleet_carNumber_key" ON "Fleet"("carNumber");

-- CreateIndex
CREATE INDEX "Fleet_stadiumId_idx" ON "Fleet"("stadiumId");

-- CreateIndex
CREATE INDEX "Fleet_status_idx" ON "Fleet"("status");

-- CreateIndex
CREATE INDEX "Fleet_assignedUserId_idx" ON "Fleet"("assignedUserId");

-- CreateIndex
CREATE INDEX "Fleet_departmentId_idx" ON "Fleet"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_resetPasswordToken_key" ON "User"("resetPasswordToken");

-- CreateIndex
CREATE INDEX "User_stadiumId_idx" ON "User"("stadiumId");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_departmentId_idx" ON "User"("departmentId");

-- CreateIndex
CREATE INDEX "User_isBlocked_idx" ON "User"("isBlocked");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "HandoverLog_fleetId_idx" ON "HandoverLog"("fleetId");

-- CreateIndex
CREATE INDEX "HandoverLog_userId_idx" ON "HandoverLog"("userId");

-- CreateIndex
CREATE INDEX "HandoverLog_timestamp_idx" ON "HandoverLog"("timestamp");

-- CreateIndex
CREATE INDEX "MaintenanceLog_fleetId_idx" ON "MaintenanceLog"("fleetId");

-- CreateIndex
CREATE INDEX "MaintenanceLog_status_idx" ON "MaintenanceLog"("status");

-- CreateIndex
CREATE INDEX "MaintenanceLog_reportedById_idx" ON "MaintenanceLog"("reportedById");

-- CreateIndex
CREATE INDEX "Announcement_type_idx" ON "Announcement"("type");

-- CreateIndex
CREATE INDEX "Announcement_targetType_idx" ON "Announcement"("targetType");

-- CreateIndex
CREATE INDEX "Announcement_isActive_idx" ON "Announcement"("isActive");

-- CreateIndex
CREATE INDEX "Announcement_scheduledAt_idx" ON "Announcement"("scheduledAt");

-- CreateIndex
CREATE INDEX "Announcement_expiresAt_idx" ON "Announcement"("expiresAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_idx" ON "AuditLog"("entityType");

-- CreateIndex
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "CarRequest_requestToken_key" ON "CarRequest"("requestToken");

-- CreateIndex
CREATE INDEX "CarRequest_status_idx" ON "CarRequest"("status");

-- CreateIndex
CREATE INDEX "CarRequest_stadiumId_idx" ON "CarRequest"("stadiumId");

-- CreateIndex
CREATE INDEX "CarRequest_departmentId_idx" ON "CarRequest"("departmentId");

-- CreateIndex
CREATE INDEX "CarRequest_requestToken_idx" ON "CarRequest"("requestToken");

-- CreateIndex
CREATE UNIQUE INDEX "HandoverForm_fleetId_key" ON "HandoverForm"("fleetId");

-- CreateIndex
CREATE INDEX "HandoverForm_fleetId_idx" ON "HandoverForm"("fleetId");

-- CreateIndex
CREATE INDEX "HandoverForm_status_idx" ON "HandoverForm"("status");

-- CreateIndex
CREATE INDEX "PoolBooking_fleetId_idx" ON "PoolBooking"("fleetId");

-- CreateIndex
CREATE INDEX "PoolBooking_status_idx" ON "PoolBooking"("status");

-- CreateIndex
CREATE INDEX "PoolBooking_createdById_idx" ON "PoolBooking"("createdById");

-- CreateIndex
CREATE INDEX "PoolBooking_checkoutAt_idx" ON "PoolBooking"("checkoutAt");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_isRead_idx" ON "Notification"("isRead");

-- CreateIndex
CREATE INDEX "Notification_type_idx" ON "Notification"("type");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

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

-- CreateIndex
CREATE UNIQUE INDEX "Incident_reference_key" ON "Incident"("reference");

-- CreateIndex
CREATE INDEX "Incident_subjectUserId_idx" ON "Incident"("subjectUserId");

-- CreateIndex
CREATE INDEX "Incident_status_idx" ON "Incident"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Warning_reference_key" ON "Warning"("reference");

-- CreateIndex
CREATE INDEX "Warning_userId_idx" ON "Warning"("userId");

-- CreateIndex
CREATE INDEX "Warning_level_idx" ON "Warning"("level");

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "Stadium"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_focalPointId_fkey" FOREIGN KEY ("focalPointId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fleet" ADD CONSTRAINT "Fleet_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "Stadium"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fleet" ADD CONSTRAINT "Fleet_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fleet" ADD CONSTRAINT "Fleet_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "Stadium"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_blockedById_fkey" FOREIGN KEY ("blockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoverLog" ADD CONSTRAINT "HandoverLog_fleetId_fkey" FOREIGN KEY ("fleetId") REFERENCES "Fleet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoverLog" ADD CONSTRAINT "HandoverLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceLog" ADD CONSTRAINT "MaintenanceLog_fleetId_fkey" FOREIGN KEY ("fleetId") REFERENCES "Fleet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceLog" ADD CONSTRAINT "MaintenanceLog_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceLog" ADD CONSTRAINT "MaintenanceLog_contractsEscalatedById_fkey" FOREIGN KEY ("contractsEscalatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceLog" ADD CONSTRAINT "MaintenanceLog_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarRequest" ADD CONSTRAINT "CarRequest_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarRequest" ADD CONSTRAINT "CarRequest_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "Stadium"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarRequest" ADD CONSTRAINT "CarRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoverForm" ADD CONSTRAINT "HandoverForm_fleetId_fkey" FOREIGN KEY ("fleetId") REFERENCES "Fleet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoverForm" ADD CONSTRAINT "HandoverForm_adminSignedById_fkey" FOREIGN KEY ("adminSignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoverForm" ADD CONSTRAINT "HandoverForm_userSignedById_fkey" FOREIGN KEY ("userSignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoverForm" ADD CONSTRAINT "HandoverForm_afteruseSignedById_fkey" FOREIGN KEY ("afteruseSignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolBooking" ADD CONSTRAINT "PoolBooking_fleetId_fkey" FOREIGN KEY ("fleetId") REFERENCES "Fleet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolBooking" ADD CONSTRAINT "PoolBooking_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolBooking" ADD CONSTRAINT "PoolBooking_returnedById_fkey" FOREIGN KEY ("returnedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolBookingRequest" ADD CONSTRAINT "PoolBookingRequest_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "Stadium"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolBookingRequest" ADD CONSTRAINT "PoolBookingRequest_fleetId_fkey" FOREIGN KEY ("fleetId") REFERENCES "Fleet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolBookingRequest" ADD CONSTRAINT "PoolBookingRequest_faUserId_fkey" FOREIGN KEY ("faUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolBookingRequest" ADD CONSTRAINT "PoolBookingRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolBookingRequest" ADD CONSTRAINT "PoolBookingRequest_returnedById_fkey" FOREIGN KEY ("returnedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolBookingRequest" ADD CONSTRAINT "PoolBookingRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_fleetId_fkey" FOREIGN KEY ("fleetId") REFERENCES "Fleet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "Stadium"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warning" ADD CONSTRAINT "Warning_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warning" ADD CONSTRAINT "Warning_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warning" ADD CONSTRAINT "Warning_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warning" ADD CONSTRAINT "Warning_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

