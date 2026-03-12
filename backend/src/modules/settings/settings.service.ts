import { prisma } from '../../config/database';
import { uploadFile } from '../../config/storage';

export class SettingsService {
    async get() {
        let settings = await prisma.systemSettings.findFirst();
        if (!settings) {
            // Auto-create default settings
            settings = await prisma.systemSettings.create({
                data: { tournamentName: 'Golf Cart Management System' },
            });
        }
        return settings;
    }

    async update(data: Partial<{
        tournamentName: string;
        logoUrl: string | null;
        headerUrl: string | null;
        footerUrl: string | null;
        footerText: string | null;
        maintenanceNotificationEmails: string | null;
        handoverTimeoutMinutes: number;
        defaultStadiumId: string | null;
        // Feature toggles
        enableMaintenanceReports: boolean;
        enableHandoverPhotos: boolean;
        enableFleetManagement: boolean;
        enableCarRequests: boolean;
        enableUserImport: boolean;
        enableBulkOperations: boolean;
        enableAdvancedReports: boolean;
        enableAssignmentMatrix: boolean;
        // System announcement (legacy)
        systemAnnouncement: string | null;
        announcementExpiry: Date | null;
        // Handover duration settings
        handoverDefaultDurationDays: number;
        handoverEventStartDate: Date | null;
        handoverEventEndDate: Date | null;
        enableHandoverReminder: boolean;
        handoverReminderHoursBefore: number;
        // Timezone settings
        timezone: string | null;
    }>, updatedById?: string) {
        const existing = await this.get();
        return prisma.systemSettings.update({
            where: { id: existing.id },
            data: { ...data, updatedById },
        });
    }

    async uploadBrandingAsset(filename: string, buffer: Buffer, contentType: string): Promise<string> {
        return uploadFile('branding', filename, buffer, contentType);
    }
}

export const settingsService = new SettingsService();
