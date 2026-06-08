const { env } = require('./server/config/env');
const { app } = require('./server/app');
const { checkDatabaseConnection, prisma } = require('./server/db/prisma');

const server = app.listen(env.PORT, () => {
  console.log(`Seiga Studio server listening on http://localhost:${env.PORT}`);
});

checkDatabaseConnection()
  .then(() => {
    console.log('[db] Database connection verified');
  })
  .catch((error) => {
    console.warn(`[db] Server started without database connectivity: ${error.message}`);
  });

function shutdown(signal) {
  console.log(`[server] Received ${signal}, shutting down`);
  server.close(async () => {
    await prisma.$disconnect().catch(() => {});
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
