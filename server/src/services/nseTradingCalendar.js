/** NSE equity cash-market calendar: NSE/CMTR/71775 + NSE/CMTR/72260. */
const HOLIDAYS_BY_YEAR = Object.freeze({
  2026: Object.freeze({
    '2026-01-15': 'Municipal Corporation Election in Maharashtra',
    '2026-01-26': 'Republic Day', '2026-03-03': 'Holi',
    '2026-03-26': 'Shri Ram Navami', '2026-03-31': 'Shri Mahavir Jayanti',
    '2026-04-03': 'Good Friday', '2026-04-14': 'Dr. Baba Saheb Ambedkar Jayanti',
    '2026-05-01': 'Maharashtra Day', '2026-05-28': 'Bakri Id',
    '2026-06-26': 'Muharram', '2026-09-14': 'Ganesh Chaturthi',
    '2026-10-02': 'Mahatma Gandhi Jayanti', '2026-10-20': 'Dussehra',
    '2026-11-08': 'Diwali Laxmi Pujan (regular session closed; special session not scheduled here)',
    '2026-11-10': 'Diwali-Balipratipada',
    '2026-11-24': 'Prakash Gurpurb Sri Guru Nanak Dev', '2026-12-25': 'Christmas',
  }),
});

export function istDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function getTradingDayStatus(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return { isTradingDay: false, reason: 'INVALID_DATE', date: null };
  const key = istDateKey(d);
  const year = Number(key.slice(0, 4));
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(d);
  if (['Sat', 'Sun'].includes(weekday)) return { isTradingDay: false, reason: 'WEEKEND', date: key };
  const calendar = HOLIDAYS_BY_YEAR[year];
  if (!calendar) return { isTradingDay: false, reason: 'CALENDAR_UNAVAILABLE', date: key };
  if (calendar[key]) return { isTradingDay: false, reason: 'NSE_HOLIDAY', holiday: calendar[key], date: key };
  return { isTradingDay: true, reason: 'REGULAR_SESSION', date: key };
}

export function nextTradingDate(date = new Date()) {
  const cursor = new Date(date);
  for (let i = 0; i < 15; i += 1) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const status = getTradingDayStatus(cursor);
    if (status.isTradingDay) return status.date;
  }
  return null;
}

export const NSE_CALENDAR_METADATA = Object.freeze({
  years: Object.keys(HOLIDAYS_BY_YEAR).map(Number),
  sources: ['https://nsearchives.nseindia.com/content/circulars/CMTR71775.pdf', 'https://nsearchives.nseindia.com/content/circulars/CMTR72260.pdf'],
});
