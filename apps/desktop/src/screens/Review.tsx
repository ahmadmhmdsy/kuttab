// Spaced review: due cards are shown one at a time as their original block.
import { useEffect, useState } from "react";
import type { Block, Lang, ReviewCard, ReviewRating } from "@kuttab/engine";
import { useT } from "../i18n.ts";
import { refreshCounters, services } from "../state.ts";
import { BlockView, blockId } from "../components/BlockView.tsx";
import { Card, Spinner } from "../components/common.tsx";

interface Item {
  card: ReviewCard;
  block: Block;
  lang: Lang;
  title: string;
}

const RATINGS: ReviewRating[] = ["again", "hard", "good", "easy"];

async function loadQueue(): Promise<Item[]> {
  const { course } = services();
  const cards = await course.due();
  const byPlan = new Map<string, Awaited<ReturnType<typeof course.lessons>>>();
  const out: Item[] = [];
  for (const card of cards) {
    if (!byPlan.has(card.planId)) byPlan.set(card.planId, await course.lessons(card.planId));
    const lesson = byPlan.get(card.planId)!.find((l) => l.objectiveId === card.objectiveId && l.blocks.some((b) => blockId(b) === card.blockId));
    const block = lesson?.blocks.find((b) => blockId(b) === card.blockId);
    if (!lesson || !block) {
      // The lesson was regenerated or removed; the card has nothing to show.
      await course.dropCard(card.id);
      continue;
    }
    out.push({ card, block, lang: lesson.lang, title: lesson.title });
  }
  return out;
}

export function Review() {
  const t = useT();
  const [queue, setQueue] = useState<Item[]>();
  const [answered, setAnswered] = useState(false);

  useEffect(() => {
    void loadQueue().then(async (q) => {
      setQueue(q);
      await refreshCounters();
    });
  }, []);

  if (!queue) return <Spinner />;
  const item = queue[0];
  if (!item)
    return (
      <main className="review">
        <h1>{t("review")}</h1>
        <p className="muted">{t("nothingDue")}</p>
      </main>
    );

  const rate = async (r: ReviewRating) => {
    await services().course.review(item.card, r);
    await refreshCounters();
    setAnswered(false);
    setQueue((q) => q?.slice(1));
  };

  return (
    <main className="review">
      <h1>{t("review")}</h1>
      <p className="muted small">{queue.length} {t("reviewLeft")}</p>
      <Card>
        <p className="muted small" dir="auto">
          {item.title}
        </p>
        <div lang={item.lang} dir={item.lang === "ar" ? "rtl" : "ltr"}>
          <BlockView key={item.card.id} block={item.block} lang={item.lang} onComplete={() => setAnswered(true)} />
        </div>
        {answered && (
          <div className="row rating">
            {RATINGS.map((r) => (
              <button key={r} className={r === "good" ? "primary" : ""} onClick={() => void rate(r)}>
                {t(r)}
              </button>
            ))}
          </div>
        )}
      </Card>
    </main>
  );
}
