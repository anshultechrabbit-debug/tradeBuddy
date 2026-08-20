import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { subscribeChannel } from '../services/eventHub.js';

const router = Router();

router.get('/', authenticate, (req, res) => {
  const channel = String(req.query.channel || 'all').slice(0, 50);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 10000\n\n');

  const unsubscribe = subscribeChannel(channel, res);
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

export default router;