// Date-only values (an event's day, with no time) and "today" in Nepal.

/** Today's date in Nepal as YYYY-MM-DD, whatever timezone the server runs in. */
export const todayInNepal = (): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu" }).format(new Date());

// Date-only values are stored and compared as midnight UTC of that date.
export const toDbDate = (date: string): Date => new Date(`${date}T00:00:00Z`);
export const toDateString = (date: Date): string => date.toISOString().slice(0, 10);
