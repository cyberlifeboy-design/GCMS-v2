import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// ─── Default Venues (FAC25) ───────────────────────────────────────────────────
const DEFAULT_VENUES = [
    { code: 'ABS', name: 'Al Bayet Stadium',              location: 'Al Khor, Qatar' },
    { code: 'AAS', name: 'Al Rayan Stadium',               location: 'Al Rayyan, Qatar' },
    { code: 'ECS', name: 'Education City Stadium',         location: 'Al Rayyan, Qatar' },
    { code: 'JHS', name: 'Al Janoub Stadium',              location: 'Al Wakrah, Qatar' },
    { code: 'KIS', name: 'Khalifa International Stadium',  location: 'Al Rayyan, Qatar' },
    { code: 'LUS', name: 'Lusail Stadium',                 location: 'Lusail, Qatar' },
    { code: 'ATS', name: 'Al Thumama Stadium',             location: 'Al Thumama, Qatar' },
    { code: '974', name: 'Stadium 974',                    location: 'Ras Abu Aboud, Qatar' },
];

// ─── Default Departments / Functional Areas (FAC25) ──────────────────────────
const DEFAULT_DEPARTMENTS = [
    { code: 'ADM', name: 'Administration Support' },
    { code: 'HRS', name: 'Human Resources' },
    { code: 'ICT', name: 'ICT' },
    { code: 'WKF', name: 'Workforce' },
    { code: 'COM', name: 'Communications' },
    { code: 'LAN', name: 'Languages Services' },
    { code: 'MER', name: 'Media Relations' },
    { code: 'SHM', name: 'Stakeholder Management' },
    { code: 'CMP', name: 'Competition Management' },
    { code: 'RSV', name: 'Referee Services' },
    { code: 'TSV', name: 'Team Services' },
    { code: 'TFS', name: 'Teams Facilities' },
    { code: 'ACC', name: 'Accommodation' },
    { code: 'AND', name: 'Arrivals & Departures' },
    { code: 'CAT', name: 'Catering' },
    { code: 'FNB', name: 'F&B Concessions' },
    { code: 'GOR', name: 'Government Relations' },
    { code: 'GRE', name: 'Guest Relations' },
    { code: 'LOG', name: 'Logistics' },
    { code: 'MED', name: 'Medical' },
    { code: 'MOB', name: 'Mobility' },
    { code: 'TRA', name: 'Travel Services' },
    { code: 'FNP', name: 'Finance & Procurement' },
    { code: 'CEO', name: 'CEO Office' },
    { code: 'EXP', name: 'Experience (CEO)' },
    { code: 'GAF', name: 'Guest Affairs' },
    { code: 'BRP', name: 'Brand Protection' },
    { code: 'LGL', name: 'Legal' },
    { code: 'BMR', name: 'Broadcasting & Media Rights' },
    { code: 'CER', name: 'Ceremonies & Infotainment' },
    { code: 'ECR', name: 'Events & Community Relations' },
    { code: 'HOS', name: 'Hospitality' },
    { code: 'LIC', name: 'Licensing & Merchandise' },
    { code: 'MKP', name: 'Marketing & Promotion' },
    { code: 'MRD', name: 'Marketing Rights Delivery' },
    { code: 'SHU', name: 'Shukran' },
    { code: 'SGN', name: 'Signage & Dressing' },
    { code: 'TKT', name: 'Ticketing' },
    { code: 'ACS', name: 'Access Management' },
    { code: 'ACR', name: 'Accreditation' },
    { code: 'BRO', name: 'Broadcast Operations' },
    { code: 'BRS', name: 'Broadcast Services' },
    { code: 'CLW', name: 'Cleaning & Waste' },
    { code: 'SFM', name: 'Facility & Stadium Management' },
    { code: 'GOP', name: 'Guest Operations' },
    { code: 'HSE', name: 'Health & Safety' },
    { code: 'MAP', name: 'Maps & Drawing' },
    { code: 'MEO', name: 'Media Operations' },
    { code: 'OVL', name: 'Overlay' },
    { code: 'PWR', name: 'Power' },
    { code: 'SPS', name: 'Spectator Services' },
    { code: 'SSI', name: 'Security Systems Integration' },
    { code: 'VUM', name: 'Venue Management' },
    { code: 'PLI', name: 'Planning & Integration' },
    { code: 'PMO', name: 'Project Management Office' },
    { code: 'UEX', name: 'Experience (Project Mgmt)' },
    { code: 'SFG', name: 'Safeguarding' },
    { code: 'SUS', name: 'Sustainability' },
    { code: 'HAY', name: 'Hayya' },
    { code: 'SEC', name: 'SSOC' },
];

