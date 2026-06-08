const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkDatabaseConnection() {
  await prisma.$queryRaw`SELECT 1`;
  return { ok: true };
}

module.exports = { prisma, checkDatabaseConnection };
