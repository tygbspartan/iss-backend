import { z } from "zod";

/** A real calendar date as YYYY-MM-DD, no time ("2026-02-30" is refused). */
export const calendarDate = (label: string) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .refine((v) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
      const d = new Date(`${v}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
    }, `${label} must be a valid date as YYYY-MM-DD`);
