// App state. Durable data (courses, progress, sources) lives in the platform
// store through Course and the knowledge base; this zustand store holds what
// the screens render: route, settings, profile and live counters.
import { create } from "zustand";
import { Course, K, liveStreak, type Dialect, type Lang, type LearnerProfile } from "@kuttab/engine";
import { KnowledgeBase, type KbSnapshot } from "@kuttab/kb";
import type { LabRegistry } from "@kuttab/labs";
import type { PriceOverride, SearchEngineId } from "@kuttab/llm-gateway";
import type { Platform } from "./platform/index.ts";

export interface ModelChoice {
  provider: string;
  model: string;
  baseURL?: string;
}

/** How researched tracks reach the web (T-23). "native" uses the teacher provider's own search. */
export type SearchKind = "off" | "browser" | "native" | SearchEngineId;

export type WhisperSize = "tiny" | "base" | "small";

/**
 * How the live tutor talks and listens (T-25). engine: who reads aloud — the
 * system voices, Piper on this machine, or a provider's realtime voice (which
 * also hears the learner). listen: hold-to-talk, or always listening with VAD.
 */
export interface VoiceSettings {
  engine: "system" | "piper" | "realtime";
  listen: "hold" | "always";
  dialect: Dialect;
  realtime: "google" | "openai";
}

export interface Settings {
  uiLang: Lang;
  teacher?: ModelChoice;
  /** Undefined means "same as teacher". */
  grader?: ModelChoice;
  embedder?: ModelChoice;
  /** "provider:model" ids. */
  favorites: string[];
  custom: ModelChoice[];
  /** Per-provider base URL overrides (local servers on other ports). */
  baseURLs: Record<string, string>;
  prices: Record<string, PriceOverride>;
  tts: boolean;
  whisper: WhisperSize;
  voice: VoiceSettings;
  theme: "system" | "light" | "dark";
  textSize: "normal" | "large";
  /** Teacher tools the learner switched off (ADR 0001). */
  toolsOff: string[];
  askBeforeCode: boolean;
  /** headless: the browser route works in a hidden window. */
  search: { kind: SearchKind; searxngUrl?: string; headless?: boolean };
  onboarded: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  uiLang: navigator.language?.startsWith("ar") ? "ar" : "en",
  favorites: [],
  custom: [],
  baseURLs: {},
  prices: {},
  tts: true,
  whisper: "tiny",
  voice: { engine: "system", listen: "hold", dialect: "msa", realtime: "google" },
  theme: "system",
  textSize: "normal",
  toolsOff: [],
  askBeforeCode: true,
  search: { kind: "off" },
  onboarded: false,
};

/** Theme and text size live on <html> so CSS can follow them. */
export function applyAppearance(s: Pick<Settings, "theme" | "textSize">) {
  const root = document.documentElement;
  if (s.theme === "system") delete root.dataset.theme;
  else root.dataset.theme = s.theme;
  root.dataset.text = s.textSize;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cost: number;
  /** True when some calls had no known price, so `cost` is a lower bound. */
  unknown: boolean;
}

export const ZERO_USAGE: Usage = { inputTokens: 0, outputTokens: 0, cost: 0, unknown: false };

export type Route =
  | { name: "library" }
  | { name: "plan"; planId: string }
  | { name: "lesson"; planId: string; objectiveId: string }
  | { name: "live"; planId: string; objectiveId: string }
  | { name: "review" }
  | { name: "sources" }
  | { name: "playground" }
  | { name: "settings" }
  | { name: "memory" }
  | { name: "progress" };

interface AppState {
  ready: boolean;
  route: Route;
  settings: Settings;
  profile?: LearnerProfile;
  session: Usage;
  total: Usage;
  dueCount: number;
  streak: number;
  /** Bumped whenever the knowledge base changes so screens re-read it. */
  kbVersion: number;
  go(route: Route): void;
  updateSettings(patch: Partial<Settings>): void;
  setProfile(p: LearnerProfile): void;
}

export const useStore = create<AppState>((set, get) => ({
  ready: false,
  route: { name: "library" },
  settings: DEFAULT_SETTINGS,
  session: ZERO_USAGE,
  total: ZERO_USAGE,
  dueCount: 0,
  streak: 0,
  kbVersion: 0,
  go(route) {
    set({ route });
    window.scrollTo?.(0, 0);
  },
  updateSettings(patch) {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    void services().platform.store.set(K.settings, settings);
  },
  setProfile(profile) {
    set({ profile });
    void services().course.saveProfile(profile);
  },
}));

// ---------- Services ----------

export interface Services {
  platform: Platform;
  course: Course;
  labs: LabRegistry;
  kb: KnowledgeBase;
  /** "provider:model" the stored vectors were made with. */
  kbEmbedder?: string;
}

let svc: Services | null = null;

export function services(): Services {
  if (!svc) throw new Error("services not ready");
  return svc;
}

interface StoredKb {
  snapshot: KbSnapshot;
  embedder?: string;
}

export async function boot(createPlatform: () => Promise<Platform>, createLabs: () => LabRegistry): Promise<void> {
  const platform = await createPlatform();
  const course = new Course(platform.store);
  const stored = await platform.store.get<StoredKb>(K.kb);
  svc = { platform, course, labs: createLabs(), kb: stored ? KnowledgeBase.from(stored.snapshot) : new KnowledgeBase(), kbEmbedder: stored?.embedder };
  const saved = await platform.store.get<Settings>(K.settings);
  const settings = { ...DEFAULT_SETTINGS, ...saved, voice: { ...DEFAULT_SETTINGS.voice, ...saved?.voice } };
  const total = { ...ZERO_USAGE, ...(await platform.store.get<Usage>(K.usage)) };
  useStore.setState({ settings, profile: await course.profile(), total, ready: true });
  await refreshCounters();
}

export async function refreshCounters(): Promise<void> {
  const { course } = services();
  const [due, streak] = await Promise.all([course.due(), course.streak()]);
  useStore.setState({ dueCount: due.length, streak: liveStreak(streak) });
}

export async function saveKb(embedder?: string): Promise<void> {
  const s = services();
  if (embedder !== undefined) s.kbEmbedder = embedder || undefined;
  await s.platform.store.set<StoredKb>(K.kb, { snapshot: s.kb.snapshot(), embedder: s.kbEmbedder });
  useStore.setState((st) => ({ kbVersion: st.kbVersion + 1 }));
}

let usageTimer: ReturnType<typeof setTimeout> | undefined;

export function addUsage(inputTokens: number, outputTokens: number, cost: number | undefined): void {
  const add = (u: Usage): Usage => ({
    inputTokens: u.inputTokens + inputTokens,
    outputTokens: u.outputTokens + outputTokens,
    cost: u.cost + (cost ?? 0),
    unknown: u.unknown || cost === undefined,
  });
  useStore.setState((s) => ({ session: add(s.session), total: add(s.total) }));
  clearTimeout(usageTimer);
  usageTimer = setTimeout(() => void services().platform.store.set(K.usage, useStore.getState().total), 500);
}

export function resetUsage(): void {
  useStore.setState({ session: ZERO_USAGE, total: ZERO_USAGE });
  void services().platform.store.set(K.usage, ZERO_USAGE);
}

export const modelKey = (c: Pick<ModelChoice, "provider" | "model">) => `${c.provider}:${c.model}`;

/** Lesson language for a plan: the plan's own, else the learner's. */
export function planLang(plan: { lang?: Lang } | undefined): Lang {
  const st = useStore.getState();
  return plan?.lang ?? st.profile?.lang ?? st.settings.uiLang;
}
