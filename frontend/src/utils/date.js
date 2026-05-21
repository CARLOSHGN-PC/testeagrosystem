export const parseDateSafe = (d) => {
  if (!d) return null;

  // já é Date
  if (d instanceof Date) return d;

  // PostgreSQL Timestamp-like (toDate function)
  if (typeof d === 'object' && typeof d.toDate === 'function') {
    const parsedFromTimestamp = d.toDate();
    return parsedFromTimestamp instanceof Date && !Number.isNaN(parsedFromTimestamp.getTime())
      ? parsedFromTimestamp
      : null;
  }

  // PostgreSQL Timestamp-like (seconds/nanoseconds)
  if (typeof d === 'object' && typeof d.seconds === 'number') {
    const parsedFromSeconds = new Date(d.seconds * 1000);
    return Number.isNaN(parsedFromSeconds.getTime()) ? null : parsedFromSeconds;
  }

  // número (possível Excel)
  if (typeof d === 'number') {
    // conversão Excel → JS Date
    const excelParsed = new Date((d - 25569) * 86400 * 1000);
    return Number.isNaN(excelParsed.getTime()) ? null : excelParsed;
  }

  // string ou outros
  const parsed = new Date(d);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
