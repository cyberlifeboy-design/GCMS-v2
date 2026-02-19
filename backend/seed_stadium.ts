import { prisma } from './src/config/database';

async function seed() {
  try {
    const stadium = await prisma.stadium.upsert({
      where: { code: 'LUSAIL' },
      update: {},
      create: {
        name: 'Lusail Stadium',
        code: 'LUSAIL',
        location: 'Lusail, Qatar'
      }
    });
    
    console.log('Stadium seeded:', stadium);
    await prisma.$disconnect();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

seed();
