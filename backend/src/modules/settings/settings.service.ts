import { prisma } from '../../config/database';
import { uploadFile } from '../../config/storage';
import { computeRequestWindow, RequestWindowState } from './request-window';

export class SettingsService {
    async get() {
        let settings = await prisma.systemSettings.findFirst();
        if (!settings) {
            // Auto-create default settings
            settings = await prisma.systemSettings.create({
                data: { tournamentName: 'SC - GCMS' },
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
        // Request window
        requestWindowMode: string;
        requestWindowStart: Date | null;
        requestWindowEnd: Date | null;
        requestWindowClosedMessage: string | null;
        // Booking window
        enableBookings: boolean;
        bookingWindowMode: string;
        bookingWindowStart: Date | null;
        bookingWindowEnd: Date | null;
        bookingWindowClosedMessage: string | null;
        // Handover T&C
        handoverTcEnTitle: string | null;
        handoverTcEnBody: string | null;
        handoverTcArTitle: string | null;
        handoverTcArBody: string | null;
        handoverTcCheckboxes: string | null;
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

    async getRequestWindowState(): Promise<RequestWindowState> {
        const s = await this.get();
        return computeRequestWindow(
            {
                requestWindowMode: s.requestWindowMode,
                requestWindowStart: s.requestWindowStart,
                requestWindowEnd: s.requestWindowEnd,
                requestWindowClosedMessage: s.requestWindowClosedMessage,
            },
            new Date(),
        );
    }

    /** Independent of getRequestWindowState — controls the "Bookings" channel separately. */
    async getBookingWindowState(): Promise<RequestWindowState> {
        const s = await this.get();
        return computeRequestWindow(
            {
                requestWindowMode: s.bookingWindowMode,
                requestWindowStart: s.bookingWindowStart,
                requestWindowEnd: s.bookingWindowEnd,
                requestWindowClosedMessage: s.bookingWindowClosedMessage,
            },
            new Date(),
        );
    }
}

export const settingsService = new SettingsService();
