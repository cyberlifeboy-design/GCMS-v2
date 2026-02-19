import { prisma } from './src/config/database';

async function check() {
  try {
    const logs = await prisma.auditLog.findMany({
      take: 10,
      orderBy: { timestamp: 'desc' }
    });
    
    console.log(JSON.stringify(logs, null, 2));
    await prisma.$disconnect();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

check();
