import { prisma } from '../../config/database';

export class DepartmentsService {
    async getAll(filters: { stadiumId?: string }) {
        return prisma.department.findMany({
            where: {
                stadiumId: filters.stadiumId,
            },
            include: {
                stadium: { select: { id: true, name: true, code: true } },
                focalPoint: { select: { id: true, name: true, email: true } },
                _count: { select: { users: true, fleet: true } }
            }
        });
    }

    async getById(id: string) {
        return prisma.department.findUnique({
            where: { id },
            include: { stadium: true }
        });
    }

    async create(data: { name: string; code?: string; stadiumId: string }) {
        return prisma.department.create({
            data,
        });
    }

    async createBulk(data: { name: string; code?: string; stadiumIds: string[] }) {
        const departments = await prisma.$transaction(
            data.stadiumIds.map(stadiumId =>
                prisma.department.upsert({
                    where: { name_stadiumId: { name: data.name, stadiumId } },
                    create: { name: data.name, code: data.code, stadiumId },
                    update: { code: data.code },
                    include: { stadium: { select: { name: true } } },
                })
            )
        );
        return departments;
    }

    async update(id: string, data: {
        name?: string; code?: string; isActive?: boolean;
        focalPointId?: string | null; focalPointName?: string | null; focalPointEmail?: string | null;
    }) {
        const update: Record<string, unknown> = { ...data };

        // Auto-link the venue focal point to a system user once their email (or,
        // failing that, their name) matches an existing FA account — without this,
        // focalPointName/Email are just free-text contact info for the venue.
        if (data.focalPointId === undefined && (data.focalPointEmail || data.focalPointName)) {
            const matched = await prisma.user.findFirst({
                where: {
                    role: 'FA',
                    OR: [
                        ...(data.focalPointEmail ? [{ email: { equals: data.focalPointEmail } }] : []),
                        ...(data.focalPointName ? [{ name: { equals: data.focalPointName } }] : []),
                    ],
                },
                select: { id: true },
            });
            update.focalPointId = matched?.id ?? null;
        }

        return prisma.department.update({
            where: { id },
            data: update,
            include: {
                stadium: { select: { id: true, name: true, code: true } },
                focalPoint: { select: { id: true, name: true, email: true } },
            },
        });
    }

    async delete(id: string) {
        return prisma.department.delete({
            where: { id },
        });
    }
}

export const departmentsService = new DepartmentsService();
