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

// Prisma model interfaces
export interface User {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    phone?: string;
    isActive: boolean;
    stadiumId?: string;
    stadium?: { id: string; name: string };
    createdAt: Date;
    updatedAt?: Date;
}

export interface Fleet {
    id: string;
    carNumber: string;
    carType: string;
    status: string;
    requiresVAP: boolean;
    stadiumId: string;
    stadium?: { id: string; name: string };
    departmentId?: string;
    department?: { id: string; name: string } | null;
    assignedUserId?: string;
    assignedUser?: { id: string; name: string } | null;
    createdAt: Date;
}

export interface HandoverLog {
    id: string;
    fleetId: string;
    fleet?: { carNumber: string; carType: string };
    userId: string;
    user?: { name: string; email: string };
    action: HandoverAction;
    timestamp: Date;
    conditionNotes?: string;
    photosUrls: string[];
    createdAt: Date;
}

export interface MaintenanceLog {
    id: string;
    fleetId: string;
    fleet?: { carNumber: string; carType: string };
    reportedById: string;
    reportedBy?: { name: string };
    issueDescription: string;
    photosUrls: string[];
    reportedAt: Date;
    status: MaintenanceStatus;
    resolutionNotes?: string;
    resolvedAt?: Date;
    createdAt: Date;
}

export interface Stadium {
    id: string;
    name: string;
    code: string;
    location: string;
    isActive: boolean;
    createdAt: Date;
}

export interface Department {
    id: string;
    name: string;
    code?: string;
    stadiumId: string;
    createdAt: Date;
}

export interface AuditLog {
    id: string;
    userId?: string;
    action: string;
    entityType: string;
    entityId?: string;
    details?: string;
    ipAddress?: string;
    timestamp: Date;
}

// Filter interfaces
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

// Dashboard stats interface
export interface DashboardStats {
    fleetByType: Array<{ type: string; count: number }>;
    fleetByStatus: Array<{ status: string; count: number }>;
    activeUsersCount: number;
    openIssuesCount: number;
    vapCartsCount: number;
    activityTimeline: Array<{ date: string; checkIn: number; checkOut: number }>;
}

export type HandoverAction = 'CheckedIn' | 'CheckedOut' | 'IssueReported';

export type MaintenanceStatus = 'Open' | 'InProgress' | 'Resolved';
