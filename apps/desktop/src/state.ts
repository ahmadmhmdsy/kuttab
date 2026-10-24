// App state. Durable data (courses, progress, sources) lives in the platform
// store through Course and the knowledge base; this zustand store holds what
// the screens render: route, settings, profile and live counters.
import { create } from "zustand";
import { Course, K, liveStreak, profilePrefix, profileStore, type Dialect, type KvStore, type Lang, type LearnerProfile } from "@kuttab/engine";
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
  /** The local model a live session moves to when its budget runs out (decision 0002 item 6). */
  local?: ModelChoice;
  /** USD per live session; unset means no limit. */
  liveBudget?: number;
  /** low: the model writes the section once and a voice reads it (low-compute mode). */
  liveMode: "live" | "low";
  /** The image model the teacher may draw with (decision 0002 item 3); unset means no image tool. */
  image?: ModelChoice;
  /** How the tutor looks in a live session (decision 0002 item 13). */
  look: TutorLook;
  /** Opt-in: start with the computer, hidden in the tray, to show goal reminders (decision 0002 item 23). */
  tray: boolean;
  onboarded: boolean;
}

export type TutorLook = "orb" | "face" | "character";

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
  liveMode: "live",
  look: "orb",
  tray: false,
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
  /** Store scoped to the current learner; everything learner-owned goes here. */
  platform: Platform;
  /** The unscoped store: the learner list, and erase-all. */
  root: KvStore;
  learners: Learners;
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

/** The learners on this computer (T-27, decision 0002 item 21), kept at the store root. */
export interface Learners {
  list: { id: string; name: string }[];
  current: string;
}

const FIRST_LEARNER = "main";

export async function loadLearners(root: KvStore): Promise<Learners> {
  const l = await root.get<Learners>(K.profiles);
  if (l?.list.length) return l.list.some((p) => p.id === l.current) ? l : { ...l, current: l.list[0]!.id };
  return { list: [{ id: FIRST_LEARNER, name: "" }], current: FIRST_LEARNER };
}

/** Switches to another learner; the app reloads so every screen reads that learner's data. */
export async function switchLearner(id: string): Promise<void> {
  const { root, learners } = services();
  await root.set<Learners>(K.profiles, { ...learners, current: id });
  location.reload();
}

export async function saveLearners(l: Learners): Promise<void> {
  const s = services();
  s.learners = l;
  await s.root.set<Learners>(K.profiles, l);
  useStore.setState((st) => ({ kbVersion: st.kbVersion + 1 }));
}

/**
 * Adds a learner. They start with this learner's models and look but their own
 * empty data, and get the welcome screen on first open.
 */
export async function addLearner(name: string): Promise<string> {
  const s = services();
  const id = Math.random().toString(36).slice(2, 10);
  const { teacher, grader, embedder, local, favorites, custom, baseURLs, prices, uiLang, theme, textSize, look, image } = useStore.getState().settings;
  const copy: Settings = { ...DEFAULT_SETTINGS, teacher, grader, embedder, local, favorites, custom, baseURLs, prices, uiLang, theme, textSize, look, image, onboarded: false };
  await s.root.set(profilePrefix(id) + K.settings, copy);
  await saveLearners({ ...s.learners, list: [...s.learners.list, { id, name }] });
  return id;
}

/** Deletes another learner and everything stored under them. The first learner cannot be deleted, only erased. */
export async function deleteLearner(id: string): Promise<void> {
  const s = services();
  if (id === s.learners.list[0]?.id || id === s.learners.current) throw new Error("cannot delete this learner");
  for (const k of await s.root.keys(profilePrefix(id))) await s.root.delete(k);
  await saveLearners({ ...s.learners, list: s.learners.list.filter((p) => p.id !== id) });
}

export async function boot(createPlatform: () => Promise<Platform>, createLabs: () => LabRegistry): Promise<void> {
  const base = await createPlatform();
  const root = base.store;
  const learners = await loadLearners(root);
  const isFirst = learners.current === learners.list[0]!.id;
  const platform: Platform = { ...base, store: profileStore(root, learners.current, isFirst) };
  const course = new Course(platform.store);
  const stored = await platform.store.get<StoredKb>(K.kb);
  svc = { platform, root, learners, course, labs: createLabs(), kb: stored ? KnowledgeBase.from(stored.snapshot) : new KnowledgeBase(), kbEmbedder: stored?.embedder };
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
