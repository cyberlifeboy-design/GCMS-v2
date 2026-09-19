/**
 * Dummy/demo data generator for local development.
 * Adds realistic fleet, handover, maintenance, car-request, pool-booking,
 * notification and announcement records across all seeded venues.
 * Safe to re-run: skips creation where matching unique keys already exist.
 */
import { prisma } from '../src/config/database';
import bcrypt from 'bcrypt';

const CAR_TYPES = ['Cargo', 'Accessibility', '6-Seater', '4-Seater'];
const FLEET_STATUSES = ['Available', 'Assigned', 'Active', 'Dispatched', 'Returned', 'Under Maintenance'];
const ISSUE_TYPES = ['Battery and electrical issue', 'Body damage', 'Tyre issue', 'Brake issue', 'Other'];

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function main() {
  console.log('🌱 Seeding dummy demo data...');

  const stadiums = await prisma.stadium.findMany({ orderBy: { code: 'asc' } });
  if (stadiums.length === 0) {
    console.error('No stadiums found — run `npm run prisma:seed` first.');
    process.exit(1);
  }

  // ── Dummy FA + Admin users per venue ──────────────────────────────────────
  // Fallback passwords are LOCAL-DEV-ONLY (public in this repo) — set SEED_FA_PASSWORD /
  // SEED_ADMIN_PASSWORD for any shared/staging seed run.
  const usingDefaultPasswords = !process.env.SEED_FA_PASSWORD || !process.env.SEED_ADMIN_PASSWORD;
  const faPasswordHash = await bcrypt.hash(process.env.SEED_FA_PASSWORD || 'FA@2024!', 10);
  const adminPasswordHash = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD || 'Admin@2024!', 10);

  const faUsersByStadium: Record<string, { id: string }[]> = {};

  for (const stadium of stadiums) {
    const depts = await prisma.department.findMany({ where: { stadiumId: stadium.id }, take: 3 });

    const admin = await prisma.user.upsert({
      where: { email: `admin.${stadium.code.toLowerCase()}@gcms.com` },
      update: {},
      create: {
        name: `${stadium.name} Admin`,
        email: `admin.${stadium.code.toLowerCase()}@gcms.com`,
        passwordHash: adminPasswordHash,
        role: 'Admin',
        isActive: true,
        stadiumId: stadium.id,
        mustChangePassword: usingDefaultPasswords,
      },
    });

    const faUsers = [];
    for (let i = 1; i <= 2; i++) {
      const fa = await prisma.user.upsert({
        where: { email: `fa${i}.${stadium.code.toLowerCase()}@gcms.com` },
        update: {},
        create: {
          name: `${stadium.code} Fleet Attendant ${i}`,
          email: `fa${i}.${stadium.code.toLowerCase()}@gcms.com`,
          passwordHash: faPasswordHash,
          role: 'FA',
          isActive: true,
          stadiumId: stadium.id,
          departmentId: depts[i % depts.length]?.id,
          phone: `+974 5${String(1000000 + i).slice(0, 7)}`,
          mustChangePassword: usingDefaultPasswords,
        },
      });
      faUsers.push(fa);
    }
    faUsersByStadium[stadium.id] = faUsers;
    console.log(`✅ ${stadium.code}: admin + ${faUsers.length} FA users ready (${admin.email})`);
  }

  // ── Fleet carts per venue ─────────────────────────────────────────────────
  const allFleet: { id: string; carNumber: string; stadiumId: string; status: string }[] = [];

  for (const stadium of stadiums) {
    const depts = await prisma.department.findMany({ where: { stadiumId: stadium.id }, take: 3 });
    const faUsers = faUsersByStadium[stadium.id];

    for (let i = 1; i <= 6; i++) {
      const carNumber = `${stadium.code}-GC-${String(i).padStart(2, '0')}`;
      const status = pick(FLEET_STATUSES, i);
      const isPool = i === 6; // last cart per venue is a shared pool cart

      const fleet = await prisma.fleet.upsert({
        where: { carNumber },
        update: {},
        create: {
          carNumber,
          carType: pick(CAR_TYPES, i),
          status,
          requiresVAP: i % 3 === 0,
          stadiumId: stadium.id,
          departmentId: depts[i % depts.length]?.id,
          assignedUserId: !isPool ? faUsers[i % faUsers.length]?.id : null,
          isPool,
        },
      });
      allFleet.push({ id: fleet.id, carNumber: fleet.carNumber, stadiumId: stadium.id, status: fleet.status });
    }
    console.log(`✅ ${stadium.code}: 6 fleet carts ready`);
  }

  // ── Handover logs (checkout/checkin history) ──────────────────────────────
  let handoverCount = 0;
  for (const [idx, fleet] of allFleet.entries()) {
    if (idx % 2 !== 0) continue; // half the fleet gets history
    const faUsers = faUsersByStadium[fleet.stadiumId];
    const user = faUsers[idx % faUsers.length];
    if (!user) continue;

    const existing = await prisma.handoverLog.findFirst({ where: { fleetId: fleet.id } });
    if (existing) continue;

    await prisma.handoverLog.create({
      data: {
        fleetId: fleet.id,
        userId: user.id,
        action: 'CheckedOut',
        timestamp: daysAgo(3),
        conditionNotes: 'Vehicle inspected before dispatch — no visible damage.',
      },
    });
    await prisma.handoverLog.create({
      data: {
        fleetId: fleet.id,
        userId: user.id,
        action: 'CheckedIn',
        timestamp: daysAgo(1),
        conditionNotes: 'Returned in good condition.',
      },
    });
    handoverCount += 2;
  }
  console.log(`✅ HandoverLogs: ${handoverCount} records created`);

  // ── Maintenance logs ───────────────────────────────────────────────────────
  let maintCount = 0;
  const maintenanceCandidates = allFleet.filter((f) => f.status === 'Under Maintenance');
  for (const [idx, fleet] of maintenanceCandidates.entries()) {
    const faUsers = faUsersByStadium[fleet.stadiumId];
    const reporter = faUsers[0];
    if (!reporter) continue;

    const existing = await prisma.maintenanceLog.findFirst({ where: { fleetId: fleet.id } });
    if (existing) continue;

    const statuses = ['Open', 'InProgress', 'Resolved'];
    const status = pick(statuses, idx);

    await prisma.maintenanceLog.create({
      data: {
        fleetId: fleet.id,
        reportedById: reporter.id,
        issueDescription: `Reported issue on ${fleet.carNumber}: unusual noise from rear axle.`,
        issueType: pick(ISSUE_TYPES, idx),
        status,
        reportedAt: daysAgo(5),
        resolutionNotes: status === 'Resolved' ? 'Replaced worn bearing, tested OK.' : null,
        resolvedAt: status === 'Resolved' ? daysAgo(1) : null,
      },
    });
    maintCount++;
  }
  console.log(`✅ MaintenanceLogs: ${maintCount} records created`);

  // ── Car requests ────────────────────────────────────────────────────────────
  let requestCount = 0;
  const requestStatuses = ['Pending', 'Approved', 'Rejected'];
  for (const [idx, stadium] of stadiums.slice(0, 4).entries()) {
    const dept = await prisma.department.findFirst({ where: { stadiumId: stadium.id } });
    if (!dept) continue;

    const requestToken = `demo-${stadium.code.toLowerCase()}-${idx}`;
    const existing = await prisma.carRequest.findUnique({ where: { requestToken } });
    if (existing) continue;

    await prisma.carRequest.create({
      data: {
        requesterName: `Demo Requester ${idx + 1}`,
        requesterEmail: `requester${idx + 1}@example.com`,
        requesterPhone: `+974 5500${1000 + idx}`,
        requestType: idx % 2 === 0 ? 'one-time' : 'dedicated',
        departmentId: dept.id,
        stadiumId: stadium.id,
        cargoCount: idx % 2,
        fourSeaterCount: 1,
        sixSeaterCount: idx % 3 === 0 ? 1 : 0,
        accessibilityCount: 0,
        notes: 'Demo request generated for local testing.',
        requestToken,
        status: pick(requestStatuses, idx),
      },
    });
    requestCount++;
  }
  console.log(`✅ CarRequests: ${requestCount} records created`);

  // ── Pool bookings (for isPool carts) ───────────────────────────────────────
  let poolCount = 0;
  const poolCarts = allFleet.filter((f) => f.carNumber.endsWith('-GC-06'));
  for (const [idx, fleet] of poolCarts.entries()) {
    const faUsers = faUsersByStadium[fleet.stadiumId];
    const creator = faUsers[0];
    if (!creator) continue;

    const existing = await prisma.poolBooking.findFirst({ where: { fleetId: fleet.id } });
    if (existing) continue;

    await prisma.poolBooking.create({
      data: {
        fleetId: fleet.id,
        driverName: `Visitor Driver ${idx + 1}`,
        driverPhone: `+974 6600${1000 + idx}`,
        purpose: 'Shuttle between venue gates',
        checkoutAt: daysAgo(1),
        expectedReturnAt: daysAgo(0),
        status: 'Active',
        createdById: creator.id,
      },
    });
    poolCount++;
  }
  console.log(`✅ PoolBookings: ${poolCount} records created`);

  // ── Notifications ───────────────────────────────────────────────────────────
  const notifExisting = await prisma.notification.count({ where: { title: { contains: 'Demo' } } });
  if (notifExisting === 0) {
    await prisma.notification.createMany({
      data: [
        {
          type: 'IssueReported',
          title: 'Demo: Maintenance issue reported',
          message: 'A fleet cart has a reported issue awaiting review.',
          entityType: 'MaintenanceLog',
        },
        {
          type: 'CarRequest',
          title: 'Demo: New car request submitted',
          message: 'A department has requested additional carts.',
          entityType: 'CarRequest',
        },
      ],
    });
    console.log('✅ Notifications: 2 demo records created');
  }

  // ── Announcement ─────────────────────────────────────────────────────────────
  const annExisting = await prisma.announcement.findFirst({ where: { title: 'Demo: Welcome to GCMS' } });
  if (!annExisting) {
    await prisma.announcement.create({
      data: {
        title: 'Demo: Welcome to GCMS',
        message: 'This is a demo announcement seeded for local testing.',
        type: 'info',
        targetType: 'all',
        isActive: true,
      },
    });
    console.log('✅ Announcement: 1 demo record created');
  }

  // ── Pool booking requests (demo) ────────────────────────────────────────────
  let bookingCount = 0;
  const poolCartsForBooking = allFleet.filter((f) => f.carNumber.endsWith('-GC-06'));
  const bookingStatuses = ['Pending', 'Approved', 'Rejected'];

  for (const [idx, fleet] of poolCartsForBooking.entries()) {
    const faUsers = faUsersByStadium[fleet.stadiumId];
    const fa = faUsers?.[0];
    if (!fa) continue;

    const requestToken = `demo-booking-${fleet.stadiumId}-${idx}`;
    const existing = await prisma.poolBookingRequest.findUnique({ where: { requestToken } });
    if (existing) continue;

    const status = pick(bookingStatuses, idx);
    const startDate = '2026-09-15';
    const isReviewed = status !== 'Pending';

    await prisma.poolBookingRequest.create({
      data: {
        stadiumId: fleet.stadiumId,
        fleetId: fleet.id,
        requesterName: `Demo Booker ${idx + 1}`,
        requesterEmail: `booker${idx + 1}@example.com`,
        requesterPhone: `+974 5700${1000 + idx}`,
        faUserId: fa.id,
        bookingType: 'Single',
        startDate,
        endDate: startDate,
        startTime: '09:00',
        endTime: '13:00',
        purpose: 'Demo pool booking request for local testing.',
        requestToken,
        status,
        reviewedById: isReviewed ? fa.id : null,
        reviewedAt: isReviewed ? new Date() : null,
        reviewComment: status === 'Rejected' ? 'Cart needed for maintenance that day.' : status === 'Approved' ? 'Approved — enjoy.' : null,
      },
    });
    bookingCount++;
  }
  console.log(`✅ PoolBookingRequests: ${bookingCount} records created`);

  console.log('\n🎉 Dummy data seeding complete!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Extra login credentials (per venue):');
  console.log('  admin.<code>@gcms.com   Admin@2024!   (e.g. admin.lus@gcms.com)');
  console.log('  fa1.<code>@gcms.com     FA@2024!');
  console.log('  fa2.<code>@gcms.com     FA@2024!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
  .catch((e) => {
    console.error('Dummy seed error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
