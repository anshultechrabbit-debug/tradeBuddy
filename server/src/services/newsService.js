/**
 * newsService — free news retrieval + deterministic sentiment classification.
 *
 * Priority: Marketaux (free, 100 req/day, India coverage, 24h fresh, structured)
 *           → Google News RSS (no key, may be stale) → no news.
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
  return s.replace(/<[^>]*>/g, '').replace(/&/g, '&').replace(/'|&apos;/g, "'").trim();
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

// Marketaux optional key (get free key at https://marketaux.com/)
// Free tier: 100 requests/day, Indian market coverage, 24h fresh news,
// structured data, filter by entity (e.g. NYKAA).
const MARKETAUX_API_KEY = process.env.MARKETAUX_API_KEY ?? '';

async function fetchFromMarketaux(symbol, { limit = 8 } = {}) {
  if (!MARKETAUX_API_KEY || MARKETAUX_API_KEY === 'your_marketaux_api_key_here') return null;
  try {
    const url = `https://api.marketaux.com/v1/news/latest?symbols=${symbol}&filter_entities=true&api_token=${MARKETAUX_API_KEY}&language=en`;
    const res = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.data?.length) return null;
    const articles = data.data
      .filter((a) => a.title && a.title.length > 0)
      .slice(0, limit)
      .map((a) => {
        const publishedAt = a.published_at ? new Date(a.published_at) : null;
        return {
          title: a.title,
          source: a.source_name ?? '',
          link: a.url ?? '',
          publishedAt,
          sentiment: classify(a.title),
        };
      });
    if (!articles.length) return null;
    let weighted = 0;
    let totalWeight = 0;
    let positive = 0;
    let negative = 0;
    let neutral = 0;
    const articlesWithWeight = articles.map((a) => {
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
      articles: articlesWithWeight,
      positive,
      neutral,
      negative,
      sentimentScore,
      overall,
      positiveCatalysts: articlesWithWeight.filter((a) => a.sentiment === 'POSITIVE').slice(0, 4).map((a) => a.title),
      negativeCatalysts: articlesWithWeight.filter((a) => a.sentiment === 'NEGATIVE').slice(0, 4).map((a) => a.title),
    };
  } catch (err) {
    logInfra('info', 'market-data-external', `marketaux fetch error: ${err.message}`);
    return null;
  }
}

// NewsAPI optional key (get free key at https://newsapi.org/)
// When set, NewsAPI is used as fallback if Google News RSS returns < 2 articles.
const NEWSAPI_KEY = process.env.NEWSAPI_KEY ?? '';

async function fetchFromNewsAPI(symbol, { limit = 8 } = {}) {
  if (!NEWSAPI_KEY || NEWSAPI_KEY === 'your_newsapi_key_here') return null;
  try {
    const today = new Date();
    const fromDate = today.toISOString().split('T')[0];
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 7);
    const from = sevenDaysAgo.toISOString().split('T')[0];
    const url = `https://newsapi.org/v2/everything?q=${symbol}+NSE+stock&from=${from}&to=${fromDate}&language=en&sortBy=publishedAt&apiKey=${NEWSAPI_KEY}`;
    const res = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.articles?.length) return null;
    const articles = data.articles
      .filter((a) => a.title && a.title.length > 0)
      .slice(0, limit)
      .map((a) => {
        const publishedAt = a.publishedAt ? new Date(a.publishedAt) : null;
        return {
          title: a.title,
          source: a.source?.name ?? '',
          link: a.url ?? '',
          publishedAt,
          sentiment: classify(a.title),
        };
      });
    if (!articles.length) return null;
    let weighted = 0;
    let totalWeight = 0;
    let positive = 0;
    let negative = 0;
    let neutral = 0;
    const articlesWithWeight = articles.map((a) => {
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
      articles: articlesWithWeight,
      positive,
      neutral,
      negative,
      sentimentScore,
      overall,
      positiveCatalysts: articlesWithWeight.filter((a) => a.sentiment === 'POSITIVE').slice(0, 4).map((a) => a.title),
      negativeCatalysts: articlesWithWeight.filter((a) => a.sentiment === 'NEGATIVE').slice(0, 4).map((a) => a.title),
    };
  } catch (err) {
    logInfra('info', 'market-data-external', `news fetch from NewsAPI error: ${err.message}`);
    return null;
  }
}

/**
 * Fetches and classifies the latest news for a symbol.
 * Priority: Marketaux (free, 100 req/day, India coverage, 24h fresh, structured)
 *           → Google News RSS (no key, may be stale) → no news.
 * Returns { articles, positive, neutral, negative, sentimentScore, overall,
 *           positiveCatalysts, negativeCatalysts }.
 */
export async function fetchStockNews(symbol, { limit = 8 } = {}) {
  // 1) Try Marketaux first (free tier: 100 req/day, India coverage, 24h fresh, structured)
  let marketauxResult = null;
  try {
    const url = `https://api.marketaux.com/v1/news/latest?symbols=${symbol}&filter_entities=true&api_token=${MARKETAUX_API_KEY}&language=en`;
    const res = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.data?.length) {
        marketauxResult = {
          articles: data.data.slice(0, limit).map((a) => ({
            title: a.title,
            source: a.source_name,
            link: a.url,
            publishedAt: a.published_at ? new Date(a.published_at) : null,
            sentiment: classify(a.title),
          })),
          marketauxSource: true,
        };
      }
    }
  } catch (err) {
    logInfra('info', 'market-data-external', `marketaux fetch failed: ${err.message}`);
  }

  // 2) If Marketaux had no articles, try Google News RSS fallback
  let finalResult = null;
  if (!marketauxResult?.articles?.length) {
    // Try Google News RSS
    try {
      const query = encodeURIComponent(`${symbol} NSE stock`);
      const url = `https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`;
      const res = await fetch(url, {
        headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const xml = await res.text();
        const parsed = parseItems(xml).slice(0, limit * 2);
        finalResult = {
          articles: parsed.map((a) => ({
            title: a.title,
            source: a.source,
            link: a.link,
            publishedAt: a.publishedAt,
            sentiment: a.sentiment,
            recencyWeight: a.recencyWeight,
          })),
          googleSource: true,
        };
      }
    } catch (err) {
      logInfra('info', 'market-data-external', `google news fallback failed: ${err.message}`);
    }
  }

// Sort by publish date descending (newest first)
    if (marketauxResult?.articles?.length) {
      marketauxResult.articles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    }
    if (finalResult?.articles?.length) {
      finalResult.articles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    }

  // Existing processing logic using finalResult.articles
  let weighted = 0;
  let totalWeight = 0;
  let positive = 0;
  let neutral = 0;
  let negative = 0;

  const articles = (finalResult?.articles ?? []).map((a) => {
    const w = a.recencyWeight ?? recencyWeight(a.publishedAt);
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