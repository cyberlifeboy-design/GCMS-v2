import { prisma } from './src/config/database';

async function seed() {
  try {
    const stadium = await prisma.stadium.findUnique({ where: { code: 'LUSAIL' } });
    if (!stadium) {
      console.error('Stadium not found! Run seed_stadium.ts first.');
      process.exit(1);
    }

    const fleetData = [
      { unitNumber: 'GC-001', carType: '2-seater', keyId: 'KEY-RED-001', keyColorCode: 'RED', status: 'Ready', assignedToFA: 'LOG', stadiumId: stadium.id },
      { unitNumber: 'GC-002', carType: '4-seater', keyId: 'KEY-BLUE-001', keyColorCode: 'BLUE', status: 'In-Use', assignedToFA: 'LOG', stadiumId: stadium.id },
      { unitNumber: 'GC-003', carType: '6-seater', keyId: 'KEY-GREEN-001', keyColorCode: 'GREEN', status: 'Ready', assignedToFA: 'MOB', stadiumId: stadium.id },
      { unitNumber: 'GC-004', carType: '2-seater', keyId: 'KEY-RED-002', keyColorCode: 'RED', status: 'Maintenance', assignedToFA: 'SPS', stadiumId: stadium.id },
      { unitNumber: 'GC-005', carType: '4-seater', keyId: 'KEY-BLUE-002', keyColorCode: 'BLUE', status: 'Ready', assignedToFA: 'VUM', stadiumId: stadium.id },
    ];

    for (const data of fleetData) {
      await prisma.fleet.upsert({
        where: { unitNumber: data.unitNumber },
        update: {},
        create: data
      });
    }
    
    console.log('Fleet seeded successfully');
    await prisma.$disconnect();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

seed();
