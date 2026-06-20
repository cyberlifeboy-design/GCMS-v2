/**
 * Seed script — FAC25 Venues & Departments
 * Source: Trigram2 LOC 20250825.xlsx + Trigram LOC 20250825.xlsx
 * Run: node scripts/seed-venues-departments.mjs
 */

const API = 'http://localhost:3005/api/v1';

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

// 60 Functional Areas — code, name, division
const DEPARTMENTS = [
    { code: 'ADM', name: 'Administration Support',          division: 'Administration' },
    { code: 'HRS', name: 'Human Resources',                 division: 'Administration' },
    { code: 'ICT', name: 'ICT',                             division: 'Administration' },
    { code: 'WKF', name: 'Workforce',                       division: 'Administration' },
    { code: 'COM', name: 'Communications',                  division: 'Communications' },
    { code: 'LAN', name: 'Languages Services',              division: 'Communications' },
    { code: 'MER', name: 'Media Relations',                 division: 'Communications' },
    { code: 'SHM', name: 'Stakeholder Management',          division: 'Communications' },
    { code: 'CMP', name: 'Competition Management',          division: 'Competition Management' },
    { code: 'RSV', name: 'Referee Services',                division: 'Competition Management' },
    { code: 'TSV', name: 'Team Services',                   division: 'Competition Management' },
    { code: 'TFS', name: 'Teams Facilities',                division: 'Competition Management' },
    { code: 'ACC', name: 'Accommodation',                   division: 'Event Services' },
    { code: 'AND', name: 'Arrivals & Departures',           division: 'Event Services' },
    { code: 'CAT', name: 'Catering',                        division: 'Event Services' },
    { code: 'FNB', name: 'F&B Concessions',                 division: 'Event Services' },
    { code: 'GOR', name: 'Government Relations',            division: 'Event Services' },
    { code: 'GRE', name: 'Guest Relations',                 division: 'Event Services' },
    { code: 'LOG', name: 'Logistics',                       division: 'Event Services' },
    { code: 'MED', name: 'Medical',                         division: 'Event Services' },
    { code: 'MOB', name: 'Mobility',                        division: 'Event Services' },
    { code: 'TRA', name: 'Travel Services',                 division: 'Event Services' },
    { code: 'FNP', name: 'Finance & Procurement',           division: 'Finance' },
    { code: 'CEO', name: 'CEO Office',                      division: 'CEO' },
    { code: 'EXP', name: 'Experience',                      division: 'CEO' },
    { code: 'GAF', name: 'Guest Affairs',                   division: 'CEO' },
    { code: 'BRP', name: 'Brand Protection',                division: 'Legal' },
    { code: 'LGL', name: 'Legal',                           division: 'Legal' },
    { code: 'BMR', name: 'Broadcasting & Media Rights',     division: 'Marketing, Promotion, Events & Commercial' },
    { code: 'CER', name: 'Ceremonies & Infotainment',       division: 'Marketing, Promotion, Events & Commercial' },
    { code: 'ECR', name: 'Events & Community Relations',    division: 'Marketing, Promotion, Events & Commercial' },
    { code: 'HOS', name: 'Hospitality',                     division: 'Marketing, Promotion, Events & Commercial' },
    { code: 'LIC', name: 'Licensing & Merchandise',         division: 'Marketing, Promotion, Events & Commercial' },
    { code: 'MKP', name: 'Marketing & Promotion',           division: 'Marketing, Promotion, Events & Commercial' },
    { code: 'MRD', name: 'Marketing Rights Delivery',       division: 'Marketing, Promotion, Events & Commercial' },
    { code: 'SHU', name: 'Shukran',                         division: 'Marketing, Promotion, Events & Commercial' },
    { code: 'SGN', name: 'Signage & Dressing',              division: 'Marketing, Promotion, Events & Commercial' },
    { code: 'TKT', name: 'Ticketing',                       division: 'Marketing, Promotion, Events & Commercial' },
    { code: 'ACS', name: 'Access Management',               division: 'Operations' },
    { code: 'ACR', name: 'Accreditation',                   division: 'Operations' },
    { code: 'BRO', name: 'Broadcast Operations',            division: 'Operations' },
    { code: 'BRS', name: 'Broadcast Services',              division: 'Operations' },
    { code: 'CLW', name: 'Cleaning & Waste',                division: 'Operations' },
    { code: 'SFM', name: 'Facility & Stadium Management',   division: 'Operations' },
    { code: 'GOP', name: 'Guest Operations',                division: 'Operations' },
    { code: 'HSE', name: 'Health & Safety',                 division: 'Operations' },
    { code: 'MAP', name: 'Maps & Drawing',                  division: 'Operations' },
    { code: 'MEO', name: 'Media Operations',                division: 'Operations' },
    { code: 'OVL', name: 'Overlay',                         division: 'Operations' },
    { code: 'PWR', name: 'Power',                           division: 'Operations' },
    { code: 'SPS', name: 'Spectator Services',              division: 'Operations' },
    { code: 'SSI', name: 'Security Systems Integration',    division: 'Operations' },
    { code: 'VUM', name: 'Venue Management',                division: 'Operations' },
    { code: 'PLI', name: 'Planning & Integration',          division: 'Planning & Integration' },
    { code: 'PMO', name: 'Project Management Office',       division: 'Project Management' },
    { code: 'UEX', name: 'Experience (Project Mgmt)',         division: 'Project Management' },
    { code: 'SFG', name: 'Safeguarding',                    division: 'Sustainability' },
    { code: 'SUS', name: 'Sustainability',                  division: 'Sustainability' },
    { code: 'HAY', name: 'Hayya',                           division: 'Hayya' },
    { code: 'SEC', name: 'SSOC',                            division: 'SSOC' },
];

