export const DAY_MS = 24 * 60 * 60 * 1_000;

export type DashboardRange = {
  from: Date;
  to: Date;
  fromDate: string;
  toDateExclusive: string;
};

type LocalDateParts = { year: number; month: number; day: number };

export function getDashboardRanges(now: Date, days: number, timeZone: string) {
  const today = zonedDateParts(now, timeZone);
  const toParts = addLocalDays(today, 1);
  const fromParts = addLocalDays(toParts, -days);
  const previousFromParts = addLocalDays(fromParts, -days);

  return {
    current: {
      from: zonedMidnightToUtc(fromParts, timeZone),
      to: zonedMidnightToUtc(toParts, timeZone),
      fromDate: dateKey(fromParts),
      toDateExclusive: dateKey(toParts),
    },
    previous: {
      from: zonedMidnightToUtc(previousFromParts, timeZone),
      to: zonedMidnightToUtc(fromParts, timeZone),
      fromDate: dateKey(previousFromParts),
      toDateExclusive: dateKey(fromParts),
    },
  } satisfies Record<"current" | "previous", DashboardRange>;
}

export function addLocalDays(parts: LocalDateParts, days: number): LocalDateParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

export function dateKey(parts: LocalDateParts) {
  return `${parts.year.toString().padStart(4, "0")}-${parts.month
    .toString()
    .padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}`;
}

export function parseDateKey(value: string): LocalDateParts {
  const [year, month, day] = value.split("-").map(Number);
  return { year: year ?? 0, month: month ?? 0, day: day ?? 0 };
}

export function localDayDifference(from: string, to: string) {
  const fromParts = parseDateKey(from);
  const toParts = parseDateKey(to);
  return Math.round(
    (Date.UTC(toParts.year, toParts.month - 1, toParts.day) -
      Date.UTC(fromParts.year, fromParts.month - 1, fromParts.day)) /
      DAY_MS
  );
}

function zonedDateParts(
  value: Date,
  timeZone: string
): LocalDateParts & { hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const valueOf = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: valueOf("year"),
    month: valueOf("month"),
    day: valueOf("day"),
    hour: valueOf("hour"),
    minute: valueOf("minute"),
    second: valueOf("second"),
  };
}

function zonedMidnightToUtc(parts: LocalDateParts, timeZone: string) {
  const target = Date.UTC(parts.year, parts.month - 1, parts.day);
  const offsets = new Set<number>();

  // Time zones can change offset exactly at midnight. Resolve every offset near
  // the target instead of iterating from a single offset, which can oscillate
  // between the two sides of a midnight gap.
  for (const hoursFromTarget of [-36, -24, -12, 0, 12, 24, 36]) {
    const instant = target + hoursFromTarget * 60 * 60 * 1_000;
    const zoned = zonedDateParts(new Date(instant), timeZone);
    const represented = Date.UTC(
      zoned.year,
      zoned.month - 1,
      zoned.day,
      zoned.hour,
      zoned.minute,
      zoned.second
    );
    offsets.add(represented - instant);
  }

  const candidates = [...offsets]
    .map((offset) => target - offset)
    .filter((instant) => dateKey(zonedDateParts(new Date(instant), timeZone)) === dateKey(parts))
    .sort((left, right) => left - right);
  if (candidates[0] !== undefined) return new Date(candidates[0]);

  // A jurisdiction may skip an entire local date. In that exceptional case,
  // return the first representable instant after it so period boundaries remain
  // monotonic instead of leaking activity from the preceding date.
  const targetKey = dateKey(parts);
  let previous = target - 36 * 60 * 60 * 1_000;
  for (let instant = previous; instant <= target + 36 * 60 * 60 * 1_000; instant += 30 * 60 * 1_000) {
    const localKey = dateKey(zonedDateParts(new Date(instant), timeZone));
    if (localKey >= targetKey) {
      let lower = previous;
      let upper = instant;
      while (upper - lower > 1) {
        const middle = Math.floor((lower + upper) / 2);
        if (dateKey(zonedDateParts(new Date(middle), timeZone)) >= targetKey) upper = middle;
        else lower = middle;
      }
      return new Date(upper);
    }
    previous = instant;
  }

  throw new RangeError(`No se pudo resolver el inicio del día ${targetKey} en ${timeZone}`);
}
