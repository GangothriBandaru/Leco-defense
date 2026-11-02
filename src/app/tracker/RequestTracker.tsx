import { useEffect, useMemo, useState } from "react";
import {
  Clock, Bell, Inbox, Search, X, Check, Send, CheckCheck, FileText, Download, Upload, Plus, Loader2, Pencil, Trash2, Eye, AlarmClock, Hourglass,
} from "lucide-react";
import {
  type CaseCtx, type DocRequest, type MailMsg, type ListFilter, type ReqFile,
  CATEGORIES, FILTERS, FOCUS_LABEL, BUCKETS, STAGES, OWNERS, TYPICAL, APPROVAL_THRESHOLD,
  inFilter, bucket, urgency, isOver, isDone, daysTo, stageIx, nextReminder, reminderText, titleOf, taxOf,
  fmtDate, fmtShort, fmtTime, money, addDays, today,
} from "./trackerData";
import {
  sendDraft, recordApproval, sendReminder, remindMany, markAcknowledged, markReceived, markReviewed,
  reassign, setDue, scheduleFollowUp, setAuto, updateDraft, deleteDraft, addDocuments,
} from "./trackerStore";
import { CatIcon, StatusPill, DueChip, Avatar, Thread, Tag, NotConnected, Collapse, Modal, FilePreview } from "./TrackerShared";
import { fileBlob, saveBlob } from "./trackerFiles";
import { putMediaFile } from "../intake/mediaFileStore";
import { toast } from "sonner";

const btn = "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-line bg-white text-xs font-semibold text-deep hover:bg-wash transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
const btnP = "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-brand hover:bg-deep text-white text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
const btnD = "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-semibold transition-colors";
const input = "w-full bg-white border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-[#8A98A3] focus:outline-none focus:border-brand";
const PRIORITY_TONE: Record<string, string> = { High: "crit", Normal: "", Medium: "", Low: "" };
const METRIC_TONE = { crit: "bg-[#FEF3F2] text-[#B42318]", warn: "bg-[#FFF7ED] text-[#B45309]", acc: "bg-tint text-deep", "": "bg-[#F1F5F7] text-[#5B6B78]" };
const chip =(on: boolean) => `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${on ? "border-brand bg-tint text-deep" : "border-line bg-white text-ink hover:border-[#CBD7DE]"}`;

