import { getExternalAdapters } from './src/providers/marketData/external/index.js';

const { backfill } = getExternalAdapters();
try {
  const raw = await backfill.client.call('candles', { symbol: 'EICHERMOT', days: 5 });
  console.log('RAW_TYPE', Array.isArray(raw) ? 'array' : typeof raw, 'LEN', Array.isArray(raw) ? raw.length : JSON.stringify(raw).slice(0, 200));
  const rawIdx = await backfill.client.call('candles', { symbol: 'NIFTY', days: 5, index: 1 });
  console.log('RAW_IDX_TYPE', Array.isArray(rawIdx) ? 'array' : typeof rawIdx, 'LEN', Array.isArray(rawIdx) ? rawIdx.length : JSON.stringify(rawIdx).slice(0, 200));
} catch (e) {
  console.error('ERR', e);
}