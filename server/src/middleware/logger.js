import morgan from 'morgan';
import { logInfra } from '../utils/helpers.js';

const stream = {
  write: (message) => {
    const line = message.trim();
    if (!line) return;
    const match = line.match(/^(\S+) (\S+) (\S+)/);
    const component = match?.[1] ?? 'http';
    logInfra('info', component, line.replace(/^(\S+) /, ''));
  },
};

export const requestLogger = morgan(':method :url :status :response-time ms', { stream });

export function auditRequest(req, res, next) {
  res.on('finish', () => {
    if (req.user && res.statusCode >= 400) {
      // Errors on authenticated endpoints are logged via infra_logs already.
    }
  });
  next();
}