// Reading a learner's image (T-24): the text in it (OCR) and a description, both
// by the teacher model's vision. Models without vision fail here with the
// provider's own message, which the app shows as is.
import { generateText, Output } from "ai";
import { z } from "zod";
import { LANG_NAME, type Ctx } from "./llm.ts";
import type { Lang } from "./schema.ts";

export const ImageReadingSchema = z.object({
  text: z.string().describe("All readable text in the image, in reading order, exactly as written. Empty if there is none."),
  description: z.string().describe("What the image shows and what it teaches: diagrams, labels, charts, formulas."),
});
export type ImageReadingResult = z.infer<typeof ImageReadingSchema>;

const INSTRUCTIONS = (lang: Lang) => `You read images a learner adds to their study sources.
Copy the text in the image faithfully, keeping its own language. Then describe the image in ${LANG_NAME[lang]} so a tutor can teach from it without seeing it.

Reply with one JSON object only, no prose or code fences, matching this JSON Schema:
${JSON.stringify(z.toJSONSchema(ImageReadingSchema))}`;

export async function readImage(ctx: Ctx, image: Uint8Array, mediaType: string, lang: Lang, attempts = 2): Promise<ImageReadingResult> {
  let lastErr = "";
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await generateText({
        model: ctx.teacher,
        output: Output.object({ schema: ImageReadingSchema }),
        instructions: INSTRUCTIONS(lang),
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: lastErr ? `Read this image. Your previous answer was rejected: ${lastErr.slice(0, 400)}` : "Read this image." },
              { type: "image", image, mediaType },
            ],
          },
        ],
        maxRetries: 1,
        abortSignal: ctx.signal,
      });
      ctx.onUsage?.({ role: "teacher", task: "image reading", inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens });
      return r.output;
    } catch (e) {
      if (ctx.signal?.aborted) throw e;
      lastErr = e instanceof Error ? e.message : String(e);
      if (i === attempts - 1) throw new Error(`The model could not read the image: ${lastErr}`);
    }
  }
  throw new Error("unreachable");
}
