// Spaced review with FSRS. Every check question the learner has answered
// becomes a review card; the queue shows the ones due today.
import { createEmptyCard, fsrs, generatorParameters, Rating, type Card, type Grade } from "ts-fsrs";

export type ReviewRating = "again" | "hard" | "good" | "easy";

const RATING: Record<ReviewRating, Grade> = { again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy };

/** JSON-safe card (dates as ISO strings) so any store can hold it. */
export interface ReviewCard {
  id: string;
  planId: string;
  objectiveId: string;
  /** Points at the lesson block the card was made from. */
  blockId: string;
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review?: string;
}

const scheduler = fsrs(generatorParameters({ enable_fuzz: false, request_retention: 0.9 }));

function toCard(c: ReviewCard): Card {
  return {
    due: new Date(c.due),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review ? new Date(c.last_review) : undefined,
  } as Card;
}

function fromCard(meta: Pick<ReviewCard, "id" | "planId" | "objectiveId" | "blockId">, c: Card): ReviewCard {
  return {
    ...meta,
    due: c.due.toISOString(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review?.toISOString(),
  };
}

export function newReviewCard(planId: string, objectiveId: string, blockId: string, now = new Date()): ReviewCard {
  return fromCard({ id: `${planId}/${blockId}`, planId, objectiveId, blockId }, createEmptyCard(now));
}

export function rateCard(card: ReviewCard, rating: ReviewRating, now = new Date()): ReviewCard {
  const { card: next } = scheduler.next(toCard(card), now, RATING[rating]);
  return fromCard(card, next);
}

export function dueCards(cards: ReviewCard[], now = new Date()): ReviewCard[] {
  return cards.filter((c) => new Date(c.due).getTime() <= now.getTime()).sort((a, b) => a.due.localeCompare(b.due));
}
