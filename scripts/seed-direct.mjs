/**
 * Direct Prisma seed — FAC25 Venues & Departments
 * Runs against the DB directly, no HTTP needed.
 * Run: node scripts/seed-direct.mjs
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const VENUES = [
    { code: 'ABS', name: 'Al Bayet Stadium',               location: 'Al Khor, Qatar' },
    { code: 'AAS', name: 'Al Rayan Stadium',                location: 'Al Rayyan, Qatar' },
    { code: 'ECS', name: 'Education City Stadium',          location: 'Al Rayyan, Qatar' },
    { code: 'JHS', name: 'Al Janoub Stadium',               location: 'Al Wakrah, Qatar' },
    { code: 'KIS', name: 'Khalifa International Stadium',   location: 'Al Rayyan, Qatar' },
    { code: 'LUS', name: 'Lusail Stadium',                  location: 'Lusail, Qatar' },
    { code: 'ATS', name: 'Al Thumama Stadium',              location: 'Al Thumama, Qatar' },
    { code: '974', name: 'Stadium 974',                     location: 'Ras Abu Aboud, Qatar' },
];

const DEPARTMENTS = [
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
    console.log('🏟️  Upserting venues...');
    const venueIds = [];
    for (const v of VENUES) {
        const venue = await prisma.stadium.upsert({
            where: { code: v.code },
            create: { ...v, isActive: true },
            update: { name: v.name, location: v.location },
        });
        venueIds.push(venue.id);
        console.log(`  ✅ ${v.code} — ${v.name} (${venue.id})`);
    }

    console.log(`\n📂 Upserting ${DEPARTMENTS.length} departments × ${venueIds.length} venues...`);
    let created = 0, updated = 0;
    for (const dept of DEPARTMENTS) {
        for (const stadiumId of venueIds) {
            const result = await prisma.department.upsert({
                where: { name_stadiumId: { name: dept.name, stadiumId } },
                create: { name: dept.name, code: dept.code, stadiumId },
                update: { code: dept.code },
            });
            // Prisma upsert doesn't tell us create vs update, track via createdAt≈updatedAt
            const isNew = Math.abs(result.createdAt.getTime() - result.updatedAt.getTime()) < 1000;
            if (isNew) created++; else updated++;
        }
        process.stdout.write(`  ✅ [${dept.code}] ${dept.name}\n`);
    }

    const total = await prisma.department.count();
    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎉 Seed complete!
   Venues  : ${venueIds.length}
   Dept rows in DB : ${total}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
