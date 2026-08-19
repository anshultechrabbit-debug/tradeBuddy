import { seed } from '../src/db/seed.js';

seed()
  .then((result) => {
    console.log('Seed complete:', JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });