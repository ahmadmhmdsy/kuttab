// The learning plan: an objective graph the learner can see, edit and skip.
import type { Lang, Objective } from "./schema.ts";

export type ObjectiveStatus = "todo" | "skipped" | "done";

export interface PlanItem extends Objective {
  status: ObjectiveStatus;
}

export interface Plan {
  id: string;
  title: string;
  /** Pack it came from, if any. */
  packId?: string;
  /** Language lessons are written in. Falls back to the learner profile. */
  lang?: Lang;
  description?: string;
  items: PlanItem[];
}

export function planFromObjectives(id: string, title: string, objectives: Objective[], packId?: string): Plan {
  const plan: Plan = { id, title, packId, items: objectives.map((o) => ({ ...o, prereqs: [...(o.prereqs ?? [])], status: "todo" })) };
  validatePlan(plan);
  return { ...plan, items: topoSort(plan.items) };
}

/** Throws on duplicate ids, unknown prerequisites or cycles. */
export function validatePlan(plan: Plan): void {
  const ids = new Set<string>();
  for (const it of plan.items) {
    if (ids.has(it.id)) throw new Error(`Duplicate objective "${it.id}"`);
    ids.add(it.id);
  }
  for (const it of plan.items) for (const p of it.prereqs) if (!ids.has(p)) throw new Error(`"${it.id}" needs unknown objective "${p}"`);
  topoSort(plan.items);
}

/** Stable topological order: keeps the author's order wherever prerequisites allow. */
export function topoSort<T extends { id: string; prereqs: string[] }>(items: T[]): T[] {
  const done = new Set<string>();
  const out: T[] = [];
  const pending = [...items];
  while (pending.length) {
    const i = pending.findIndex((it) => it.prereqs.every((p) => done.has(p) || !items.some((x) => x.id === p)));
    if (i < 0) throw new Error(`Prerequisite cycle among: ${pending.map((p) => p.id).join(", ")}`);
    const [it] = pending.splice(i, 1);
    done.add(it.id);
    out.push(it);
  }
  return out;
}

// Edits return a new plan and never mutate the input.

export function setStatus(plan: Plan, id: string, status: ObjectiveStatus): Plan {
  return { ...plan, items: plan.items.map((it) => (it.id === id ? { ...it, status } : it)) };
}

export function renameObjective(plan: Plan, id: string, title: string, summary?: string): Plan {
  return { ...plan, items: plan.items.map((it) => (it.id === id ? { ...it, title, summary: summary ?? it.summary } : it)) };
}

export function addObjective(plan: Plan, o: Objective): Plan {
  const next = { ...plan, items: [...plan.items, { ...o, prereqs: [...(o.prereqs ?? [])], status: "todo" as const }] };
  validatePlan(next);
  return next;
}

/** Removes an objective; anything that depended on it inherits its prerequisites. */
export function removeObjective(plan: Plan, id: string): Plan {
  const gone = plan.items.find((it) => it.id === id);
  if (!gone) return plan;
  return {
    ...plan,
    items: plan.items
      .filter((it) => it.id !== id)
      .map((it) => (it.prereqs.includes(id) ? { ...it, prereqs: [...new Set([...it.prereqs.filter((p) => p !== id), ...gone.prereqs])] } : it)),
  };
}

/** Moves an objective by `delta` positions if prerequisites still hold. */
export function moveObjective(plan: Plan, id: string, delta: number): Plan {
  const i = plan.items.findIndex((it) => it.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= plan.items.length) return plan;
  const items = [...plan.items];
  const [it] = items.splice(i, 1);
  items.splice(j, 0, it);
  const seen = new Set<string>();
  for (const x of items) {
    if (x.prereqs.some((p) => !seen.has(p))) return plan;
    seen.add(x.id);
  }
  return { ...plan, items };
}

export function setPrereqs(plan: Plan, id: string, prereqs: string[]): Plan {
  const next = { ...plan, items: plan.items.map((it) => (it.id === id ? { ...it, prereqs } : it)) };
  validatePlan(next);
  return { ...next, items: topoSort(next.items) };
}
