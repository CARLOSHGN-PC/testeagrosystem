const PT_BR_WEEKDAY_TO_INDEX = {
  dom: 0,
  seg: 1,
  ter: 2,
  qua: 3,
  qui: 4,
  sex: 5,
  sab: 6,
  sáb: 6,
};

export function getCurrentMonthIndex(now = new Date()) {
  return now.getMonth();
}

export function getCurrentWeekRange(now = new Date()) {
  const start = new Date(now);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

export function getRemainingHoursUntilEndOfDay(now = new Date()) {
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  const diffMs = Math.max(0, endOfDay.getTime() - now.getTime());
  return diffMs / 3600000;
}

export function extractEffectiveWeekdays(weekRows = []) {
  const weekdays = new Set();
  (Array.isArray(weekRows) ? weekRows : []).forEach((row) => {
    const normalized = String(row?.dia || '').toLowerCase().trim();
    const weekday = PT_BR_WEEKDAY_TO_INDEX[normalized];
    if (Number.isInteger(weekday)) weekdays.add(weekday);
  });
  if (!weekdays.size) {
    for (let day = 0; day <= 6; day += 1) weekdays.add(day);
  }
  return weekdays;
}

export function getRemainingEffectiveDaysOfWeek(now = new Date(), effectiveWeekdays = new Set([0, 1, 2, 3, 4, 5, 6])) {
  const { end } = getCurrentWeekRange(now);
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);

  let total = 0;
  while (cursor <= end) {
    if (effectiveWeekdays.has(cursor.getDay())) total += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return total;
}

export function getRemainingEffectiveDaysOfMonth(now = new Date(), effectiveWeekdays = new Set([0, 1, 2, 3, 4, 5, 6])) {
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  let total = 0;
  while (cursor <= endOfMonth) {
    if (effectiveWeekdays.has(cursor.getDay())) total += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return total;
}

export function calculateReprojectedTarget(balance, remainingEffectiveTime) {
  if (Number(balance) <= 0) return 0;
  const denominator = Number(remainingEffectiveTime);
  if (!Number.isFinite(denominator) || denominator <= 0) return 0;
  return Number(balance) / denominator;
}

export function formatBrazilianNumber(value, minFractionDigits = 0, maxFractionDigits = 0) {
  const normalized = Number.isFinite(Number(value)) ? Number(value) : 0;
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: minFractionDigits,
    maximumFractionDigits: maxFractionDigits,
  }).format(normalized);
}
