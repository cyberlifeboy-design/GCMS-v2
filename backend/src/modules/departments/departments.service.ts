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
        // Create departments for all specified stadiums
        // Using transaction to ensure atomicity
        const departments = await prisma.$transaction(
            data.stadiumIds.map(stadiumId =>
                prisma.department.create({
                    data: {
                        name: data.name,
                        code: data.code,
                        stadiumId,
                    },
                    include: {
                        stadium: { select: { name: true } },
                    },
                })
            )
        );
        return departments;
    }

    async update(id: string, data: { name?: string; code?: string; focalPointId?: string | null }) {
        return prisma.department.update({
            where: { id },
            data,
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
