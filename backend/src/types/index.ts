export type UserRole = 'SuperAdmin' | 'Admin' | 'FA' | 'Observer';

export interface PaginationParams {
    page?: number;
    limit?: number;
}

export interface PaginatedResult<T> {
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

export interface FleetFilters {
    stadiumId?: string;
    assignedUserId?: string;
    status?: string;
    carType?: string;
    requiresVAP?: boolean;
}

export interface AuditLogFilters {
    userId?: string;
    action?: string;
    entityType?: string;
    startDate?: Date;
    endDate?: Date;
}

export interface HandoverFilters {
    fleetId?: string;
    userId?: string;
    action?: string;
    stadiumId?: string;
    startDate?: Date;
    endDate?: Date;
}

export interface MaintenanceFilters {
    fleetId?: string;
    status?: string;
    stadiumId?: string;
    reportedById?: string;
}

export type HandoverAction = 'CheckedIn' | 'CheckedOut' | 'IssueReported';

export type MaintenanceStatus = 'Open' | 'InProgress' | 'Resolved';
