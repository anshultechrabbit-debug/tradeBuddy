/**
 * newsService — free news retrieval + deterministic sentiment classification.
 *
 * Fetches the latest headlines for a NSE symbol from Google News RSS (no API
 * key required) and classifies each article POSITIVE / NEUTRAL / NEGATIVE by
 * keyword analysis. Scores are recency-weighted: recent headlines count more.
 *
 * This is a heuristic signal, not a guarantee — headlines are auto-classified
 * and can be misread. Treat it as input to the stock-analysis engine.
 */

const POSITIVE_WORDS = [
  'surge', 'surges', 'surged', 'rise', 'rises', 'rose', 'rally', 'rallies', 'gain', 'gains',
  'profit', 'profits', 'record', 'beat', 'beats', 'upgrade', 'upgraded', 'upgrades', 'positive',
  'growth', 'grows', 'jump', 'jumps', 'jumped', 'strong', 'buy', 'overweight', 'outperform',
  'high', '52-week high', 'all-time high', 'award', 'wins', 'win', 'expansion', 'expands',
  'boost', 'boosted', 'recovery', 'rebound', 'breakout', 'bullish', 'approval', 'approved',
  'guidance', 'raised', 'raise', 'dividend', 'bonus', 'buyback', 'deal', 'order', 'orders',
  'partnership', 'landmark', 'milestone', 'stellar', 'robust', 'momentum',
];

const NEGATIVE_WORDS = [
  'fall', 'falls', 'fell', 'drop', 'drops', 'dropped', 'down', 'loss', 'losses', 'slump',
  'slumps', 'plunge', 'plunges', 'plunged', 'downgrade', 'downgraded', 'downgrades', 'negative',
  'miss', 'misses', 'warn', 'warns', 'warning', 'weak', 'weakness', 'crisis', 'probe', 'probed',
  'fraud', 'investigation', 'investigating', 'scrutiny', 'tax notice', 'sebi', 'court', 'sued',
  'lawsuit', 'recall', 'recalled', 'decline', 'declines', 'declined', 'sell', 'underperform',
  'bearish', 'dismal', 'slowdown', 'slow', 'uncertainty', 'risk', 'risks', 'cut', 'cuts',
  'reduced', 'cuts', 'debt', 'default', 'restructuring', 'delisted', 'suspension', 'penalty',
  'fine', 'fines', 'regulator', 'trouble', 'problem', 'problems',
];

function classify(title) {
  const t = title.toLowerCase();
  const hasPos = POSITIVE_WORDS.some((w) => t.includes(w));
  const hasNeg = NEGATIVE_WORDS.some((w) => t.includes(w));
  if (hasPos && hasNeg) return 'NEUTRAL';
  if (hasPos) return 'POSITIVE';
  if (hasNeg) return 'NEGATIVE';
  return 'NEUTRAL';
}

function stripHtml(s) {
  return s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").trim();
}

function recencyWeight(publishedAt) {
  if (!publishedAt) return 0.3;
  const ageDays = (Date.now() - publishedAt.getTime()) / 86400000;
  if (ageDays <= 3) return 1;
  if (ageDays <= 7) return 0.75;
  if (ageDays <= 14) return 0.5;
  return 0.3;
}

function parseItems(xml) {
  const out = [];
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  for (const block of blocks) {
    const title = stripHtml(block.match(/<title>(.*?)<\/title>/)?.[1] ?? '');
    if (!title) continue;
    const source = stripHtml(block.match(/<source[^>]*>(.*?)<\/source>/)?.[1] ?? '');
    const link = block.match(/<link>(.*?)<\/link>/)?.[1] ?? '';
    const pubRaw = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1];
    let publishedAt = null;
    if (pubRaw) {
      const d = new Date(pubRaw);
      if (!Number.isNaN(d.getTime())) publishedAt = d;
    }
    out.push({ title, source, link, publishedAt, sentiment: classify(title) });
  }
  return out;
}

/**
 * Fetches and classifies the latest news for a symbol.
 * Returns { articles, positive, neutral, negative, sentimentScore, overall,
 *           positiveCatalysts, negativeCatalysts }.
 */
export async function fetchStockNews(symbol, { limit = 8 } = {}) {
  const query = encodeURIComponent(`${symbol} NSE stock`);
  const url = `https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`;
  const res = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`news fetch failed: ${res.status}`);
  const xml = await res.text();
  const parsed = parseItems(xml).slice(0, limit);

  let weighted = 0;
  let totalWeight = 0;
  let positive = 0;
  let neutral = 0;
  let negative = 0;

  const articles = parsed.map((a) => {
    const w = recencyWeight(a.publishedAt);
    const s = a.sentiment === 'POSITIVE' ? 1 : a.sentiment === 'NEGATIVE' ? -1 : 0;
    weighted += w * s;
    totalWeight += w;
    if (a.sentiment === 'POSITIVE') positive += 1;
    else if (a.sentiment === 'NEGATIVE') negative += 1;
    else neutral += 1;
    return { ...a, recencyWeight: Math.round(w * 100) / 100 };
  });

  const sentimentScore = totalWeight
    ? Math.round(Math.min(100, Math.max(0, 50 + (weighted / totalWeight) * 50)))
    : 50;
  const overall = sentimentScore >= 60 ? 'Positive' : sentimentScore <= 40 ? 'Negative' : 'Neutral';

  return {
    articles,
    positive,
    neutral,
    negative,
    sentimentScore,
    overall,
    positiveCatalysts: articles.filter((a) => a.sentiment === 'POSITIVE').slice(0, 4).map((a) => a.title),
    negativeCatalysts: articles.filter((a) => a.sentiment === 'NEGATIVE').slice(0, 4).map((a) => a.title),
  };
}