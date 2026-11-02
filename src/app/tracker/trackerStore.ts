import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import {
  type CaseCtx, type DocRequest, type MailMsg, type MailDir, type ReqFile, type Tone,
  APPROVAL_THRESHOLD, METHODS, addDays, iso, today, fmtDate, fmtTime, isOver, isDone, ownerEmail,
  letterOf, reminderText, approvalRequestText, subjectOf, sentStatus, reminderCount,
} from "./trackerData";

// ── Document requests and case mail, per case ────────────────────────────────
// Kept in this browser (localStorage), like the other case stores, so they
// survive leaving the case or a refresh. Email is not connected: messages here
// are records of what the firm sent or noted, and nothing is delivered.

export interface CaseState { requests: DocRequest[]; mail: MailMsg[]; seq: number; mseq: number; refreshedAt?: string; seeded?: boolean; demoVersion?: number }
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
  r.sent = now();
  r.due = r.due ?? iso(addDays(today(), METHODS[r.method] ?? 14));
  s.mail = s.mail.filter((m) => !(m.rid === r.id && m.dir === "draft"));
  addMail(s, ctx, r, "out", "Request", letterOf(r, ctx));
}

/// ── Actions ──
export interface NewRequestInput {
  cat: string; type: string; to: string; docs: string[]; range: string;
  method: string; channel: string; owner: string; cost: number; auto: boolean;
  priority?: DocRequest["priority"]; notes?: string; title?: string;
  /** ISO date; defaults to the method's usual response time. */
  due?: string;
}

