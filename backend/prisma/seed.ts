import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding database...');

    // Create default stadium
    const stadium = await prisma.stadium.upsert({
        where: { code: 'MAIN' },
        update: {},
        create: {
            name: 'Main Venue',
            code: 'MAIN',
            location: 'Qatar',
        },
    });
    console.log('✅ Stadium:', stadium.name);

    // Super Admin
    const superAdminHash = await bcrypt.hash('Admin@2024!', 10);
    const superAdmin = await prisma.user.upsert({
        where: { email: 'superadmin@gcms.com' },
        update: {},
        create: {
            name: 'Super Admin',
            email: 'superadmin@gcms.com',
            passwordHash: superAdminHash,
            role: 'SuperAdmin',
            isActive: true,
        },
    });
    console.log('✅ SuperAdmin:', superAdmin.email);

    // Admin (scoped to the main stadium)
    const adminHash = await bcrypt.hash('Admin@2024!', 10);
    const admin = await prisma.user.upsert({
        where: { email: 'admin@gcms.com' },
        update: {},
        create: {
            name: 'Venue Admin',
            email: 'admin@gcms.com',
            passwordHash: adminHash,
            role: 'Admin',
            isActive: true,
            stadiumId: stadium.id,
        },
    });
    console.log('✅ Admin:', admin.email);

    // FA user
    const faHash = await bcrypt.hash('FA@2024!', 10);
    const fa = await prisma.user.upsert({
        where: { email: 'fa@gcms.com' },
        update: {},
        create: {
            name: 'Fleet Attendant',
            email: 'fa@gcms.com',
            passwordHash: faHash,
            role: 'FA',
            isActive: true,
            stadiumId: stadium.id,
        },
    });
    console.log('✅ FA:', fa.email);

    // Observer
    const observerHash = await bcrypt.hash('Observer@2024!', 10);
    const observer = await prisma.user.upsert({
        where: { email: 'observer@gcms.com' },
        update: {},
        create: {
            name: 'Observer',
            email: 'observer@gcms.com',
            passwordHash: observerHash,
            role: 'Observer',
            isActive: true,
        },
    });
    console.log('✅ Observer:', observer.email);

    console.log('\n🎉 Seeding complete!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Credentials:');
    console.log('  SuperAdmin  superadmin@gcms.com  Admin@2024!');
    console.log('  Admin       admin@gcms.com       Admin@2024!');
    console.log('  FA          fa@gcms.com          FA@2024!');
    console.log('  Observer    observer@gcms.com    Observer@2024!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
    .catch((e) => {
        console.error('Seed error:', e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
