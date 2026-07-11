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

/** Positive number = days overdue, 0 = due today, negative = days remaining. Null if unparsable. */
export function daysOverdue(deadline: string): number | null {
  const date = parseRuDate(deadline);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = today.getTime() - date.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}
