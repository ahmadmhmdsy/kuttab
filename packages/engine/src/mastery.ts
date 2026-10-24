// Mastery-based pacing. Each objective has a mastery score in [0, 1] built from
// the learner's check, exercise and review results. An objective unlocks when
// every prerequisite is mastered (or skipped by the learner).
import type { Plan, PlanItem } from "./plan.ts";

export const MASTERY_THRESHOLD = 0.8;

export interface MasteryRecord {
  score: number;
  attempts: number;
  lastAt?: string;
}

export type MasteryMap = Record<string, MasteryRecord>;

/** Weight of a single result. Exercises count more than quick checks. */
const WEIGHT = { check: 0.25, exercise: 0.4, reflect: 0.35, review: 0.2 } as const;
export type EvidenceKind = keyof typeof WEIGHT;

export function recordEvidence(m: MasteryMap, objectiveId: string, kind: EvidenceKind, correct: boolean, at = new Date().toISOString()): MasteryMap {
  const prev = m[objectiveId] ?? { score: 0, attempts: 0 };
  const w = WEIGHT[kind];
  const score = Math.min(1, Math.max(0, prev.score + w * ((correct ? 1 : 0) - prev.score)));
  return { ...m, [objectiveId]: { score: Math.round(score * 1000) / 1000, attempts: prev.attempts + 1, lastAt: at } };
}

export function isMastered(m: MasteryMap, id: string): boolean {
  return (m[id]?.score ?? 0) >= MASTERY_THRESHOLD;
}

export function isUnlocked(plan: Plan, m: MasteryMap, item: PlanItem): boolean {
  return item.prereqs.every((p) => {
    const dep = plan.items.find((x) => x.id === p);
    return !dep || dep.status !== "todo" || isMastered(m, p);
  });
}

export type ItemState = "locked" | "available" | "mastered" | "skipped";

export function itemState(plan: Plan, m: MasteryMap, item: PlanItem): ItemState {
  if (item.status === "skipped") return "skipped";
  if (item.status === "done" || isMastered(m, item.id)) return "mastered";
  return isUnlocked(plan, m, item) ? "available" : "locked";
}

/** The next objective to study: the first available one in plan order. */
export function nextObjective(plan: Plan, m: MasteryMap): PlanItem | undefined {
  return plan.items.find((it) => itemState(plan, m, it) === "available");
}

/** Overall progress: mastered or skipped share of the plan. */
export function planProgress(plan: Plan, m: MasteryMap): number {
  if (!plan.items.length) return 0;
  const n = plan.items.filter((it) => {
    const s = itemState(plan, m, it);
    return s === "mastered" || s === "skipped";
  }).length;
  return n / plan.items.length;
}
