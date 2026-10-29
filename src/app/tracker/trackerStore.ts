import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import {
  type CaseCtx, type DocRequest, type MailMsg, type MailDir, type ReqFile, type Tone,
  APPROVAL_THRESHOLD, METHODS, ESC, addDays, iso, today, fmtDate, isOver, ownerEmail,
  letterOf, reminderText, escalationText, approvalRequestText, subjectOf, sentStatus, reminderCount,
} from "./trackerData";

// ── Document requests and case mail, per case ────────────────────────────────
// Kept in this browser (localStorage), like the other case stores, so they
// survive leaving the case or a refresh. Email is not connected: messages here
// are records of what the firm sent or noted, and nothing is delivered.

interface CaseState { requests: DocRequest[]; mail: MailMsg[]; seq: number; mseq: number; refreshedAt?: string }
const STORAGE_KEY = "leco.docTracker.v1";
const EMPTY: CaseState = { requests: [], mail: [], seq: 0, mseq: 0 };

function load(): Record<string, CaseState> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
let db: Record<string, CaseState> = typeof window === "undefined" ? {} : load();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function save() {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); } catch { /* storage unavailable — kept for this session */ }
}
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
const get = (caseId: string) => db[caseId] ?? EMPTY;

export function useTracker(caseId: string): CaseState {
  return useSyncExternalStore(subscribe, () => get(caseId), () => EMPTY);
}

/** Applies a change; the toast offers Undo when a message is given. */
function mutate(caseId: string, fn: (s: CaseState) => void, undoMsg?: string) {
  const prev = get(caseId);
  const draft: CaseState = structuredClone(prev);
  fn(draft);
  db = { ...db, [caseId]: draft };
  save();
  emit();
  if (undoMsg) toast(undoMsg, { action: { label: "Undo", onClick: () => { db = { ...db, [caseId]: prev }; save(); emit(); } } });
}

/** Re-reads what this browser has stored. There is no email or vendor feed. */
export function refreshLocal(caseId: string) {
  db = load();
  const s = get(caseId);
  db = { ...db, [caseId]: { ...s, refreshedAt: new Date().toISOString() } };
  save();
  emit();
}

// ── Helpers on a draft ──
const now = () => new Date().toISOString();
const log = (r: DocRequest, text: string) => r.log.push({ at: now(), text });
const find = (s: CaseState, id: string) => s.requests.find((r) => r.id === id)!;

function addMail(s: CaseState, ctx: CaseCtx, r: DocRequest | null, dir: MailDir, kind: string, body: string, opt: Partial<MailMsg> = {}): MailMsg {
  const us = r ? { n: r.owner, e: ownerEmail(r.owner) } : { n: "Jennifer Davis", e: ownerEmail("Jennifer Davis") };
  const them = r ? { n: r.to, e: "" } : { n: "", e: "" };
  const m: MailMsg = {
    id: "M" + String(++s.mseq).padStart(3, "0"),
    rid: r?.id ?? null,
    dir, kind,
    fromN: dir === "in" ? them.n : us.n, fromE: dir === "in" ? them.e : us.e,
    toN: dir === "in" ? us.n : them.n, toE: dir === "in" ? us.e : them.e,
    at: now(),
    subject: r ? (dir === "in" ? "Re: " : "") + subjectOf(r, ctx) : "",
    body, att: [], unread: dir === "in", replied: false,
    ...opt,
  };
  s.mail.push(m);
  return m;
}

function goOut(s: CaseState, ctx: CaseCtx, r: DocRequest) {
  r.status = sentStatus(r.method);
  r.sent = iso(today());
  r.due = r.due ?? iso(addDays(today(), METHODS[r.method] ?? 14));
  s.mail = s.mail.filter((m) => !(m.rid === r.id && m.dir === "draft"));
  addMail(s, ctx, r, "out", "Request", letterOf(r, ctx));
}

// ── Actions ──
export interface NewRequestInput {
  cat: string; type: string; to: string; docs: string[]; range: string;
  method: string; channel: string; owner: string; cost: number; auto: boolean;
}

