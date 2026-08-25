import { prisma } from './src/config/prisma.js';
import { signToken } from './src/utils/jwt.js';

const user = await prisma.user.findFirst({ where: { status: { not: 'SUSPENDED' } } });
const token = signToken({ id: user.id, email: user.email, role: 'USER', tokenVersion: user.tokenVersion });

const start = Date.now();
const res = await fetch('http://localhost:5000/api/ai/ask', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ question: 'What is the best stock to buy today?' }),
});
console.log('elapsed ms', Date.now() - start);
const data = await res.json();
console.log(data.answer);
process.exit(0);
