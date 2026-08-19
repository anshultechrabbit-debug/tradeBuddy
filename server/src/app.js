import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/env.js';
import routes from './routes/index.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/logger.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: config.clientOrigin.split(',').map((s) => s.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(requestLogger);

  app.get('/', (_req, res) => {
    res.json({
      name: 'TradeBuddy API',
      version: '0.1.0',
      environment: config.appEnv,
      providers: {
        broker: config.brokerProvider,
        marketData: config.marketDataProvider,
        notification: config.notificationProvider,
      },
      docs: '/api/health',
    });
  });

  app.use('/api', routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}