/** yyyy-mm-dd for a date input, in local time. */
const dayInput = (s?: string) => { if (!s) return ""; const d = new Date(s); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const fromInput = (day: string, time = "00:00") => { const [y, m, d] = day.split("-").map(Number), [h, mi] = time.split(":").map(Number); return new Date(y, m - 1, d, h || 0, mi || 0).toISOString(); };
const slug = (t: string) => t.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");

type NextAction = "send" | "approve" | "remind" | "review" | "received" | "ack";
function nextStep(r: DocRequest, confirmedAt?: string): { title: string; text: string; actions: [NextAction, string][]; tone: string } {
  const n = daysTo(r) ?? 0;
  if (r.status === "Draft") return { title: "Ready to send", text: "Check the details, then send the request to the recipient.", actions: [["send", "Send request"]], tone: "" };
  if (r.status === "Awaiting approval") return { title: "Waiting for carrier approval", text: `${money(r.cost)} is over the ${money(APPROVAL_THRESHOLD)} pre-approval threshold. Record the carrier's approval to send it.`, actions: [["approve", "Record approval"]], tone: "warn" };
  if (isOver(r)) return { title: `No response, ${-n} day${n === -1 ? "" : "s"} past due`, text: `The documents were due ${fmtDate(r.due)}. Send a reminder to ${r.to}.`, actions: [["remind", "Send reminder"], ["received", "Mark as received"]], tone: "crit" };
  if (r.status === "Received" && !r.reviewed) return { title: "Documents received", text: `Received${r.received ? ` ${fmtDate(r.received)}` : ""}. Review the documents, then mark the request reviewed.`, actions: [["review", "Mark as reviewed"]], tone: "acc" };
  if (isDone(r)) return { title: "Complete", text: `Documents received${r.received ? ` ${fmtDate(r.received)}` : ""} and reviewed${r.reviewedAt ? ` ${fmtDate(r.reviewedAt)}` : ""}.`, actions: [], tone: "ok" };
  const due = r.due ? `${n === 0 ? "Due today" : `Due in ${n} day${n === 1 ? "" : "s"}`} (${fmtDate(r.due)}).` : "";
  const follow = r.next ? ` Next follow-up: ${fmtDate(r.next)}, ${fmtTime(r.next)}.` : "";
  const acked = ["Acknowledged", "In progress", "Partially received"].includes(r.status);
  if (acked) return { title: "Acknowledged, waiting for the documents", text: `${due}${follow}`, actions: [["remind", "Send reminder"], ["received", "Mark as received"]], tone: "" };
  if (confirmedAt) return { title: "Recipient confirmed receipt", text: `${r.to} confirmed the request on ${fmtDate(confirmedAt)}. Mark it acknowledged to move it forward. ${due}${follow}`, actions: [["ack", "Mark acknowledged"], ["remind", "Send reminder"], ["received", "Mark as received"]], tone: "acc" };
  return { title: "Waiting for a response", text: `${due}${follow}`, actions: [["remind", "Send reminder"], ["ack", "Mark acknowledged"], ["received", "Mark as received"]], tone: "" };
}
const NEXT_BG: Record<string, string> = { crit: "bg-[#FEF2F2] border-[#FBD5D5]", warn: "bg-[#FFF7ED] border-[#FDE6C8]", acc: "bg-tint border-[#CDEBF5]", ok: "bg-[#ECFDF3] border-[#D1FADF]", "": "bg-wash border-line" };

function Stepper({ r }: { r: DocRequest }) {
  const ix = stageIx(r), over = isOver(r), done = isDone(r);
  const dates = [
    r.createdAt, r.sent, r.log.find((l) => /acknowledged/i.test(l.text))?.at,
    r.received ?? r.log.find((l) => /^(Documents|Records) received/i.test(l.text))?.at,
    r.reviewedAt ?? r.log.find((l) => l.text === "Reviewed")?.at,
  ];
  return (
    <ol className="grid grid-cols-5" aria-label="Request progress">
      {STAGES.map((s, i) => {
        const complete = i < ix || (done && i === ix), cur = i === ix && !complete;
        return (
          <li key={s} aria-current={cur ? "step" : undefined} className="relative flex flex-col items-center text-center gap-1 min-w-0">
            {i > 0 && <span className={`absolute top-[10px] right-1/2 w-full h-[2px] ${i <= ix ? "bg-brand" : "bg-line"}`} />}
            <span className={`relative z-[1] w-[22px] h-[22px] rounded-full border-2 inline-flex items-center justify-center ${complete ? "bg-brand border-brand text-white" : cur ? (over ? "border-[#B91C1C] bg-[#FEF2F2]" : "border-brand bg-white ring-4 ring-tint") : "border-line bg-white"}`}>
              {complete && <Check className="w-3 h-3" strokeWidth={3} />}
            </span>
            <span className="text-[11px] font-semibold text-ink">{s}</span>
            <span className={`text-[10.5px] ${cur && over ? "text-[#B91C1C] font-semibold" : "text-[#8A98A3]"}`}>{cur && over ? `${-(daysTo(r) ?? 0)}d overdue` : dates[i] && i <= ix ? fmtShort(dates[i]) : " "}</span>
          </li>
        );
      })}
    </ol>
  );
}

function OpenTime({ r }: { r: DocRequest }) {
  if (!r.sent || isDone(r)) return null;
  const open = Math.max(0, Math.round((+today() - +new Date(r.sent)) / 86400000)), typ = TYPICAL[r.method] ?? 10;
  const scale = Math.max(open, typ * 1.6), slow = open > typ;
  return (
    <div className="mt-2.5 space-y-1">
      <div className="relative h-1.5 rounded-full bg-black/10 max-w-[320px]">
        <span className={`absolute inset-y-0 left-0 rounded-full ${slow ? "bg-[#B91C1C]" : "bg-brand"}`} style={{ width: `${(open / scale) * 100}%` }} />
        <span className="absolute -top-1 -bottom-1 w-0.5 bg-ink rounded" style={{ left: `${(typ / scale) * 100}%` }} title="Typical response time" />
      </div>
      <p className="text-xs text-[#5B6B78]">Open <b className={slow ? "text-[#B91C1C]" : "text-ink"}>{open} day{open === 1 ? "" : "s"}</b>. A typical {r.method.toLowerCase()} gets a response in about {typ} days.</p>
    </div>
  );
}

type Dialog = "" | "owner" | "due" | "snooze" | "remind" | "delete" | "edit" | "upload";

function ReassignDialog({ ctx, r, onClose }: { ctx: CaseCtx; r: DocRequest; onClose: () => void }) {
  const [owner, setOwner] = useState(r.owner);
  return (
    <Modal title="Reassign request" onClose={onClose} footer={<>
      <button type="button" className={btn} onClick={onClose}>Cancel</button>
      <button type="button" className={btnP} disabled={owner === r.owner} onClick={() => { reassign(ctx, [r.id], owner); onClose(); }}>Reassign</button>
    </>}>
      <p className="text-sm text-[#5B6B78]">Choose who handles <b className="text-ink">{titleOf(r)}</b>.</p>
      <div role="radiogroup" aria-label="Team member" className="space-y-1.5">
        {OWNERS.map((o) => (
          <label key={o.n} className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 cursor-pointer text-sm ${owner === o.n ? "border-brand bg-tint" : "border-line hover:bg-wash"}`}>
            <input type="radio" name="owner" checked={owner === o.n} onChange={() => setOwner(o.n)} className="accent-[#3FB5D7]" />
            <Avatar name={o.n} /><span className="flex-1 text-ink">{o.n}</span>{o.n === r.owner && <span className="text-xs text-[#5B6B78]">Current</span>}
          </label>
        ))}
      </div>
    </Modal>
  );
}

function DueDialog({ ctx, r, onClose }: { ctx: CaseCtx; r: DocRequest; onClose: () => void }) {
  const [day, setDay] = useState(dayInput(r.due ?? addDays(today(), 7).toISOString()));
  const min = dayInput(today().toISOString());
  const ok = !!day && day >= min && day !== dayInput(r.due);
  return (
    <Modal title="Extend due date" onClose={onClose} footer={<>
      <button type="button" className={btn} onClick={onClose}>Cancel</button>
      <button type="button" className={btnP} disabled={!ok} onClick={() => { setDue(ctx, r.id, fromInput(day)); onClose(); }}>Save due date</button>
    </>}>
      <p className="text-sm text-[#5B6B78]">Current due date: <b className="text-ink">{r.due ? fmtDate(r.due) : "Not set"}</b></p>
      <label className="block"><span className="eyebrow block mb-1">New due date</span>
        <input type="date" className={input} value={day} min={min} onChange={(e) => setDay(e.target.value)} />
      </label>
    </Modal>
  );
}

function SnoozeDialog({ ctx, r, onClose }: { ctx: CaseCtx; r: DocRequest; onClose: () => void }) {
  const [day, setDay] = useState(dayInput(addDays(today(), 1).toISOString()));
  const [time, setTime] = useState("09:00");
  const min = dayInput(today().toISOString());
  return (
    <Modal title="Snooze follow-up" onClose={onClose} footer={<>
      <button type="button" className={btn} onClick={onClose}>Cancel</button>
      <button type="button" className={btnP} disabled={!day || day < min || !time} onClick={() => { scheduleFollowUp(ctx, r.id, fromInput(day, time)); onClose(); }}>Schedule reminder</button>
    </>}>
      <p className="text-sm text-[#5B6B78]">Pick when to follow up with {r.to}. The due date stays {r.due ? fmtDate(r.due) : "unset"}.</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className="eyebrow block mb-1">Date</span><input type="date" className={input} value={day} min={min} onChange={(e) => setDay(e.target.value)} /></label>
        <label className="block"><span className="eyebrow block mb-1">Time</span><input type="time" className={input} value={time} onChange={(e) => setTime(e.target.value)} /></label>
      </div>
    </Modal>
  );
}

function ReminderDialog({ ctx, r, onClose }: { ctx: CaseCtx; r: DocRequest; onClose: () => void }) {
  const [text, setText] = useState(reminderText(r, isOver(r) ? "Firm" : "Friendly", ctx));
  return (
    <Modal title="Send reminder" onClose={onClose} footer={<>
      <button type="button" className={btn} onClick={onClose}>Cancel</button>
      <button type="button" className={btnP} disabled={!text.trim()} onClick={() => { sendReminder(ctx, r.id, text.trim()); onClose(); }}><Send className="w-3.5 h-3.5" />Send reminder</button>
    </>}>
      <p className="text-sm text-ink">Send a reminder to <b>{r.to}</b>{r.contact ? <> at <span className="mono-ref">{r.contact}</span></> : null}?</p>
      <textarea rows={7} value={text} onChange={(e) => setText(e.target.value)} aria-label="Reminder message" className={input} />
      <NotConnected />
    </Modal>
  );
}

function DeleteDialog({ ctx, r, onClose }: { ctx: CaseCtx; r: DocRequest; onClose: () => void }) {
  return (
    <Modal title="Delete draft?" onClose={onClose} footer={<>
      <button type="button" className={btn} onClick={onClose}>Cancel</button>
      <button type="button" className={btnD} onClick={() => { deleteDraft(ctx, r.id); onClose(); }}><Trash2 className="w-3.5 h-3.5" />Delete draft</button>
    </>}>
      <p className="text-sm text-ink"><b>{titleOf(r)}</b> to {r.to} and its draft letter will be removed. This can't be undone after the notice closes.</p>
    </Modal>
  );
}

function EditDialog({ ctx, r, onClose }: { ctx: CaseCtx; r: DocRequest; onClose: () => void }) {
  const options = [...new Set([...r.docs, ...taxOf(r.cat)[2]])];
  const [f, setF] = useState({ title: r.title ?? "", to: r.to, docs: r.docs, other: "", range: r.range, due: dayInput(r.due), priority: r.priority === "Medium" ? "Normal" : r.priority ?? "Normal", notes: r.notes ?? "" });
  const [err, setErr] = useState("");
  const set = (p: Partial<typeof f>) => { setErr(""); setF((x) => ({ ...x, ...p })); };
  const save = () => {
    const docs = [...f.docs, ...(f.other.trim() ? [f.other.trim()] : [])];
    if (!f.to.trim()) return setErr("Add who the request is for.");
    if (!docs.length) return setErr("Pick at least one document.");
    updateDraft(ctx, r.id, { title: f.title.trim() || undefined, to: f.to.trim(), docs, range: f.range.trim() || r.range, due: f.due ? fromInput(f.due) : undefined, priority: f.priority as DocRequest["priority"], notes: f.notes.trim() || undefined });
    onClose();
  };
  return (
    <Modal title="Edit request" onClose={onClose} wide footer={<>
      <button type="button" className={btn} onClick={onClose}>Cancel</button>
      <button type="button" className={btnP} onClick={save}>Save changes</button>
    </>}>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block"><span className="eyebrow block mb-1">Request</span><input className={input} value={f.title} placeholder={r.type} onChange={(e) => set({ title: e.target.value })} /></label>
        <label className="block"><span className="eyebrow block mb-1">Recipient</span><input className={input} value={f.to} onChange={(e) => set({ to: e.target.value })} /></label>
      </div>
      <div><span className="eyebrow block mb-1.5">Documents requested</span>
        <div className="flex flex-wrap gap-1.5">
          {options.map((d) => { const on = f.docs.includes(d); return <button key={d} type="button" aria-pressed={on} onClick={() => set({ docs: on ? f.docs.filter((x) => x !== d) : [...f.docs, d] })} className={chip(on)}>{on ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}{d}</button>; })}
        </div>
        <input className={`${input} mt-2`} value={f.other} placeholder="Optional: another document" onChange={(e) => set({ other: e.target.value })} aria-label="Another document" />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block"><span className="eyebrow block mb-1">Date range</span><input className={input} value={f.range} onChange={(e) => set({ range: e.target.value })} /></label>
        <label className="block"><span className="eyebrow block mb-1">Due date</span><input type="date" className={input} value={f.due} min={dayInput(today().toISOString())} onChange={(e) => set({ due: e.target.value })} /></label>
      </div>
      <div><span className="eyebrow block mb-1.5">Priority</span>
        <div className="flex gap-1.5" role="radiogroup" aria-label="Priority">{(["High", "Normal", "Low"] as const).map((x) => <button key={x} type="button" role="radio" aria-checked={f.priority === x} onClick={() => set({ priority: x })} className={chip(f.priority === x)}>{x}</button>)}</div>
      </div>
      <label className="block"><span className="eyebrow block mb-1">Internal notes</span><textarea rows={3} className={input} value={f.notes} onChange={(e) => set({ notes: e.target.value })} /></label>
      {err && <p role="alert" className="text-sm text-[#B91C1C]">{err}</p>}
    </Modal>
  );
}

function UploadDialog({ ctx, r, onClose }: { ctx: CaseCtx; r: DocRequest; onClose: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const open = !isDone(r);
  const upload = async () => {
    setBusy(true);
    try {
      const stored: ReqFile[] = await Promise.all(files.map(async (f) => ({ name: f.name, pages: 0, size: f.size, storageKey: await putMediaFile(f) })));
      addDocuments(ctx, r.id, stored);
      onClose();
    } catch {
      toast.error("The files couldn't be stored in this browser.");
    } finally {
      setBusy(false);
    }
  };
  const sample = () => {
    const name = `${slug(r.to)}_${slug(r.docs[r.files.length % r.docs.length] ?? "Document")}.pdf`;
    addDocuments(ctx, r.id, [{ name, pages: 1, demo: true }]);
    onClose();
  };
  return (
    <Modal title="Upload documents" onClose={onClose} footer={<>
      <button type="button" className={btn} onClick={onClose}>Cancel</button>
      <button type="button" className={btnP} disabled={!files.length || busy} onClick={upload}>{busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Upload {files.length || ""}</button>
    </>}>
      <p className="text-sm text-[#5B6B78]">Attach the documents {r.to} produced.{open ? " The request will be marked received." : ""}</p>
      <label className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-line rounded-xl px-4 py-6 text-sm text-[#5B6B78] cursor-pointer hover:border-brand hover:bg-wash">
        <Upload className="w-5 h-5 text-deep" />
        {files.length ? <b className="text-ink">{files.map((f) => f.name).join(", ")}</b> : <span><b className="text-deep">Choose files</b> from your computer</span>}
        <input type="file" multiple className="sr-only" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
      </label>
      <div className="flex items-center justify-between gap-3 rounded-lg bg-wash border border-line px-3 py-2.5 text-sm">
        <span className="text-[#5B6B78]">No file to hand? Attach a sample document for the demo.</span>
        <button type="button" className={btn} onClick={sample}><FileText className="w-3.5 h-3.5" />Add sample</button>
      </div>
    </Modal>
  );
}

function DetailPanel({ ctx, r, mail }: { ctx: CaseCtx; r: DocRequest | undefined; mail: MailMsg[] }) {
  const [dlg, setDlg] = useState<Dialog>("");
  const [tab, setTab] = useState<"activity" | "messages" | "files">("activity");
  const [preview, setPreview] = useState<{ name: string; blob: Blob } | null>(null);
  useEffect(() => { setDlg(""); setTab("activity"); setPreview(null); }, [r?.id]);
  if (!r) return <div className="lg-card p-10 text-center text-sm text-[#5B6B78] flex flex-col items-center gap-2"><Inbox className="w-8 h-8 text-[#9BDAEC]" />Select a request to see its status and history.</div>;

  const thread = mail.filter((m) => m.rid === r.id).sort((a, b) => +new Date(a.at) - +new Date(b.at));
  const confirmed = thread.find((m) => m.dir === "in" && m.kind === "Acknowledgment")?.at;
  const ns = nextStep(r, confirmed), done = isDone(r), draft = r.status === "Draft" || r.status === "Awaiting approval";
  const run = (a: NextAction) => {
    if (a === "send") sendDraft(ctx, r.id);
    if (a === "approve") recordApproval(ctx, r.id);
    if (a === "review") markReviewed(ctx, r.id);
    if (a === "ack") markAcknowledged(ctx, r.id);
    if (a === "remind") setDlg("remind");
    if (a === "received") markReceived(ctx, r.id);
  };
  const ICON: Record<NextAction, typeof Bell> = { send: Send, approve: Check, remind: Bell, review: CheckCheck, received: Inbox, ack: Check };
  const file = async (f: ReqFile, then: (b: Blob) => void) => {
    const b = await fileBlob(f, ctx.caseName, r.to);
    if (b) then(b); else toast.error("This file isn't stored in this browser, so it can't be opened or downloaded.");
  };
  const tools: [Dialog, string, typeof Bell][] = [
    ...(r.status === "Draft" ? [["edit", "Edit request", Pencil], ["delete", "Delete draft", Trash2]] as [Dialog, string, typeof Bell][] : []),
    ["owner", "Reassign", Clock],
    ...(!done ? [["due", "Extend due date", Clock]] as [Dialog, string, typeof Bell][] : []),
    ...(!done && !draft ? [["snooze", "Snooze follow-up", AlarmClock]] as [Dialog, string, typeof Bell][] : []),
    ...(!draft ? [["upload", "Upload documents", Upload]] as [Dialog, string, typeof Bell][] : []),
  ];
  const row = (k: string, v: React.ReactNode, wide = false) => <div className={wide ? "col-span-2" : ""}><dt className="eyebrow mb-1">{k}</dt><dd className="text-ink">{v}</dd></div>;

  return (
    <div id="request-detail" className="lg-card p-5 space-y-5">
      <div className="flex gap-3.5 items-start">
        <CatIcon cat={r.cat} size={44} />
        <div className="min-w-0 flex-1">
          <div className="eyebrow">{r.cat} · <span className="mono-ref">{r.id}</span></div>
          <h3 className="card-title mt-0.5 break-words">{titleOf(r)}</h3>
          <p className="text-sm text-[#5B6B78] break-words">To {r.to}</p>
          <div className="flex flex-wrap items-center gap-2 mt-1.5"><StatusPill r={r} /><DueChip r={r} />{r.priority && <Tag text={`${r.priority === "Medium" ? "Normal" : r.priority} priority`} tone={PRIORITY_TONE[r.priority]} />}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Manage request">
        {tools.map(([k, l, I]) => (
          <button key={k} type="button" onClick={() => setDlg(k)} className={`${btn} ${k === "delete" ? "text-[#B91C1C]" : ""}`}>
            {k === "owner" ? <Avatar name={r.owner} /> : <I className="w-3.5 h-3.5" />}{l}
          </button>
        ))}
      </div>

      <Stepper r={r} />

      <div className={`rounded-xl border px-4 py-3.5 flex flex-wrap items-center justify-between gap-3 ${NEXT_BG[ns.tone]}`}>
        <div className="min-w-0 flex-[1_1_260px]">
          <div className="eyebrow">Next step</div>
          <b className={`block text-[15px] mt-0.5 ${ns.tone === "crit" ? "text-[#B91C1C]" : "text-ink"}`}>{ns.title}</b>
          <p className="text-sm text-ink mt-0.5">{ns.text}</p>
          <OpenTime r={r} />
        </div>
        {ns.actions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {ns.actions.map(([a, l], i) => { const I = ICON[a]; return <button key={a} type="button" onClick={() => run(a)} className={i === 0 ? btnP : btn}><I className="w-3.5 h-3.5" />{l}</button>; })}
          </div>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-5 gap-y-3.5 text-sm">
        {row("Recipient", r.to)}
        {row("Category", r.cat)}
        {row("Status", <StatusPill r={r} />)}
        {row("Assigned to", <span className="inline-flex items-center gap-2"><Avatar name={r.owner} />{r.owner}</span>)}
        {row("Created", fmtDate(r.createdAt))}
        {row("Sent", r.sent ? fmtDate(r.sent) : <span className="text-[#8A98A3]">Not sent</span>)}
        {row("Due", r.due ? fmtDate(r.due) : <span className="text-[#8A98A3]">Not set</span>)}
        {r.received ? row("Received", fmtDate(r.received)) : row("Priority", r.priority === "Medium" ? "Normal" : r.priority ?? "Normal")}
        {r.received && row("Priority", r.priority === "Medium" ? "Normal" : r.priority ?? "Normal")}
        {row("Request method", `${r.method} · ${r.channel}`)}
        {row("Date range", r.range)}
        {r.next && !done && row("Next follow-up", `${fmtDate(r.next)}, ${fmtTime(r.next)}`)}
        {row("Documents requested", <span className="flex flex-wrap gap-1.5">{r.docs.map((d) => <span key={d} className="rounded-md bg-track px-2 py-0.5 text-xs text-ink">{d}</span>)}</span>, true)}
        {row("Internal notes", r.notes ? <span className="block rounded-lg bg-wash border border-line px-3 py-2">{r.notes}</span> : <span className="text-[#8A98A3]">None</span>, true)}
      </dl>

      <div className="inline-flex bg-track border border-line rounded-lg p-0.5" role="tablist">
        {([["activity", "Activity", r.log.length], ["messages", "Messages", thread.length], ["files", "Documents", r.files.length]] as const).map(([k, l, n]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 ${tab === k ? "bg-white text-ink shadow-sm" : "text-[#5B6B78] hover:text-ink"}`}>
            {l}<span className="text-[10px] px-1.5 rounded-full bg-track text-[#5B6B78]">{n}</span>
          </button>
        ))}
      </div>

      {tab === "activity" && (
        <ol className="space-y-2.5" aria-label="Activity history">
          {[...r.log].reverse().map((l, i) => (
            <li key={i} className="grid grid-cols-[110px_10px_1fr] gap-2.5 text-sm">
              <span className="mono-ref text-xs pt-0.5">{fmtShort(l.at)} · {fmtTime(l.at)}</span>
              <span className="w-2 h-2 rounded-full bg-brand mt-1.5" />
              <span className="text-ink">{l.text}</span>
            </li>
          ))}
        </ol>
      )}
      {tab === "messages" && (
        <div className="space-y-3">
          <Thread key={r.id} ctx={ctx} messages={thread} />
          {!done && !draft && <button type="button" onClick={() => setDlg("remind")} className="inline-flex items-center gap-1.5 text-sm font-semibold text-deep hover:text-ink"><Bell className="w-4 h-4" />Send a reminder</button>}
          {!done && !draft && (
            <label className="flex items-center justify-between gap-3 border-t border-line pt-3 cursor-pointer text-sm">
              <span><b className="font-semibold text-ink">Automatic reminders</b><br /><span className="text-xs text-[#5B6B78]">{r.auto ? `Next: ${nextReminder(r)} · 3 days before due, on the due date, then weekly` : "Off. You'll need to follow up manually."}</span></span>
              <input type="checkbox" role="switch" checked={r.auto} onChange={(e) => setAuto(ctx, r.id, e.target.checked)} className="w-4 h-4 accent-[#3FB5D7]" />
            </label>
          )}
        </div>
      )}
      {tab === "files" && (
        <div className="space-y-2">
          {r.files.length ? (
            <ul className="space-y-2">
              {r.files.map((f) => (
                <li key={f.storageKey ?? f.name} className="flex flex-wrap items-center gap-2.5 border border-line rounded-lg px-3 py-2.5">
                  <FileText className="w-4 h-4 text-deep shrink-0" />
                  <span className="mono-ref text-ink flex-1 min-w-0 truncate" title={f.name}>{f.name}</span>
                  {r.reviewed && <Tag text="Reviewed" tone="ok" />}
                  <button type="button" className={btn} onClick={() => file(f, (b) => setPreview({ name: f.name, blob: b }))}><Eye className="w-3.5 h-3.5" />View</button>
                  <button type="button" className={btn} disabled={!f.storageKey && !f.demo} title={f.storageKey || f.demo ? "Download" : "The file isn't stored in this browser"} onClick={() => file(f, (b) => saveBlob(b, f.name))}>
                    <Download className="w-3.5 h-3.5" />Download
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-[#8A98A3]">No documents yet.{!draft ? " Upload them when they arrive." : ""}</p>}
          {!draft && <button type="button" onClick={() => setDlg("upload")} className="inline-flex items-center gap-1.5 text-sm font-semibold text-deep hover:text-ink"><Upload className="w-4 h-4" />Upload documents</button>}
        </div>
      )}

      {dlg === "owner" && <ReassignDialog ctx={ctx} r={r} onClose={() => setDlg("")} />}
      {dlg === "due" && <DueDialog ctx={ctx} r={r} onClose={() => setDlg("")} />}
      {dlg === "snooze" && <SnoozeDialog ctx={ctx} r={r} onClose={() => setDlg("")} />}
      {dlg === "remind" && <ReminderDialog ctx={ctx} r={r} onClose={() => setDlg("")} />}
      {dlg === "delete" && <DeleteDialog ctx={ctx} r={r} onClose={() => setDlg("")} />}
      {dlg === "edit" && <EditDialog ctx={ctx} r={r} onClose={() => setDlg("")} />}
      {dlg === "upload" && <UploadDialog ctx={ctx} r={r} onClose={() => setDlg("")} />}
      {preview && <FilePreview name={preview.name} blob={preview.blob} onClose={() => setPreview(null)} />}
    </div>
  );
}

export function RequestTracker({ ctx, requests, mail, focus, onNew }: {
  ctx: CaseCtx; requests: DocRequest[]; mail: MailMsg[]; focus?: { id: string; n: number }; onNew: () => void;
}) {
  const [f, setF] = useState<ListFilter>("all");
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string>("");
  const [viewMenu, setViewMenu] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    if (!focus?.id) return;
    setF("all"); setCat("all"); setQ(""); setSel(focus.id);
    window.setTimeout(() => document.getElementById("request-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }, [focus?.n]);

  const over = requests.filter(isOver);
  const week = requests.filter((r) => inFilter(r, "week"));
  const awaiting = requests.filter((r) => inFilter(r, "open") && !isOver(r));
  const review = requests.filter((r) => inFilter(r, "review"));
  const qq = q.trim().toLowerCase();
  const list = useMemo(() => requests
    .filter((r) => inFilter(r, f) && (cat === "all" || r.cat === cat) && (!qq || `${r.to} ${titleOf(r)} ${r.docs.join(" ")} ${r.cat} ${r.type} ${r.id}`.toLowerCase().includes(qq)))
    .sort((a, b) => BUCKETS.indexOf(bucket(a)) - BUCKETS.indexOf(bucket(b)) || urgency(a) - urgency(b)), [requests, f, cat, qq]);
  const current = list.find((r) => r.id === sel) ?? list[0];
  const cur = FILTERS.find((x) => x.key === f);
  const inCat = cat === "all" ? requests : requests.filter((r) => r.cat === cat);
  const cats = [{ c: "all", L: requests }, ...CATEGORIES.map((c) => ({ c, L: requests.filter((r) => r.cat === c) }))];

  const metric = (k: ListFilter, n: number, label: string, sub: string, Icon: typeof Clock, tone: keyof typeof METRIC_TONE) => (
    <button type="button" aria-pressed={f === k} onClick={() => setF(f === k ? "all" : k)}
      className={`h-full flex gap-3 items-start text-left bg-white border rounded-xl p-4 min-w-0 transition-colors ${f === k ? "border-brand ring-2 ring-tint" : "border-line hover:border-[#CBD7DE] hover:bg-[#FCFEFF]"}`}>
      <span className={`w-9 h-9 rounded-lg inline-flex items-center justify-center shrink-0 ${METRIC_TONE[tone]}`}><Icon className="w-4 h-4" strokeWidth={1.75} /></span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[24px] font-semibold leading-7 tabular-nums ${tone === "crit" && n ? "text-[#B42318]" : "text-ink"}`}>{n}</span>
        <span className="block text-sm font-semibold text-ink mt-1 truncate">{label}</span>
        <span className="block text-xs text-[#5B6B78] mt-0.5 truncate" title={sub}>{sub}</span>
      </span>
    </button>
  );

  const listEmpty = !requests.length || !inCat.length ? (
    <div className="lg-card text-center text-sm text-[#5B6B78] py-10 px-6 flex flex-col items-center gap-2">
      <Inbox className="w-8 h-8 text-[#9BDAEC]" strokeWidth={1.5} />
      <b className="text-ink">{requests.length ? `No ${cat.toLowerCase()} requests yet` : "No document requests on this case yet"}</b>
      <span className="max-w-sm">Create a request to track it from draft to reviewed. Reminders and replies are recorded against it.</span>
      <button type="button" onClick={onNew} className={`${btnP} mt-1`}><Plus className="w-3.5 h-3.5" />New request</button>
    </div>
  ) : (
    <div className="text-center text-sm text-[#5B6B78] py-10 flex flex-col items-center gap-2">
      <CheckCheck className="w-7 h-7 text-[#9BDAEC]" /><b className="text-ink">All clear</b>No requests match this view.
      {f !== "all" && <button type="button" onClick={() => setF("all")} className={`${btn} mt-1`}>Show all {inCat.length} request{inCat.length === 1 ? "" : "s"}</button>}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {metric("overdue", over.length, "Overdue", over.length ? over.map((r) => r.to).join(", ") : "Nothing overdue", Clock, "crit")}
        {metric("week", week.length, "Due this week", "Next 7 days", Bell, "warn")}
        {metric("open", awaiting.length, "Awaiting response", "Sent or acknowledged", Hourglass, "acc")}
        {metric("review", review.length, "To review", "Received, not reviewed", Inbox, "")}
        {over.length > 0 && (
          <div className="sm:col-span-2 xl:col-span-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#FEF2F2] border border-[#FBD5D5] px-4 py-2.5 text-sm font-semibold text-[#B91C1C]">
            {over.length} request{over.length === 1 ? " is" : "s are"} past due.
            <button type="button" className={btnP} onClick={() => remindMany(ctx, over.map((r) => r.id))}><Bell className="w-3.5 h-3.5" />Remind all overdue</button>
          </div>
        )}
      </div>

      {/* One white panel holds the categories; the cards inside sit on a light grey surface. */}
      <div className="lg-card p-4">
      <div role="group" aria-label="Request categories" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2.5">
        {cats.map(({ c, L }) => {
          const on = cat === c, n = L.length, d = L.filter(isDone).length, o = L.filter(isOver).length;
          return (
            <button key={c} type="button" aria-pressed={on} onClick={() => setCat(c)}
              className={`flex flex-col gap-2.5 text-left border rounded-xl p-3 min-w-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${on ? "bg-wash border-brand ring-2 ring-tint" : "bg-[#F4F6F8] border-[#E8EDF1] hover:border-[#CBD7DE] hover:bg-[#EFF3F6]"}`}>
              <span className="flex items-start gap-2.5 min-w-0">
                {c === "all"
                  ? <span className="w-8 h-8 rounded-lg bg-tint text-deep inline-flex items-center justify-center shrink-0"><Inbox className="w-4 h-4" strokeWidth={1.75} /></span>
                  : <CatIcon cat={c} size={32} />}
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-ink leading-[17px] min-h-[34px] line-clamp-2 break-words">{c === "all" ? "All categories" : c}</span>
                </span>
              </span>
              <span className="mt-auto space-y-1.5">
                <span className="flex items-baseline justify-between gap-2 text-xs text-[#5B6B78] whitespace-nowrap">
                  <span className="tabular-nums">{n ? <>{d} of {n} complete</> : "No requests"}</span>
                  {o > 0 && <span className="font-semibold text-[#B42318] tabular-nums">{o} overdue</span>}
                </span>
                <span className="block h-1 rounded-full bg-line overflow-hidden" role="progressbar" aria-label={`${c === "all" ? "All categories" : c} completion`} aria-valuemin={0} aria-valuemax={n} aria-valuenow={d}>
                  <span className="block h-full rounded-full bg-brand transition-[width]" style={{ width: n ? `${(d / n) * 100}%` : 0 }} />
                </span>
              </span>
            </button>
          );
        })}
      </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(300px,400px)_minmax(0,1fr)] gap-4 items-start">
        <section className="space-y-2.5 min-w-0">
          <div className="flex items-center gap-2">
            <div className="relative">
              <button type="button" aria-haspopup="menu" aria-expanded={viewMenu} onClick={() => setViewMenu(!viewMenu)} className="inline-flex items-center gap-2 border border-line bg-white rounded-lg pl-3 pr-2.5 py-1.5 text-sm hover:border-brand">
                <span className="eyebrow">View</span><b className="font-semibold text-ink">{cur?.label ?? FOCUS_LABEL[f]}</b>
                <span className="text-[11px] font-semibold px-1.5 rounded-full bg-track">{list.length}</span><Collapse open={viewMenu} />
              </button>
              {viewMenu && (
                <div role="menu" className="absolute left-0 top-[calc(100%+6px)] z-20 w-[300px] bg-white border border-line rounded-xl shadow-lg p-1">
                  {FILTERS.map((x) => (
                    <button key={x.key} type="button" role="menuitemradio" aria-checked={f === x.key} onClick={() => { setF(x.key); setViewMenu(false); }} className={`w-full flex items-center gap-2.5 text-left rounded-lg px-2.5 py-2 hover:bg-wash ${f === x.key ? "bg-wash" : ""}`}>
                      <span className="flex-1 min-w-0"><b className="block text-sm font-semibold text-ink">{x.label}</b><span className="text-xs text-[#5B6B78]">{x.note}</span></span>
                      <span className="text-[11px] font-semibold px-1.5 rounded-full bg-track">{requests.filter((r) => inFilter(r, x.key)).length}</span>
                      {f === x.key ? <Check className="w-4 h-4 text-deep" /> : <span className="w-4" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <span className="flex-1" />
            <button type="button" aria-pressed={bulk} onClick={() => { setBulk(!bulk); setPicked([]); }} className={btn}>{bulk ? "Done" : "Select"}</button>
          </div>
          <label className="flex items-center gap-2 bg-white border border-line rounded-lg px-3 focus-within:border-brand">
            <Search className="w-4 h-4 text-[#8A98A3]" /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search requests" className="flex-1 min-w-0 py-2 text-sm bg-transparent outline-none" />
          </label>
          {(FOCUS_LABEL[f] || cat !== "all") && (
            <div className="flex items-center gap-2 text-sm bg-tint text-deep rounded-lg pl-3 pr-1.5 py-1">
              Showing: <b className="font-semibold">{[FOCUS_LABEL[f], cat !== "all" ? cat : ""].filter(Boolean).join(" · ")}</b>
              <button type="button" aria-label="Clear filters" onClick={() => { setF("all"); setCat("all"); }} className="ml-auto p-1 rounded hover:bg-white"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}
          {bulk && (
            <div className="flex flex-wrap items-center gap-2 bg-tint rounded-lg px-3 py-2 text-sm">
              <span><b>{picked.length}</b> selected</span>
              <button type="button" className="text-xs font-semibold text-deep underline" onClick={() => setPicked(list.filter((r) => !isDone(r)).map((r) => r.id))}>Select all {list.filter((r) => !isDone(r)).length}</button>
              <span className="flex-1" />
              <button type="button" className={btnP} disabled={!picked.length} onClick={() => { remindMany(ctx, picked); setPicked([]); setBulk(false); }}><Bell className="w-3.5 h-3.5" />Remind</button>
              {OWNERS.map((o) => <button key={o.n} type="button" className={btn} disabled={!picked.length} onClick={() => { reassign(ctx, picked, o.n); setPicked([]); setBulk(false); }}>Assign to {o.n.split(" ")[0]}</button>)}
            </div>
          )}
          <div className="space-y-1.5 lg:max-h-[760px] lg:overflow-y-auto p-0.5">
            {list.length ? BUCKETS.map((g) => {
              const L = list.filter((r) => bucket(r) === g);
              if (!L.length) return null;
              return (
                <div key={g} className="space-y-1.5">
                  <div className={`flex justify-between text-[11px] font-semibold uppercase tracking-wide px-1 pt-2 ${g === "Overdue" ? "text-[#B91C1C]" : "text-[#5B6B78]"}`}><span>{g}</span><span>{L.length}</span></div>
                  {L.map((r) => {
                    const on = current?.id === r.id;
                    return (
                      <div key={r.id} className="flex items-stretch gap-2">
                        {bulk && <label className="flex items-center px-0.5"><input type="checkbox" aria-label={`Select ${r.to}`} disabled={isDone(r)} checked={picked.includes(r.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, r.id] : picked.filter((x) => x !== r.id))} className="w-4 h-4 accent-[#3FB5D7]" /></label>}
                        <button type="button" aria-pressed={on} onClick={() => { setSel(r.id); if (window.innerWidth < 1024) window.setTimeout(() => document.getElementById("request-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }), 30); }}
                          className={`flex-1 min-w-0 flex gap-3 text-left bg-white border rounded-xl p-3 transition-colors ${on ? "border-brand ring-2 ring-tint" : "border-line hover:border-[#CBD7DE]"} ${isDone(r) ? "opacity-75" : ""}`}>
                          <CatIcon cat={r.cat} size={36} />
                          <span className="min-w-0 flex-1 space-y-1">
                            <span className="block text-sm font-semibold text-ink leading-snug break-words">{titleOf(r)}</span>
                            <span className="block text-xs text-[#5B6B78] truncate"><b className="font-semibold text-ink">{r.to}</b> · {r.docs.join(", ")}</span>
                            <span className="flex flex-wrap items-center gap-2"><StatusPill r={r} /><DueChip r={r} />{r.priority === "High" && <Tag text="High" tone="crit" />}<span className="ml-auto"><Avatar name={r.owner} /></span></span>
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            }) : listEmpty}
          </div>
        </section>
        <section className="lg:sticky lg:top-[150px] min-w-0">
          <DetailPanel ctx={ctx} r={current} mail={mail} />
        </section>
      </div>
    </div>
  );
}