async function main() {
    console.log('🌱 Seeding database...');

    // ── Venues ────────────────────────────────────────────────────────────────
    const venueIds: string[] = [];
    for (const v of DEFAULT_VENUES) {
        const venue = await prisma.stadium.upsert({
            where: { code: v.code },
            update: { name: v.name, location: v.location },
            create: { ...v, isActive: true },
        });
        venueIds.push(venue.id);
        console.log(`✅ Stadium: ${venue.code} — ${venue.name}`);
    }

    // ── Departments (all venues) ──────────────────────────────────────────────
    let deptCount = 0;
    for (const dept of DEFAULT_DEPARTMENTS) {
        for (const stadiumId of venueIds) {
            await prisma.department.upsert({
                where: { name_stadiumId: { name: dept.name, stadiumId } },
                create: { name: dept.name, code: dept.code, stadiumId },
                update: { code: dept.code },
            });
            deptCount++;
        }
    }
    console.log(`✅ Departments: ${DEFAULT_DEPARTMENTS.length} FAs × ${venueIds.length} venues = ${deptCount} records`);

    // ── Default Users ─────────────────────────────────────────────────────────
    const firstVenueId = venueIds[0];

    const superAdmin = await prisma.user.upsert({
        where: { email: 'superadmin@gcms.com' },
        update: {},
        create: {
            name: 'Super Admin',
            email: 'superadmin@gcms.com',
            passwordHash: await bcrypt.hash('Admin@2024!', 10),
            role: 'SuperAdmin',
            isActive: true,
        },
    });
    console.log(`✅ SuperAdmin: ${superAdmin.email}`);

    const admin = await prisma.user.upsert({
        where: { email: 'admin@gcms.com' },
        update: {},
        create: {
            name: 'Venue Admin',
            email: 'admin@gcms.com',
            passwordHash: await bcrypt.hash('Admin@2024!', 10),
            role: 'Admin',
            isActive: true,
            stadiumId: firstVenueId,
        },
    });
    console.log(`✅ Admin: ${admin.email}`);

    const fa = await prisma.user.upsert({
        where: { email: 'fa@gcms.com' },
        update: {},
        create: {
            name: 'Fleet Attendant',
            email: 'fa@gcms.com',
            passwordHash: await bcrypt.hash('FA@2024!', 10),
            role: 'FA',
            isActive: true,
            stadiumId: firstVenueId,
        },
    });
    console.log(`✅ FA: ${fa.email}`);

    const observer = await prisma.user.upsert({
        where: { email: 'observer@gcms.com' },
        update: {},
        create: {
            name: 'Observer',
            email: 'observer@gcms.com',
            passwordHash: await bcrypt.hash('Observer@2024!', 10),
            role: 'Observer',
            isActive: true,
        },
    });
    console.log(`✅ Observer: ${observer.email}`);

    console.log('\n🎉 Seeding complete!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Venues     : ${venueIds.length} (ABS · AAS · ECS · JHS · KIS · LUS · ATS · 974)`);
    console.log(`Departments: ${DEFAULT_DEPARTMENTS.length} FAs × ${venueIds.length} venues`);
    console.log('Credentials:');
    console.log('  SuperAdmin  superadmin@gcms.com  Admin@2024!');
    console.log('  Admin       admin@gcms.com       Admin@2024!');
    console.log('  FA          fa@gcms.com          FA@2024!');
    console.log('  Observer    observer@gcms.com    Observer@2024!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
    .catch((e) => { console.error('Seed error:', e); process.exit(1); })
    .finally(() => prisma.$disconnect());
