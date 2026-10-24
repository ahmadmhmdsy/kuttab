// Goals with a date (T-27, decision 0002 items 20 and 23): the learner sets a
// finish date for a course, the tutor plans the pace from what is left, and
// reminders come from the same numbers. Dates are local calendar days.
import { planProgress, type MasteryMap } from "./mastery.ts";
import type { Plan } from "./plan.ts";

export interface Goal {
  planId: string;
  /** Finish date, "YYYY-MM-DD". */
  due: string;
  /** When the goal was set, "YYYY-MM-DD"; the pace is measured from here. */
  since: string;
  /** Show reminders for this goal. */
  remind: boolean;
  /** Last day a reminder was shown, so one goal reminds at most once a day. */
  remindedOn?: string;
}

export type PaceStatus = "done" | "ahead" | "on-track" | "behind" | "overdue";

export interface GoalPace {
  /** Objectives still to master or skip. */
  left: number;
  total: number;
  /** Whole days until the due date, counting today; 0 on the day after. */
  daysLeft: number;
  /** Objectives a week needed to finish on time. */
  perWeek: number;
  status: PaceStatus;
}

const DAY = 86_400_000;

/** Today as "YYYY-MM-DD" in local time. */
export function dayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayNumber(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Math.round(new Date(y!, m! - 1, d!).getTime() / DAY);
}

/**
 * How the learner stands against the goal. Progress is compared with the share
 * of time used: more than a tenth behind the straight line is "behind", more
 * than a tenth ahead is "ahead".
 */
export function goalPace(plan: Plan, m: MasteryMap, goal: Goal, now = new Date()): GoalPace {
  const total = plan.items.length;
  const doneShare = planProgress(plan, m);
  const left = total - Math.round(doneShare * total);
  const today = dayNumber(dayKey(now));
  const due = dayNumber(goal.due);
  const daysLeft = Math.max(0, due - today + 1);
  const perWeek = left === 0 ? 0 : daysLeft === 0 ? left : Math.ceil((left / daysLeft) * 7 * 10) / 10;
  let status: PaceStatus;
  if (left === 0) status = "done";
  else if (daysLeft === 0) status = "overdue";
  else {
    const span = Math.max(1, due - dayNumber(goal.since) + 1);
    const timeShare = Math.min(1, Math.max(0, (today - dayNumber(goal.since)) / span));
    status = doneShare < timeShare - 0.1 ? "behind" : doneShare > timeShare + 0.1 ? "ahead" : "on-track";
  }
  return { left, total, daysLeft, perWeek, status };
}

/** One line for the tutor's learner note, so the live session keeps the pace in mind. */
export function goalNote(goal: Goal, pace: GoalPace): string {
  if (pace.status === "done") return `Goal: finish by ${goal.due}. The learner has finished every objective.`;
  const head = `Goal: finish this course by ${goal.due} (${pace.daysLeft} days left, ${pace.left} of ${pace.total} objectives left, about ${pace.perWeek} a week).`;
  const tail = {
    overdue: " The date has passed; be encouraging and suggest a new date at the end.",
    behind: " The learner is behind; keep explanations tight and move on once a check is right.",
    ahead: " The learner is ahead; there is room for an extra example or a harder check.",
    "on-track": " The learner is on track.",
  }[pace.status];
  return head + tail;
}

export interface Reminder {
  goal: Goal;
  plan: Plan;
  pace: GoalPace;
}

/**
 * The goals to remind about now: reminders on, not finished, and not already
 * shown today. Overdue and behind come first, then the nearest date.
 */
export function dueReminders(items: { goal: Goal; plan: Plan; mastery: MasteryMap }[], now = new Date()): Reminder[] {
  const today = dayKey(now);
  const rank: Record<PaceStatus, number> = { overdue: 0, behind: 1, "on-track": 2, ahead: 3, done: 4 };
  return items
    .filter((i) => i.goal.remind && i.goal.remindedOn !== today)
    .map((i) => ({ goal: i.goal, plan: i.plan, pace: goalPace(i.plan, i.mastery, i.goal, now) }))
    .filter((r) => r.pace.status !== "done")
    .sort((a, b) => rank[a.pace.status] - rank[b.pace.status] || a.pace.daysLeft - b.pace.daysLeft);
}
