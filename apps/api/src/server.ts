import { buildApp } from './app.js';
import { config } from './config.js';
import { purgeExpiredSessions } from './modules/auth/session.js';

async function start() {
  const app = buildApp();
  try {
    await app.listen({ port: config.PORT, host: config.HOST });
    app.log.info(`[server] C-DAC Feedback Portal API running on http://${config.HOST}:${config.PORT}`);

    // Periodic cleanup of expired sessions (every 1 hour)
    const cleanupInterval = setInterval(async () => {
      try {
        const purged = await purgeExpiredSessions();
        if (purged > 0) app.log.info({ purged }, 'Purged expired user sessions');
      } catch (e) {
        app.log.error(e, 'Failed to purge expired user sessions');
      }
    }, 60 * 60 * 1000);
    cleanupInterval.unref();
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void start();
