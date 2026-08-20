import { config } from './config/env.js';
import { createApp } from './app.js';
import { logInfra } from './utils/helpers.js';
import { startRadarScheduler } from './services/radarService.js';

const app = createApp();

const server = app.listen(config.port, () => {
  logInfra('info', 'app', `TradeBuddy API listening on http://localhost:${config.port}`);
  logInfra('info', 'app', `brokerProvider=${config.brokerProvider} marketDataProvider=${config.marketDataProvider}`);
  startRadarScheduler(config.radar?.liveIntervalMs ?? 15000);
});

function shutdown(signal) {
  logInfra('info', 'app', `${signal} received, shutting down`);
  server.close(() => {
    import('./config/prisma.js')
      .then(({ disconnect }) => disconnect())
      .finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export { app, server };