import { describe, expect, it } from 'vitest';
import { getMarketSessionStatus, isMarketOpen } from '../src/services/officialClose.js';
import { getTradingDayStatus, nextTradingDate } from '../src/services/nseTradingCalendar.js';
import { isMorningPredictionWindow } from '../src/services/predictionTracker.js';

describe('NSE holiday-aware trading sessions', () => {
  it('blocks the automatic scan on an NSE holiday during normal market hours', () => {
    const holiday = new Date('2026-09-14T09:25:00+05:30');
    expect(getTradingDayStatus(holiday).reason).toBe('NSE_HOLIDAY');
    expect(isMarketOpen(holiday)).toBe(false);
    expect(isMorningPredictionWindow(holiday)).toBe(false);
    expect(getMarketSessionStatus(holiday).session).toBe('HOLIDAY');
  });

  it('opens on an ordinary weekday and closes after 15:30 IST', () => {
    expect(getMarketSessionStatus(new Date('2026-09-02T10:00:00+05:30')).session).toBe('OPEN');
    expect(getMarketSessionStatus(new Date('2026-09-02T15:31:00+05:30')).session).toBe('CLOSED');
  });

  it('targets the next valid trading date across a holiday and weekend', () => {
    expect(nextTradingDate(new Date('2026-09-11T16:00:00+05:30'))).toBe('2026-09-15');
  });

  it('fails closed when the annual exchange calendar is unavailable', () => {
    expect(getTradingDayStatus(new Date('2027-01-04T10:00:00+05:30')).reason).toBe('CALENDAR_UNAVAILABLE');
    expect(isMarketOpen(new Date('2027-01-04T10:00:00+05:30'))).toBe(false);
  });
});