async function post(path, body, token) {
    const res = await fetch(`${API}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
    });
    return { status: res.status, data: await res.json() };
}

async function main() {
    // 1. Login
    console.log('🔐 Logging in...');
    const { data: auth } = await post('/auth/login', { email: 'superadmin@gcms.com', password: 'Admin@2024!' });
    if (!auth.accessToken) { console.error('Login failed:', auth); process.exit(1); }
    const token = auth.accessToken;
    console.log('✅ Authenticated\n');

    // 2. Create venues
    console.log(`🏟️  Creating ${VENUES.length} venues...`);
    const venueIds = [];
    for (const v of VENUES) {
        const { status, data } = await post('/stadiums', v, token);
        if (status === 201) {
            venueIds.push(data.id);
            console.log(`  ✅ ${v.code} — ${v.name}`);
        } else if (data?.error?.includes?.('already') || data?.error?.includes?.('Unique') || status === 409) {
            console.log(`  ⏭️  ${v.code} already exists`);
            // fetch its ID
            const listRes = await fetch(`${API}/stadiums`, { headers: { Authorization: `Bearer ${token}` } });
            const list = await listRes.json();
            const existing = (list.data || []).find(s => s.code === v.code);
            if (existing) venueIds.push(existing.id);
        } else {
            console.log(`  ❌ ${v.code} failed (${status}):`, JSON.stringify(data));
        }
    }
    console.log(`\n✅ Venues ready: ${venueIds.length} IDs\n`);

    if (venueIds.length === 0) { console.error('No venue IDs — aborting.'); process.exit(1); }

    // 3. Bulk-create each department across all venues
    console.log(`📂 Creating ${DEPARTMENTS.length} departments across all venues...`);
    let created = 0, skipped = 0, failed = 0;
    for (const dept of DEPARTMENTS) {
        const { status, data } = await post('/departments/bulk', { name: dept.name, code: dept.code, stadiumIds: venueIds }, token);
        if (status === 201) {
            created += data.count || 0;
            console.log(`  ✅ [${dept.code}] ${dept.name} → ${data.count} records`);
        } else if (status === 409 || data?.error?.includes?.('already')) {
            skipped++;
            console.log(`  ⏭️  [${dept.code}] already exists`);
        } else {
            failed++;
            console.log(`  ❌ [${dept.code}] failed (${status}):`, JSON.stringify(data));
        }
    }

    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎉 Seed complete!
   Venues created : ${venueIds.length}
   Dept records   : ${created}
   Skipped        : ${skipped}
   Failed         : ${failed}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