export function createRequest(ctx: CaseCtx, input: NewRequestInput, mode: "draft" | "send"): string {
  let id = "";
  mutate(ctx.caseId, (s) => {
    id = "R" + String(++s.seq).padStart(2, "0");
    const needsApproval = input.cost > APPROVAL_THRESHOLD;
    const r: DocRequest = {
      id, ...input, contact: "", pages: 0, files: [], reviewed: false, log: [], createdAt: now(),
      status: mode === "draft" ? "Draft" : needsApproval ? "Awaiting approval" : "Sent",
      due: input.due || iso(addDays(today(), METHODS[input.method] ?? 14)),
    };
    s.requests.push(r);
    if (mode === "draft") {
      log(r, "Saved as draft");
      addMail(s, ctx, r, "draft", "Draft", letterOf(r, ctx));
    } else if (needsApproval) {
      log(r, `Carrier approval requested (${fmtMoney(r.cost)} is over the ${fmtMoney(APPROVAL_THRESHOLD)} threshold)`);
      addMail(s, ctx, r, "out", "Approval request", approvalRequestText(r), { toN: ctx.insurer ? `${ctx.insurer} (claims)` : "Carrier claims contact", toE: "" });
    } else {
      log(r, "Request created");
      log(r, `Request sent by ${r.channel.toLowerCase()}`);
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
    log(r, `Request sent by ${r.channel.toLowerCase()}`);
    goOut(s, ctx, r);
  }, "Request sent successfully.");
}

/** Saves edits to a draft; its letter in Drafts is rewritten to match. */
export function updateDraft(ctx: CaseCtx, id: string, patch: Partial<Pick<DocRequest, "title" | "to" | "docs" | "range" | "due" | "priority" | "notes">>) {
  mutate(ctx.caseId, (s) => {
    const r = find(s, id);
    Object.assign(r, patch);
    log(r, "Draft edited");
    s.mail.forEach((m) => { if (m.rid === r.id && m.dir === "draft") { m.toN = r.to; m.subject = subjectOf(r, ctx); m.body = letterOf(r, ctx); m.at = now(); } });
  }, "Changes saved.");
}

export function deleteDraft(ctx: CaseCtx, id: string) {
  mutate(ctx.caseId, (s) => {
    s.requests = s.requests.filter((r) => r.id !== id);
    s.mail = s.mail.filter((m) => m.rid !== id);
  }, "Draft deleted.");
}

export function recordApproval(ctx: CaseCtx, id: string) {
  mutate(ctx.caseId, (s) => {
    const r = find(s, id);
    log(r, "Carrier approval recorded");
    addMail(s, ctx, r, "in", "Approval", `Carrier approval for ${r.to} (${fmtMoney(r.cost)}), recorded by ${r.owner}.`, {
      fromN: ctx.insurer ? `${ctx.insurer} (claims)` : "Carrier claims contact", fromE: "", unread: false,
    });
    log(r, `Request sent by ${r.channel.toLowerCase()}`);
    goOut(s, ctx, r);
  }, "Approval recorded and request sent");
}

/** Records a reminder in the request's thread. Email isn't connected, so nothing is delivered. */
export function sendReminder(ctx: CaseCtx, id: string, text: string) {
  mutate(ctx.caseId, (s) => {
    const r = find(s, id);
    log(r, `Reminder sent to ${r.to}`);
    addMail(s, ctx, r, "out", "Reminder", text, { subject: `Follow-up: ${subjectOf(r, ctx)}`, unread: false });
    r.next = iso(addDays(today(), 7));
  }, "Reminder sent successfully.");
}

export function remindMany(ctx: CaseCtx, ids: string[]) {
  mutate(ctx.caseId, (s) => {
    ids.forEach((id) => {
      const r = find(s, id);
      const tone: Tone = isOver(r) ? (reminderCount(r) >= 2 ? "Final notice" : "Firm") : "Friendly";
      log(r, `Reminder sent to ${r.to}`);
      addMail(s, ctx, r, "out", "Reminder", reminderText(r, tone, ctx), { subject: `Follow-up: ${subjectOf(r, ctx)}`, unread: false });
      r.next = iso(addDays(today(), 7));
    });
  }, `${ids.length} reminder${ids.length === 1 ? "" : "s"} sent`);
}

export function markAcknowledged(ctx: CaseCtx, id: string) {
  mutate(ctx.caseId, (s) => {
    const r = find(s, id);
    r.status = "Acknowledged";
    log(r, "Marked acknowledged");
    // The recipient's own confirmation, when it's in the mailbox, is the record; otherwise note it.
    if (!s.mail.some((m) => m.rid === r.id && m.kind === "Acknowledgment"))
      addMail(s, ctx, r, "in", "Acknowledgment", `Recorded by ${r.owner}: ${r.to} acknowledged this request. Email isn't connected, so this is a note of the acknowledgment, not the message itself.`, { unread: false });
  }, "Request marked acknowledged.");
}

function receive(s: CaseState, ctx: CaseCtx, r: DocRequest, files: ReqFile[]) {
  r.status = "Received";
  r.received = now();
  r.files = [...r.files, ...files];
  log(r, `Documents received${files.length ? `: ${files.length} file${files.length === 1 ? "" : "s"} attached` : ""}`);
  addMail(s, ctx, r, "in", "Response", `Recorded by ${r.owner}: documents received from ${r.to}. Email isn't connected, so this is a note of the receipt, not the message itself.`,
    { unread: false, att: files.map((f) => ({ name: f.name, pages: f.pages })) });
}

export function markReceived(ctx: CaseCtx, id: string) {
  mutate(ctx.caseId, (s) => receive(s, ctx, find(s, id), []), "Documents marked as received.");
}

/** Attaches files; a request still waiting on them becomes Received. */
export function addDocuments(ctx: CaseCtx, id: string, files: ReqFile[]) {
  const open = !isDone(find(get(ctx.caseId), id));
  mutate(ctx.caseId, (s) => {
    const r = find(s, id);
    if (open) return receive(s, ctx, r, files);
    r.files = [...r.files, ...files];
    log(r, `${files.length} document${files.length === 1 ? "" : "s"} uploaded`);
  }, open ? "Documents uploaded and marked as received." : `${files.length} document${files.length === 1 ? "" : "s"} uploaded.`);
}

export function markReviewed(ctx: CaseCtx, id: string) {
  mutate(ctx.caseId, (s) => { const r = find(s, id); r.reviewed = true; r.reviewedAt = now(); log(r, "Reviewed"); }, "Documents marked as reviewed.");
}

export function reassign(ctx: CaseCtx, ids: string[], owner: string) {
  mutate(ctx.caseId, (s) => ids.forEach((id) => { const r = find(s, id); r.owner = owner; log(r, `Reassigned to ${owner}`); }),
    ids.length === 1 ? "Request reassigned successfully." : `${ids.length} requests assigned to ${owner}`);
}

/** Sets a new due date (ISO). */
export function setDue(ctx: CaseCtx, id: string, due: string) {
  mutate(ctx.caseId, (s) => { const r = find(s, id); r.due = due; log(r, `Due date changed to ${fmtDate(due)}`); }, "Due date updated successfully.");
}

/** Schedules the next follow-up (ISO date and time); the due date stays the same. */
export function scheduleFollowUp(ctx: CaseCtx, id: string, at: string) {
  mutate(ctx.caseId, (s) => { const r = find(s, id); r.next = at; log(r, `Follow-up reminder scheduled for ${fmtDate(at)}, ${fmtTime(at)}`); }, "Follow-up reminder scheduled.");
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

/** Loads sample requests and correspondence for a demo case: once into an
 *  empty tracker, or in place of an older sample set. Records the user made
 *  themselves are never replaced. */
export function ensureDemo(ctx: CaseCtx, build: (ctx: CaseCtx) => (CaseState & { demoVersion: number }) | undefined) {
  const cur = db[ctx.caseId];
  const seed = build(ctx);
  if (!seed) return;
  if (cur && (cur.seeded || cur.requests.length || cur.mail.length)) {
    if (!cur.seeded || cur.demoVersion === seed.demoVersion) return;
    const own = cur.requests.filter((r) => !r.demo), ownMail = cur.mail.filter((m) => !m.demo);
    db = { ...db, [ctx.caseId]: { ...cur, requests: [...seed.requests, ...own], mail: [...seed.mail, ...ownMail], seq: Math.max(cur.seq, seed.seq), mseq: Math.max(cur.mseq, seed.mseq), demoVersion: seed.demoVersion } };
  } else {
    db = { ...db, [ctx.caseId]: { ...seed, seeded: true } };
  }
  save();
  emit();
}
