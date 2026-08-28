export function countMetric(value: number, previous: number) {
  return { value, previous, changePercent: percentageChange(value, previous) };
}

export function rateMetric(value: number, total: number, previousValue: number, previousTotal: number) {
  const currentRate = rate(value, total);
  const previousRate = rate(previousValue, previousTotal);
  return {
    value,
    total,
    rate: currentRate,
    previousValue,
    previousTotal,
    previousRate,
    changePercentagePoints:
      currentRate === null || previousRate === null ? null : round(currentRate - previousRate, 1),
  };
}

export function simpleRate(value: number, total: number) {
  return { value, total, rate: rate(value, total) };
}

export function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2, 1)
    : round(sorted[middle] ?? 0, 1);
}

export function round(value: number, precision: number) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function percentageChange(value: number, previous: number) {
  if (previous === 0) return value === 0 ? 0 : null;
  return round(((value - previous) / previous) * 100, 1);
}

function rate(value: number, total: number) {
  return total === 0 ? null : round((value / total) * 100, 1);
}
