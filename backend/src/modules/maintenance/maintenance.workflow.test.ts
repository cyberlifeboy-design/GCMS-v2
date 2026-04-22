import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import app from '../../app';
import { prisma } from '../../config/database';

// Mock authentication middleware
vi.mock('../../middleware/auth.middleware', () => ({
    authenticate: (req: any, res: any, next: any) => {
        // We'll set the user in each test
        next();
    }
}));

describe('Maintenance Workflow', () => {
    let testFleet: any;
    let testUser: any;
    let contractUser: any;
    let maintenanceUser: any;

    beforeEach(async () => {
        // Clean up database in correct order
        await prisma.handoverLog.deleteMany();
        await prisma.maintenanceLog.deleteMany();
        await prisma.carRequest.deleteMany();
        await prisma.department.deleteMany();
        await prisma.fleet.deleteMany();
        await prisma.announcement.deleteMany();
        await prisma.auditLog.deleteMany();
        await prisma.notification.deleteMany();
        await prisma.refreshToken.deleteMany();
        await prisma.user.deleteMany();
        await prisma.stadium.deleteMany();
        await prisma.systemSettings.deleteMany();

        const stadium = await prisma.stadium.create({
            data: { name: 'Test Stadium', code: 'TEST', location: 'Test Location' }
        });

        testUser = await prisma.user.create({
            data: { name: 'Test User', email: 'test@test.com', passwordHash: 'hash', role: 'Admin' }
        });

        contractUser = await prisma.user.create({
            data: { name: 'Contract User', email: 'contract@test.com', passwordHash: 'hash', role: 'Contracts' }
        });

        maintenanceUser = await prisma.user.create({
            data: { name: 'Maint User', email: 'maint@test.com', passwordHash: 'hash', role: 'MaintenanceTeam' }
        });

        testFleet = await prisma.fleet.create({
            data: { carNumber: 'C123', carType: 'Cargo', stadiumId: stadium.id }
        });
    });

    it('should allow Contracts user to request a quotation', async () => {
        const log = await prisma.maintenanceLog.create({
            data: {
                fleetId: testFleet.id,
                reportedById: testUser.id,
                issueDescription: 'Broken wheel',
                status: 'Open'
            }
        });

        // Manually inject user into request for mock authenticate
        const response = await request(app)
            .post(`/api/v1/maintenance/${log.id}/request-quotation`)
            .set('user', JSON.stringify({ userId: contractUser.id, role: 'Contracts' }))
            .send();

        // Expect 404 because endpoint doesn't exist yet (TDD RED)
        expect(response.status).toBe(200);
        expect(response.body.quotationStatus).toBe('Requested');
        expect(response.body.status).toBe('PendingQuotation');
    });

    it('should allow MaintenanceTeam user to submit fix cost', async () => {
        const log = await prisma.maintenanceLog.create({
            data: {
                fleetId: testFleet.id,
                reportedById: testUser.id,
                issueDescription: 'Broken wheel',
                status: 'PendingQuotation',
                quotationStatus: 'Requested'
            }
        });

        const response = await request(app)
            .post(`/api/v1/maintenance/${log.id}/submit-cost`)
            .set('user', JSON.stringify({ userId: maintenanceUser.id, role: 'MaintenanceTeam' }))
            .send({ fixCost: 150.50 });

        expect(response.status).toBe(200);
        expect(response.body.fixCost).toBe(150.50);
        expect(response.body.quotationStatus).toBe('Submitted');
        expect(response.body.status).toBe('PendingApproval');
    });

    it('should allow Contracts user to approve fix cost', async () => {
        const log = await prisma.maintenanceLog.create({
            data: {
                fleetId: testFleet.id,
                reportedById: testUser.id,
                issueDescription: 'Broken wheel',
                status: 'PendingApproval',
                quotationStatus: 'Submitted',
                fixCost: 150.50
            }
        });

        const response = await request(app)
            .post(`/api/v1/maintenance/${log.id}/approve-cost`)
            .set('user', JSON.stringify({ userId: contractUser.id, role: 'Contracts' }))
            .send();

        expect(response.status).toBe(200);
        expect(response.body.quotationStatus).toBe('Approved');
        expect(response.body.status).toBe('InProgress');
        expect(response.body.approvedById).toBe(contractUser.id);
    });
});
