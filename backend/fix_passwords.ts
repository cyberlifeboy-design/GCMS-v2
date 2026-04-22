import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    console.log('🔄 Fixing passwords...');

    const users = [
        { email: 'superadmin@gcms.com', password: 'Admin@2024!' },
        { email: 'admin@gcms.com', password: 'Admin@2024!' },
        { email: 'fa@gcms.com', password: 'FA@2024!' },
        { email: 'observer@gcms.com', password: 'Observer@2024!' },
    ];

    for (const u of users) {
        const hash = await bcrypt.hash(u.password, 10);
        await prisma.user.update({
            where: { email: u.email },
            data: { 
                passwordHash: hash,
                isActive: true,
                isBlocked: false
            }
        });
        console.log(`✅ Reset password for: ${u.email}`);
    }

    console.log('🎉 Fix complete!');
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