export function createRequest(ctx: CaseCtx, input: NewRequestInput, mode: "draft" | "send"): string {
  let id = "";
  mutate(ctx.caseId, (s) => {
    id = "R" + String(++s.seq).padStart(2, "0");
    const needsApproval = input.cost > APPROVAL_THRESHOLD;
    const r: DocRequest = {
      id, ...input, contact: "", pages: 0, files: [], reviewed: false, log: [], createdAt: now(),
      status: mode === "draft" ? "Draft" : needsApproval ? "Awaiting approval" : "Sent",
      due: iso(addDays(today(), METHODS[input.method] ?? 14)),
    };
    s.requests.push(r);
    if (mode === "draft") {
      log(r, "Saved as draft");
      addMail(s, ctx, r, "draft", "Draft", letterOf(r, ctx));
    } else if (needsApproval) {
      log(r, `Carrier approval requested (${fmtMoney(r.cost)} is over the ${fmtMoney(APPROVAL_THRESHOLD)} threshold)`);
      addMail(s, ctx, r, "out", "Approval request", approvalRequestText(r), { toN: ctx.insurer ? `${ctx.insurer} (claims)` : "Carrier claims contact", toE: "" });
    } else {
      log(r, `Sent by ${r.channel.toLowerCase()}`);
      goOut(s, ctx, r);
    }
  });
  return id;
}
const fmtMoney = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

export function sendDraft(ctx: CaseCtx, id: string) {
  mutate(ctx.caseId, (s) => {
    const r = find(s, id);
    if (r.cost > APPROVAL_THRESHOLD) {
      r.status = "Awaiting approval";
      log(r, "Carrier approval requested");
      s.mail = s.mail.filter((m) => !(m.rid === r.id && m.dir === "draft"));
      addMail(s, ctx, r, "out", "Approval request", approvalRequestText(r), { toN: ctx.insurer ? `${ctx.insurer} (claims)` : "Carrier claims contact", toE: "" });
      return;
    }
    log(r, `Sent by ${r.channel.toLowerCase()}`);
    goOut(s, ctx, r);
  }, "Request recorded as sent");
}

export function recordApproval(ctx: CaseCtx, id: string) {
  mutate(ctx.caseId, (s) => {
    const r = find(s, id);
    log(r, "Carrier approval recorded");
    addMail(s, ctx, r, "in", "Approval", `Carrier approval for ${r.to} (${fmtMoney(r.cost)}), recorded by ${r.owner}.`, {
      fromN: ctx.insurer ? `${ctx.insurer} (claims)` : "Carrier claims contact", fromE: "", unread: false,
    });
    log(r, `Sent by ${r.channel.toLowerCase()}`);
    goOut(s, ctx, r);
  }, "Approval recorded and request sent");
}

export function sendReminder(ctx: CaseCtx, id: string, channel: string, tone: Tone, text: string, when: "now" | "later") {
  mutate(ctx.caseId, (s) => {
    const r = find(s, id);
    if (when === "later") {
      const at = addDays(today(), 1);
      log(r, `Reminder scheduled for ${fmtDate(iso(at))}, 9:00 AM (${tone.toLowerCase()})`);
      r.next = iso(at);
      return;
    }
    log(r, `Reminder sent by ${channel.toLowerCase()} (${tone.toLowerCase()})`);
    addMail(s, ctx, r, "out", "Reminder", text || reminderText(r, tone, ctx));
    r.next = iso(addDays(today(), 7));
  }, when === "later" ? "Reminder scheduled for tomorrow, 9:00 AM" : "Reminder recorded");
}

export function remindMany(ctx: CaseCtx, ids: string[]) {
  mutate(ctx.caseId, (s) => {
    ids.forEach((id) => {
      const r = find(s, id);
      const tone: Tone = isOver(r) ? (reminderCount(r) >= 2 ? "Final notice" : "Firm") : "Friendly";
      log(r, `Reminder sent by ${r.channel.toLowerCase()} (${tone.toLowerCase()})`);
      addMail(s, ctx, r, "out", "Reminder", reminderText(r, tone, ctx));
      r.next = iso(addDays(today(), 7));
    });
  }, `${ids.length} reminder${ids.length === 1 ? "" : "s"} recorded`);
}

