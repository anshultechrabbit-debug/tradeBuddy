export interface User {
  id: number;
  email: string;
  fullName: string | null;
  phone: string | null;
  role: 'ADMIN' | 'USER';
  roles: string[];
  status: string;
  subscriptionStatus: string;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface ApiError {
  error: { code: string; message: string; details?: { field: string; message: string }[] };
}

export interface BrokerConnection {
  id: number;
  broker: string;
  status: string;
  displayName: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  expiryAt: string | null;
  createdAt: string;
  config?: { kind: string; configured: boolean; redirectUri: string | null };
  user?: { email: string; fullName: string | null };
  tokens?: { tokenType: string; createdAt: string; expiresAt: string | null }[];
}

export interface Consent {
  id: number;
  broker: string;
  scope: string;
  purpose: string | null;
  consentVersion: string;
  status: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface PortfolioSummary {
  invested: number;
  currentValue: number;
  totalPnl: number;
  pnlPct: number;
  holdingsCount: number;
  diversificationScore: number;
  concentrationRisk: {
    risks: { type: string; symbol?: string; sector?: string; weightPct: number; message: string }[];
    warnings: { type: string; symbol?: string; sector?: string; weightPct: number; message: string }[];
  };
  dataSource: string;
}

export interface Holding {
  id: number;
  symbol: string;
  exchange: string;
  sector: string | null;
  instrumentName: string | null;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  costValue: number;
  currentValue: number;
  pnl: number;
  pnlPct: number;
  source: string;
}

export interface SectorExposure {
  sector: string;
  value: number;
  weightPct: number;
}

export interface Breadth {
  advancing: number;
  declining: number;
  unchanged: number;
  total: number;
  breadthPctAboveSma20: number;
  breadthPctAboveSma50: number;
  averageChangePct: number;
  dataSource: string;
}

export interface IndexQuote {
  symbol: string;
  exchange: string;
  instrumentType: string;
  level: number;
  prevClose: number;
  change: number;
  changePct: number;
  dataSource: string;
  source?: string | null;
}

export interface MarketQuote {
  symbol: string;
  exchange: string;
  name: string | null;
  sector: string | null;
  instrumentType: string;
  lastPrice: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  prevClose: number | null;
  change: number | null;
  changePct: number | null;
  volume: number | null;
  source: string | null;
  dataSource: string | null;
  sourceTimestamp?: string | null;
  receivedAt?: string | null;
  stale?: boolean;
}

export interface TopStock {
  symbol: string;
  lastPrice: number | null;
  previousClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  change: number | null;
  changePct: number | null;
  volume: number | null;
  value: number | null;
}

export interface TopMovers {
  gainers: TopStock[];
  losers: TopStock[];
  activeByValue: TopStock[];
  activeByVolume: TopStock[];
  timestamp: string | null;
  dataSource: string;
}

export interface Candle {
  symbol: string;
  exchange: string;
  timeframe: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source: string | null;
  provider: string | null;
  stale?: boolean;
}

export interface Opportunity {
  symbol: string;
  exchange: string;
  price: number;
  signal: 'BUY' | 'WATCH' | 'AVOID';
  regime: string;
  convictionScore: number;
  explanation: string;
  aiSignal?: string | null;
  directionalOutlook?: 'BULLISH' | 'NEUTRAL' | 'BEARISH' | null;
  tradeStatus?: string | null;
  dataSource: string;
}

export interface SavedOpportunity extends Opportunity {
  id: number;
  scanId: number;
  createdAt: string;
}

export interface ScanResult {
  scanId: string;
  regime: string;
  breadth: Breadth;
  lastScannedAt: string;
  opportunities: Opportunity[];
}

export interface Signal {
  id: number;
  symbol: string;
  exchange: string;
  timestamp: string;
  signal: 'BUY' | 'WATCH' | 'AVOID';
  regime: string;
  convictionScore: number;
  features: Record<string, unknown>;
  reason: string;
  aiSignal?: string | null;
  directionalOutlook?: 'BULLISH' | 'NEUTRAL' | 'BEARISH' | null;
  tradeStatus?: string | null;
  dataSource: string;
}

export interface DeepDive {
  symbol: string;
  lastPrice: number;
  signal: 'BUY' | 'WATCH' | 'AVOID';
  regime: string;
  convictionScore: number;
  reason: string;
  features: {
    lastPrice: number;
    sma20: number;
    sma50: number;
    sma200: number;
    ema20: number;
    rsi14: number;
    atr14: number;
    roc10: number;
    roc20: number;
    dailyVolatilityPct: number;
    annualizedVolatilityPct: number;
    zscore: number;
    volumeRatio: number;
    avgVolume20: number;
    lastVolume: number;
    breakout: boolean;
    breakoutPct: number;
    ret20: number;
    relativeStrength: number;
    subscores: { trend: number; momentum: number; volume: number; relativeStrength: number; volatility: number; breadth: number };
  };
  deepDive: {
    trendStrength: string;
    momentum: string;
    volumeConfirmation: string;
    volatilityScore: string;
    breakoutScore: string;
    relativeStrength: string;
    technicalSignals: string[];
    regime: string;
  };
  volatility: {
    symbol: string;
    exchange: string;
    dailyVolatilityPct: number;
    annualizedVolatilityPct: number;
    meanDailyReturnPct: number;
    sampleDays: number;
    dataSource: string;
  };
  dataSource: string;
}

export interface WatchlistItem {
  id: number;
  symbol: string;
  exchange: string;
  name: string | null;
  sector: string | null;
  instrumentType: string;
  price: number;
  changePct: number;
  dataSource: string;
  addedAt: string;
}

export interface Watchlist {
  id: number;
  name: string;
  items: WatchlistItem[];
}

export interface SymbolDetail {
  symbol: string;
  exchange: string;
  name: string | null;
  sector: string | null;
  instrumentType: string;
  isin: string | null;
  quote: {
    symbol: string;
    exchange: string;
    lastPrice: number;
    open: number;
    high: number;
    low: number;
    prevClose: number;
    change: number;
    changePct: number;
    volume: number;
    bid: number;
    ask: number;
    source: string;
    provider: string;
    dataSource: string;
  };
  volatility: {
    dailyVolatilityPct: number;
    annualizedVolatilityPct: number;
    dataSource: string;
  };
  dataSource: string;
}

export interface Recommendation {
  recommendation: 'BUY' | 'WATCH' | 'AVOID';
  confidence: number;
  convictionScore: number;
  reason: string;
  supportingSignals: { symbol: string; signal: string; convictionScore: number; regime: string; timestamp: string }[];
  source: string;
  timestamp: string;
}

export interface AiNews {
  positive: number;
  neutral: number;
  negative: number;
  overall: string;
  sentimentScore: number;
  available: boolean;
  articles: { title: string; link: string; publishedAt: string; sentiment: string; keyword: string }[];
  positiveCatalysts: string[];
  negativeCatalysts: string[];
}

export interface AiTechnical {
  price: number;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  ema20: number | null;
  rsi: number | null;
  macdValue: number | null;
  macdSignal: number | null;
  roc20: number | null;
  atr: number | null;
  volRatio: number | null;
  avgVolume20: number | null;
  primarySupport: number | null;
  primaryResistance: number | null;
  high52w: number | null;
  low52w: number | null;
  drawdownFromHigh: number | null;
  candleCount: number;
  trend: string;
}

export interface EngineBuy {
  currentPrice: number | null;
  preferredEntryRange: [number, number];
  confirmationPrice: number | null;
  target1: number | null;
  target2: number | null;
  stopLoss: number | null;
  riskReward: number | null;
  probabilityTarget1: string | null;
  expectedMovePct: number | null;
  maxAcceptableRisk: string;
  reasonSetupCouldFail: string | null;
  entryNote?: string | null;
}

export interface EngineWhyFactor {
  label: string;
  score: number | null;
  text: string;
}

export interface EngineWhy {
  factorBreakdown: EngineWhyFactor[];
  investReasons: string[];
  lossReasons: string[];
  summary: string;
}

export interface EngineOutput {
  schemaVersion: number;
  modelVersion: string;
  generatedAt: string;
  dataTimestamp: string | null;
  dataStatus: string;
  subScores: {
    technicalMomentum: number | null;
    trend: number | null;
    volumeConfirmation: number | null;
    relativeStrength: number | null;
    news: number | null;
    fundamentals: number | null;
    marketSector: number | null;
  };
  totalScore: number;
  classification: string;
  directionalOutlook: 'BULLISH' | 'NEUTRAL' | 'BEARISH';
  predictionHorizon: 'CURRENT_SESSION_CLOSE' | 'NEXT_SESSION_CLOSE';
  predictionStatus?: 'IN_PROGRESS_SESSION_ESTIMATE' | 'NEXT_SESSION_ESTIMATE';
  signal: string;
  isBuy: boolean;
  tradeStatus: string;
  sessionOver: boolean;
  gatesPassed: boolean | null;
  gates: {
    riskReward: boolean;
    volumeConfirms: boolean;
    htfAgrees: boolean;
    noContraryNews: boolean;
    liquidEnough: boolean;
    agreeingSignals: number;
    agreeingRequired: number;
    structureOk?: boolean;
    deepPullback?: boolean;
  };
  buy: EngineBuy | null;
  closingRange: {
    bear: number | null;
    base: number | null;
    bull: number | null;
    range: [number, number] | null;
    expectedMovePct: number | null;
    confidence: string;
    confidenceScore: number;
    probability: string;
    note?: string;
  };
  newsIndependentEvents?: number | null;
  newsMaterialEvents?: number | null;
  validation: string;
  validationProblems: string[];
  coverage: Record<string, boolean | string[]>;
  disclaimer: string;
}

export interface AiAnalysis {
  ok: boolean;
  symbol: string;
  companyName: string;
  quote: {
    symbol: string;
    lastPrice: number;
    changePct: number | null;
    volume: number | null;
    dataSource: string | null;
  };
  finalSignal: string;
  overallScore: number;
  confidence: string;
  flags: string[];
  factorScores: {
    news: number | null;
    technical: number | null;
    fundamentals: number | null;
    valuation: number | null;
    market: number | null;
    risk: number | null;
  };
  reasons: { news: string; technical: string; fundamentals: string; valuation: string; market: string; risk: string };
  news: AiNews;
  technical: AiTechnical;
  fundamentals: { pe: number | null; adjustedPe: number | null; tradeDate: string | null; note: string };
  valuation: { score: number | null; pe: number | null; flag: string | null; note: string };
  market: { regime: string; relativeStrength: number | null; niftyLevel: number | null; note: string };
  risk: { score: number; volatilityPct: number | null; drawdownPct: number | null; volRatio: number | null; note: string };
  entry: { zoneLow: number; zoneHigh: number; stopLoss: number; note: string; reason: string; overbought: boolean };
  positiveFactors: string[];
  negativeFactors: string[];
  oneLiner: string;
  simpleNote: string;
  prediction: string;
  expectedClose: number | null;
  expectedPct: number | null;
  engine: EngineOutput | null;
  engineWhy: EngineWhy | null;
  morningBaseline?: {
    predictionTimestamp: string;
    predictionPrice: number | null;
    directionalOutlook: string;
    baseCase: number | null;
    bearCase: number | null;
    bullCase: number | null;
    expectedMovePct: number | null;
    invalidationPrice: number | null;
    trajectoryStatus: 'ON_TRACK' | 'PULLBACK' | 'INVALIDATED' | 'NEUTRAL_RANGE';
    trajectoryReason: string;
  } | null;
  dataTimestamp: string;
  disclaimer: string;
}

export interface AiAnalyzeResponse {
  ok: boolean;
  symbol: string;
  analysis: AiAnalysis;
  formatted: string;
}

export interface AiAnalyzeManyResponse {
  results: { symbol: string; analysis: AiAnalysis; formatted: string }[];
  errors: { symbol: string; error: string }[];
}

export interface MarketPrediction {
  tradeDate: string;
  direction: 'RISE' | 'FALL' | 'FLAT';
  confidence: number;
  reason: string;
  predictedNiftyLevel: number | null;
  predictedNiftyChangePct: number | null;
  // Set once, after market close, from the official EOD Nifty level — this
  // is what decides `outcome`. Stays null all day until the session closes.
  actualNiftyLevel: number | null;
  actualChangePct: number | null;
  outcome: 'PENDING' | 'CORRECT' | 'WRONG';
  // Informational only — the current live Nifty level. Never used to decide
  // or freeze `outcome` (see CRIT-7 in the pipeline audit).
  liveNiftyLevel?: number | null;
  liveChangePct?: number | null;
}

export interface MarketPredictionTrack {
  records: MarketPrediction[];
  accuracy: number | null;
  decidedCount: number;
  correctCount: number;
}

export interface MarketPredictionResponse {
  today: MarketPrediction;
  track: MarketPredictionTrack;
}

export interface PredictedRiser {
  symbol: string;
  companyName: string;
  price: number | null;
  expectedClose: number;
  expectedPct: number;
  finalSignal: string;
  stopLoss: number | null;
}

export interface PredictedRiser {
  symbol: string;
  companyName: string;
  price: number | null;
  expectedClose: number;
  expectedPct: number;
  finalSignal: string;
  stopLoss: number | null;
}

export interface RiserCandidate {
  symbol: string;
  companyName: string;
  price: number | null;
  score: number;
  signal: string;
  tradeStatus: string;
  expectedClose: number | null;
  expectedPct: number | null;
  reason: string | null;
}

export interface ActionableSetup {
  symbol: string;
  companyName: string;
  price: number | null;
  score: number;
  entry: [number, number] | null;
  confirmation: number | null;
  target1: number | null;
  target2: number | null;
  stopLoss: number | null;
  riskReward: number | null;
  expectedClose: number | null;
  reason: string | null;
}

export interface PredictedRisersResponse {
  candidates: RiserCandidate[];
  actionable: ActionableSetup[];
}

export interface PredictionRecord {
  id: string;
  date: string;
  week: string;
  symbol: string;
  sector: string;
  predictionPrice: number | null;
  expectedRange: [number, number] | null;
  baseCase: number | null;
  bullCase: number | null;
  bearCase: number | null;
  entry: number | null;
  confirmation: number | null;
  target1: number | null;
  target2: number | null;
  stopLoss: number | null;
  signal: string | null;
  score: number | null;
  confidence: string | null;
  confidenceScore: number | null;
  dataStatus: string | null;
  modelVersion: string | null;
  status: 'OPEN' | 'CLOSED';
  actualClose?: number;
  intradayLow?: number | null;
  stopHit?: boolean;
  result?: 'WIN' | 'PARTIAL' | 'LOSS' | 'STOPPED';
  errorPct?: number;
  returnPct?: number;
  directionCorrect?: boolean;
}

export interface PredictionPerformance {
  predictions: PredictionRecord[];
  performance: {
    overall: Record<string, unknown>;
    byWeek: Record<string, unknown>;
    note: string;
  };
}

export interface Alert {
  id: number;
  userId: number;
  name: string;
  symbol: string | null;
  alertType: string;
  threshold: number;
  active: boolean;
  channels: string[];
  lastTriggeredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AlertEvent {
  id: number;
  alertId: number;
  symbol: string | null;
  value: number | null;
  threshold: number;
  alertType: string;
  triggeredAt: string;
  seen: boolean;
  alert?: { name: string };
}

export interface Notification {
  id: number;
  channel: string;
  provider: string;
  title: string;
  body: string;
  read: boolean;
  deliveredAt: string;
}

export interface JournalEntry {
  id: number;
  symbol: string;
  exchange: string;
  side: string;
  quantity: number;
  price: number;
  timestamp: string;
  status: string;
  pnl: number | null;
  notes: string | null;
}

export interface Settings {
  id: number;
  riskProfile: string;
  universeVisibility: string;
  notificationChannels: string[];
  quietHoursEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  updatedAt: string;
}

export interface SystemHealth {
  application: { status: string; environment: string; uptimeSeconds: number; version: string };
  database: { status: string; error?: string };
  marketData: {
    provider: string;
    dataSource: string;
    environment: string;
    status: string;
    mode: string;
    external: {
      status: string;
      primary?: string;
      fallback?: string;
      backfill?: string;
      lastMarketDataTimestamp?: string | null;
      staleSymbols?: number;
      [key: string]: unknown;
    } | null;
    recentAudits: unknown[];
  };
  brokerProvider: { provider: string; environment: string; status: string; connections: number };
  notificationProvider: { provider: string; environment: string };
  errors: { recent: unknown[]; counts: unknown[] };
  statistics: { users: number; brokerConnections: number };
}

export interface ComplianceConsent {
  id: number;
  userId: number;
  broker: string;
  scope: string;
  status: string;
  createdAt: string;
  revokedAt: string | null;
  user?: { email: string; fullName: string | null };
}

export interface DsrRequest {
  id: number;
  userId: number;
  type: string;
  status: string;
  notes: string | null;
  submittedAt: string;
  resolvedAt: string | null;
  user?: { email: string; fullName: string | null };
}

export interface ScanUniverseEntry {
  id: number;
  instrumentId: number;
  symbol: string;
  exchange: string;
  instrumentType: string;
  enabled: boolean;
  priority: number;
  excluded: boolean;
  exclusionReason: string | null;
  name: string | null;
  sector: string | null;
}

export interface Instrument {
  id: number;
  symbol: string;
  exchange: string;
  instrumentType: string;
  name: string | null;
  sector: string | null;
  basePrice: number | null;
  enabled: boolean;
}
