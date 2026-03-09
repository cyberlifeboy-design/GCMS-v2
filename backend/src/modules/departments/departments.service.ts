import { prisma } from '../../config/database';

export class DepartmentsService {
    async getAll(filters: { stadiumId?: string }) {
        return prisma.department.findMany({
            where: {
                stadiumId: filters.stadiumId,
            },
            include: {
                stadium: { select: { name: true } },
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

    async update(id: string, data: { name?: string; code?: string }) {
        return prisma.department.update({
            where: { id },
            data,
        });
    }

    async delete(id: string) {
        return prisma.department.delete({
            where: { id },
        });
    }
}

export const departmentsService = new DepartmentsService();
