// Course service: ties plan, lessons, mastery, review and streak to a store.
// The UI calls these and never touches the store layout directly.
import { K, type KvStore } from "./store.ts";
import { recordEvidence, type EvidenceKind, type MasteryMap } from "./mastery.ts";
import { newReviewCard, rateCard, dueCards, type ReviewCard, type ReviewRating } from "./review.ts";
import { markStudied, type Streak } from "./streak.ts";
import type { Plan } from "./plan.ts";
import type { Lesson, LearnerProfile } from "./schema.ts";
import type { LessonRecord } from "./session.ts";
import { LearnerMemory } from "./memory.ts";
import type { ResourcePack } from "./track.ts";

export class Course {
  constructor(private store: KvStore) {}

  profile(): Promise<LearnerProfile | undefined> {
    return this.store.get<LearnerProfile>(K.profile);
  }
  saveProfile(p: LearnerProfile): Promise<void> {
    return this.store.set(K.profile, p);
  }

  async memory(): Promise<LearnerMemory> {
    const m = LearnerMemory.safeParse(await this.store.get(K.memory));
    return m.success ? m.data : { facts: [] };
  }
  saveMemory(m: LearnerMemory): Promise<void> {
    return this.store.set(K.memory, m);
  }

  async plans(): Promise<Plan[]> {
    const keys = await this.store.keys(K.plans);
    const plans = await Promise.all(keys.map((k) => this.store.get<Plan>(k)));
    return plans.filter((p): p is Plan => !!p);
  }
  plan(id: string): Promise<Plan | undefined> {
    return this.store.get<Plan>(K.plan(id));
  }
  savePlan(p: Plan): Promise<void> {
    return this.store.set(K.plan(p.id), p);
  }
  /** The track's resource pack: what research found, kept so lessons need no search. */
  resources(planId: string): Promise<ResourcePack | undefined> {
    return this.store.get<ResourcePack>(K.resources(planId));
  }
  saveResources(p: ResourcePack): Promise<void> {
    return this.store.set(K.resources(p.planId), p);
  }
  async deletePlan(id: string): Promise<void> {
    await this.store.delete(K.plan(id));
    await this.store.delete(K.mastery(id));
    await this.store.delete(K.resources(id));
    for (const k of await this.store.keys(`lessons/${id}/`)) await this.store.delete(k);
    for (const k of await this.store.keys(`live/${id}/`)) await this.store.delete(k);
    for (const c of await this.cards()) if (c.planId === id) await this.store.delete(K.card(c.id));
    const mem = await this.memory();
    if (mem.facts.some((f) => f.trackId === id)) await this.saveMemory({ facts: mem.facts.filter((f) => f.trackId !== id) });
  }

  async mastery(planId: string): Promise<MasteryMap> {
    return (await this.store.get<MasteryMap>(K.mastery(planId))) ?? {};
  }

  lesson(planId: string, objectiveId: string): Promise<Lesson | undefined> {
    return this.store.get<Lesson>(K.lesson(planId, objectiveId));
  }
  saveLesson(planId: string, l: Lesson): Promise<void> {
    return this.store.set(K.lesson(planId, l.objectiveId), l);
  }
  async lessons(planId: string): Promise<Lesson[]> {
    const keys = await this.store.keys(`lessons/${planId}/`);
    return (await Promise.all(keys.map((k) => this.store.get<Lesson>(k)))).filter((l): l is Lesson => !!l);
  }
  async dropLesson(planId: string, objectiveId: string): Promise<void> {
    await this.store.delete(K.lesson(planId, objectiveId));
  }

  /** The last live session on an objective, kept for notes and resuming. */
  liveRecord(planId: string, objectiveId: string): Promise<LessonRecord | undefined> {
    return this.store.get<LessonRecord>(K.live(planId, objectiveId));
  }
  saveLiveRecord(planId: string, objectiveId: string, rec: LessonRecord): Promise<void> {
    return this.store.set(K.live(planId, objectiveId), rec);
  }

  /** Cached lesson, or generate and cache one. Concurrent calls share one generation. */
  private inflight = new Map<string, Promise<Lesson>>();
  async lessonOrGenerate(planId: string, objectiveId: string, gen: () => Promise<Lesson>): Promise<Lesson> {
    const cached = await this.lesson(planId, objectiveId);
    if (cached) return cached;
    const key = K.lesson(planId, objectiveId);
    let p = this.inflight.get(key);
    if (!p) {
      p = gen().then(async (l) => {
        await this.saveLesson(planId, l);
        return l;
      });
      p.finally(() => this.inflight.delete(key)).catch(() => {});
      this.inflight.set(key, p);
    }
    return p;
  }

  /** Records a check, exercise, reflection or review result. Check blocks also enter the review queue. */
  async record(planId: string, objectiveId: string, kind: EvidenceKind, correct: boolean, blockId?: string, now = new Date()): Promise<MasteryMap> {
    const m = recordEvidence(await this.mastery(planId), objectiveId, kind, correct, now.toISOString());
    await this.store.set(K.mastery(planId), m);
    if (blockId && kind !== "review") {
      const id = `${planId}/${blockId}`;
      if (!(await this.store.get(K.card(id)))) {
        let card = newReviewCard(planId, objectiveId, blockId, now);
        // First answer counts as the first review.
        card = rateCard(card, correct ? "good" : "again", now);
        await this.store.set(K.card(id), card);
      }
    }
    await this.studied(now);
    return m;
  }

  async cards(): Promise<ReviewCard[]> {
    const keys = await this.store.keys(K.cards);
    return (await Promise.all(keys.map((k) => this.store.get<ReviewCard>(k)))).filter((c): c is ReviewCard => !!c);
  }
  async due(now = new Date()): Promise<ReviewCard[]> {
    return dueCards(await this.cards(), now);
  }
  async dropCard(id: string): Promise<void> {
    await this.store.delete(K.card(id));
  }
  async review(card: ReviewCard, rating: ReviewRating, now = new Date()): Promise<ReviewCard> {
    const next = rateCard(card, rating, now);
    await this.store.set(K.card(card.id), next);
    await this.record(card.planId, card.objectiveId, "review", rating !== "again", undefined, now);
    return next;
  }

  async streak(): Promise<Streak> {
    return (await this.store.get<Streak>(K.streak)) ?? { current: 0, best: 0 };
  }
  private async studied(now: Date): Promise<void> {
    await this.store.set(K.streak, markStudied(await this.streak(), now));
  }
}
