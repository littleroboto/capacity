export function createHolidayCheck(holidaysByMarket: Record<string, string[]>): (market: string, date: string) => boolean {
  const sets: Record<string, Set<string>> = {};
  for (const [market, dates] of Object.entries(holidaysByMarket || {})) {
    sets[market] = new Set(Array.isArray(dates) ? dates : []);
  }
  return (market, date) => (sets[market] ?? new Set()).has(date);
}
