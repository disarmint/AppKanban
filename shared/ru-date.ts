const RU_MONTHS: Record<string, number> = {
  "января": 0,
  "февраля": 1,
  "марта": 2,
  "апреля": 3,
  "мая": 4,
  "июня": 5,
  "июля": 6,
  "августа": 7,
  "сентября": 8,
  "октября": 9,
  "ноября": 10,
  "декабря": 11,
};

const RU_MONTHS_NOMINATIVE = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

/** Parses dates like "17 мая 2026". Returns null if the format doesn't match. */
export function parseRuDate(value: string): Date | null {
  const match = value.trim().match(/^(\d{1,2})\s+([а-яёА-ЯЁ]+)\s+(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = RU_MONTHS[match[2].toLowerCase()];
  const year = Number(match[3]);
  if (month === undefined || Number.isNaN(day) || Number.isNaN(year)) return null;
  const date = new Date(year, month, day);
  date.setHours(0, 0, 0, 0);
  return date;
}

/** "YYYY-MM-DD" in local time. */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parses an ISO "YYYY-MM-DD" into a local-midnight Date, or null. */
export function parseIsoDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setHours(0, 0, 0, 0);
  return date;
}

/** Formats a Date as a Russian human string like "17 мая 2026". */
export function formatRuDate(date: Date): string {
  return `${date.getDate()} ${RU_MONTHS_NOMINATIVE[date.getMonth()]} ${date.getFullYear()}`;
}

/** Positive = days overdue, 0 = due today, negative = days remaining. Null if no date. */
export function daysOverdueFromIso(iso: string | null | undefined): number | null {
  const date = parseIsoDate(iso);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

/** Positive number = days overdue, 0 = due today, negative = days remaining. Null if unparsable. */
export function daysOverdue(deadline: string): number | null {
  const date = parseRuDate(deadline);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}
