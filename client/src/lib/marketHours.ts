/**
 * Indian Stock Market (NSE/BSE) Trading Hours Utility.
 * Trading Days: Monday to Friday
 * Trading Hours: 09:15 to 15:30 IST
 */

export function isMarketOpen(d = new Date()): boolean {
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(d.getTime() + istOffset);
  const day = ist.getUTCDay(); // 0 = Sunday, 6 = Saturday
  if (day === 0 || day === 6) return false;

  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;
}

export function getMarketStatus(): { isOpen: boolean; label: string; badgeText: string; detail: string } {
  const open = isMarketOpen();
  if (open) {
    return {
      isOpen: true,
      label: 'MARKET LIVE',
      badgeText: '● LIVE (09:15–15:30 IST)',
      detail: 'Real-time NSE/BSE streaming active',
    };
  }
  return {
    isOpen: false,
    label: 'MARKET CLOSED',
    badgeText: '● MARKET CLOSED',
    detail: 'NSE/BSE Closed • Showing Latest Verified EOD Closing Data',
  };
}
