// Light gamification: a daily streak counted in the learner's local calendar.

export interface Streak {
  current: number;
  best: number;
  /** Local date (YYYY-MM-DD) of the last study day. */
  lastDay?: string;
}

export function localDay(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Call whenever the learner completes a lesson block, lab or review. */
export function markStudied(s: Streak, now = new Date()): Streak {
  const today = localDay(now);
  if (s.lastDay === today) return s;
  const current = s.lastDay && dayDiff(s.lastDay, today) === 1 ? s.current + 1 : 1;
  return { current, best: Math.max(s.best, current), lastDay: today };
}

/** The streak as it should be displayed today (0 if a day was missed). */
export function liveStreak(s: Streak, now = new Date()): number {
  if (!s.lastDay) return 0;
  return dayDiff(s.lastDay, localDay(now)) <= 1 ? s.current : 0;
}
