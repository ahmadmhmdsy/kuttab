import type { LabRuntime } from "./types.ts";

/** Lab runtimes are plugins: register one per language, look it up by language id. */
export class LabRegistry {
  private runtimes = new Map<string, LabRuntime>();

  register(rt: LabRuntime): this {
    this.runtimes.set(rt.language, rt);
    return this;
  }

  get(language: string): LabRuntime {
    const rt = this.runtimes.get(language);
    if (!rt) throw new Error(`No lab runtime registered for "${language}"`);
    return rt;
  }

  has(language: string): boolean {
    return this.runtimes.has(language);
  }

  list(): LabRuntime[] {
    return [...this.runtimes.values()];
  }

  dispose(): void {
    for (const rt of this.runtimes.values()) rt.dispose?.();
    this.runtimes.clear();
  }
}
