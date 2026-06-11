const { env } = require('./server/config/env');
const { app } = require('./server/app');
const { checkDatabaseConnection, prisma } = require('./server/db/prisma');

const DB_CONNECT_RETRIES = 5;
const DB_CONNECT_RETRY_DELAY_MS = 2000;

const server = app.listen(env.PORT, () => {
  console.log(`Seiga Studio server listening on http://localhost:${env.PORT}`);
});

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifyDatabaseConnectionWithRetry() {
  let lastError = null;
  for (let attempt = 1; attempt <= DB_CONNECT_RETRIES; attempt += 1) {
    try {
      await checkDatabaseConnection();
      console.log('[db] Database connection verified');
      return;
    } catch (error) {
      lastError = error;
      if (attempt < DB_CONNECT_RETRIES) {
        console.warn(`[db] 데이터베이스 연결 실패 (${attempt}/${DB_CONNECT_RETRIES}). ${DB_CONNECT_RETRY_DELAY_MS}ms 후 다시 시도합니다.`);
        await wait(DB_CONNECT_RETRY_DELAY_MS);
      }
    }
  }

  console.warn(`[db] ${DB_CONNECT_RETRIES}회 시도 후에도 데이터베이스에 연결하지 못했습니다. 서버는 시작됐지만 DB 기반 API는 실패할 수 있습니다: ${lastError?.message || '알 수 없는 오류'}`);
}

verifyDatabaseConnectionWithRetry();

function shutdown(signal) {
  console.log(`[server] Received ${signal}, shutting down`);
  server.close(async () => {
    await prisma.$disconnect().catch(() => {});
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
