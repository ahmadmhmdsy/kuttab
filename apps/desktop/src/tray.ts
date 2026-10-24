// Goal reminders and the opt-in tray (T-27, decision 0002 items 20 and 23).
// Reminders always show as a banner when the app opens. With the tray on, the
// OS starts Kuttab hidden at sign-in and a system notification carries them.
import { invoke } from "@tauri-apps/api/core";
import { dayKey, dueReminders, type Reminder } from "@kuttab/engine";
import { isTauri } from "./platform/index.ts";
import { translate } from "./i18n.ts";
import { services, useStore } from "./state.ts";

/** Turns the tray and start-at-sign-in on or off. Outside the desktop app there is no tray. */
export async function setTray(on: boolean): Promise<void> {
  if (isTauri) await invoke("tray_set", { enabled: on });
}

/** Goals to remind about now, for the current learner. */
export async function goalReminders(): Promise<Reminder[]> {
  const { course } = services();
  const goals = await course.goals();
  const items = await Promise.all(
    goals.map(async (goal) => {
      const plan = await course.plan(goal.planId);
      return plan ? { goal, plan, mastery: await course.mastery(plan.id) } : undefined;
    }),
  );
  return dueReminders(items.filter((i) => !!i));
}

/** Marks reminders as shown today, so each goal reminds at most once a day. */
export async function markReminded(rs: Reminder[]): Promise<void> {
  const { course } = services();
  const today = dayKey();
  await Promise.all(rs.map((r) => course.saveGoal({ ...r.goal, remindedOn: today })));
}

/** One line per reminder, for the banner and the notification. */
export function reminderText(r: Reminder, lang = useStore.getState().settings.uiLang): string {
  const key = r.pace.status === "overdue" ? "reminderOverdue" : r.pace.status === "behind" ? "reminderBehind" : "reminderOnTrack";
  return translate(lang, key, { title: r.plan.title, days: r.pace.daysLeft, left: r.pace.left, perWeek: r.pace.perWeek });
}

/**
 * When the OS started Kuttab hidden in the tray, reminders go out as a system
 * notification and are marked shown. Otherwise the Library banner shows them.
 */
export async function trayStartup(): Promise<void> {
  if (!isTauri || !(await invoke<boolean>("tray_started_hidden"))) return;
  const rs = await goalReminders();
  if (!rs.length) return;
  const lang = useStore.getState().settings.uiLang;
  await invoke("notify", { title: translate(lang, "reminders"), body: rs.map((r) => reminderText(r, lang)).join("\n") });
  await markReminded(rs);
}