export function escalate(ctx: CaseCtx, id: string) {
  mutate(ctx.caseId, (s) => {
    const r = find(s, id);
    r.status = "Escalated";
    log(r, `Escalated: ${(ESC[r.method] ?? "escalate").toLowerCase()}, drafted for attorney review`);
    addMail(s, ctx, r, "out", "Escalation", escalationText(r));
  }, "Escalation drafted for attorney review");
}

export function markAcknowledged(ctx: CaseCtx, id: string) {
  mutate(ctx.caseId, (s) => { const r = find(s, id); r.status = "Acknowledged"; log(r, "Recipient acknowledged the request"); }, "Marked acknowledged");
}

export function markReceived(ctx: CaseCtx, id: string, pages: number, files: ReqFile[], none: boolean) {
  mutate(ctx.caseId, (s) => {
    const r = find(s, id);
    if (none) {
      r.status = "No records";
      log(r, "Recipient certified that no records exist");
      return;
    }
    r.status = "Received";
    r.pages = pages;
    r.files = [...r.files, ...files];
    log(r, `Records received: ${pages} page${pages === 1 ? "" : "s"}${files.length ? `, ${files.length} file${files.length === 1 ? "" : "s"} attached` : ""}`);
  }, none ? "Marked no records" : "Marked received");
}

export function markReviewed(ctx: CaseCtx, id: string) {
  mutate(ctx.caseId, (s) => { const r = find(s, id); r.reviewed = true; log(r, "Reviewed"); }, "Marked reviewed");
}

export function reassign(ctx: CaseCtx, ids: string[], owner: string) {
  mutate(ctx.caseId, (s) => ids.forEach((id) => { const r = find(s, id); r.owner = owner; log(r, `Reassigned to ${owner}`); }),
    ids.length === 1 ? `Assigned to ${owner}` : `${ids.length} requests assigned to ${owner}`);
}

export function extendDue(ctx: CaseCtx, id: string, days: number) {
  mutate(ctx.caseId, (s) => {
    const r = find(s, id);
    const nd = iso(addDays(r.due ? new Date(r.due) : today(), days));
    r.due = nd;
    log(r, `Due date extended to ${fmtDate(nd)}`);
  }, "Due date extended");
}

export function snooze(ctx: CaseCtx, id: string, days: number) {
  mutate(ctx.caseId, (s) => { const r = find(s, id); const nd = iso(addDays(today(), days)); r.next = nd; log(r, `Follow-up snoozed until ${fmtDate(nd)}`); }, "Follow-up snoozed");
}

export function setAuto(ctx: CaseCtx, id: string, on: boolean) {
  mutate(ctx.caseId, (s) => { const r = find(s, id); r.auto = on; log(r, `Automatic reminders turned ${on ? "on" : "off"}`); });
  toast(on ? "Automatic reminders on" : "Automatic reminders off");
}

export function markThreadRead(caseId: string, key: string) {
  const s = get(caseId);
  if (!s.mail.some((m) => (m.rid ?? m.id) === key && m.unread)) return;
  mutate(caseId, (d) => d.mail.forEach((m) => { if ((m.rid ?? m.id) === key) m.unread = false; }));
}

export function sendReply(ctx: CaseCtx, src: MailMsg, fwd: boolean, to: { n: string; e: string }, subject: string, body: string) {
  mutate(ctx.caseId, (s) => {
    const r = src.rid ? s.requests.find((x) => x.id === src.rid) ?? null : null;
    const us = r ? { n: r.owner, e: ownerEmail(r.owner) } : { n: "Jennifer Davis", e: ownerEmail("Jennifer Davis") };
    addMail(s, ctx, r, "out", fwd ? "Forward" : "Reply", body, { fromN: us.n, fromE: us.e, toN: to.n, toE: to.e, subject, unread: false });
    if (!fwd) { const o = s.mail.find((m) => m.id === src.id); if (o) o.replied = true; }
    if (r) log(r, `${fwd ? "Forwarded to" : "Reply recorded to"} ${to.n || to.e}`);
  }, fwd ? "Forward recorded" : "Reply recorded");
}
