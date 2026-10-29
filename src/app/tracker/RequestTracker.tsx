import { useEffect, useMemo, useRef, useState } from "react";
import {
  Clock, Bell, Scale, Inbox, Search, X, Check, Send, ArrowUpRight, CheckCheck, FileText, Download, Upload, Plus, Loader2,
} from "lucide-react";
import {
  type CaseCtx, type DocRequest, type MailMsg, type ListFilter, type Tone,
  CATEGORIES, FILTERS, FOCUS_LABEL, BUCKETS, STAGES, OWNERS, ESC, TYPICAL, APPROVAL_THRESHOLD,
  inFilter, bucket, urgency, isOver, isDone, isWaiting, daysTo, stageIx, reminderCount, nextReminder,
  reminderText, fmtDate, fmtShort, fmtTime, money, addDays, today, iso,
} from "./trackerData";
import {
  sendDraft, recordApproval, sendReminder, remindMany, escalate, markAcknowledged, markReceived, markReviewed,
  reassign, extendDue, snooze, setAuto,
} from "./trackerStore";
import { CatIcon, StatusPill, DueChip, Avatar, Thread, Tag, NotConnected, Collapse } from "./TrackerShared";
import { putMediaFile, downloadMediaFile } from "../intake/mediaFileStore";
import { toast } from "sonner";

const btn = "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-line bg-white text-xs font-semibold text-deep hover:bg-wash transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
const btnP = "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-brand hover:bg-deep text-white text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
const METRIC_TONE = { crit: "bg-[#FEF3F2] text-[#B42318]", warn: "bg-[#FFF7ED] text-[#B45309]", acc: "bg-tint text-deep", "": "bg-[#F1F5F7] text-[#5B6B78]" };
const chip =(on: boolean) => `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${on ? "border-brand bg-tint text-deep" : "border-line bg-white text-ink hover:border-[#CBD7DE]"}`;

type NextAction = "send" | "approve" | "remind" | "escalate" | "review" | "received" | "ack";
function nextStep(r: DocRequest): { title: string; text: string; actions: [NextAction, string][]; tone: string } {
  const n = daysTo(r) ?? 0;
  const last = r.log[r.log.length - 1]?.text ?? "No activity yet";
  if (r.status === "Draft") return { title: "Ready to send", text: "Review the request and send it to the recipient.", actions: [["send", "Send request"]], tone: "" };
  if (r.status === "Awaiting approval") return { title: "Waiting for carrier approval", text: `${money(r.cost)} is over the ${money(APPROVAL_THRESHOLD)} pre-approval threshold. Record the carrier's approval to send it.`, actions: [["approve", "Record approval"]], tone: "warn" };
  if (isOver(r)) return { title: `No response, ${-n} day${n === -1 ? "" : "s"} past due`, text: `Last activity: ${last}. Send a reminder now, or escalate.`, actions: [["remind", "Send reminder"], ["escalate", ESC[r.method] ?? "Escalate"]], tone: "crit" };
  if (isWaiting(r)) return { title: "Waiting on plaintiff's counsel", text: `Due ${fmtDate(r.due)}. ${last}.`, actions: [["remind", "Remind plaintiff's counsel"], ["received", "Mark received"]], tone: "warn" };
  if (r.status === "Received" && !r.reviewed) return { title: "Records received", text: `${r.pages} page${r.pages === 1 ? "" : "s"} received. Review them, then mark the request reviewed.`, actions: [["review", "Mark reviewed"]], tone: "acc" };
  if (isDone(r)) return { title: "Complete", text: r.status === "No records" ? "The recipient certified that no records exist." : `${r.pages} pages received and reviewed.`, actions: [], tone: "ok" };
  const acts: [NextAction, string][] = [["remind", "Send reminder"]];
  if (r.status === "Sent") acts.push(["ack", "Mark acknowledged"]);
  acts.push(["received", "Mark received"]);
  return { title: r.status === "Escalated" ? "Escalated" : "With the recipient", text: `${n === 0 ? "Due today" : `Due in ${n} day${n === 1 ? "" : "s"}`} (${fmtDate(r.due)}). ${r.auto ? `Next automatic reminder: ${nextReminder(r)}.` : "Automatic reminders are off."}`, actions: acts, tone: "" };
}
const NEXT_BG: Record<string, string> = { crit: "bg-[#FEF2F2] border-[#FBD5D5]", warn: "bg-[#FFF7ED] border-[#FDE6C8]", acc: "bg-tint border-[#CDEBF5]", ok: "bg-[#ECFDF3] border-[#D1FADF]", "": "bg-wash border-line" };

function Stepper({ r }: { r: DocRequest }) {
  const ix = stageIx(r), over = isOver(r), done = isDone(r);
  const dates = [r.createdAt, r.sent, r.log.find((l) => /acknowledged/i.test(l.text))?.at, r.log.find((l) => /^Records received|no records/i.test(l.text))?.at, r.log.find((l) => l.text === "Reviewed")?.at];
  return (
    <ol className="grid grid-cols-5">
      {STAGES.map((s, i) => {
        const complete = i < ix || (done && i === ix), cur = i === ix && !complete;
        return (
          <li key={s} className="relative flex flex-col items-center text-center gap-1 min-w-0">
            {i > 0 && <span className={`absolute top-[10px] right-1/2 w-full h-[2px] ${i <= ix ? "bg-brand" : "bg-line"}`} />}
            <span className={`relative z-[1] w-[22px] h-[22px] rounded-full border-2 inline-flex items-center justify-center ${complete ? "bg-brand border-brand text-white" : cur ? (over ? "border-[#B91C1C] bg-[#FEF2F2]" : "border-brand bg-white ring-4 ring-tint") : "border-line bg-white"}`}>
              {complete && <Check className="w-3 h-3" strokeWidth={3} />}
            </span>
            <span className="text-[11px] font-semibold text-ink">{s}</span>
            <span className={`text-[10.5px] ${cur && over ? "text-[#B91C1C] font-semibold" : "text-[#8A98A3]"}`}>{cur && over ? `${-(daysTo(r) ?? 0)}d overdue` : dates[i] && (i < ix || complete) ? fmtShort(dates[i]) : " "}</span>
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

function Ladder({ r }: { r: DocRequest }) {
  const n = r.status === "Escalated" ? 4 : Math.min(reminderCount(r) + 1, 3);
  return (
    <ol className="flex flex-wrap gap-x-3 gap-y-1 mt-2.5">
      {["Requested", "Reminder 1", "Reminder 2", "Escalate"].map((s, i) => (
        <li key={s} className={`inline-flex items-center gap-1.5 text-[11px] ${i < n ? "text-ink font-semibold" : i === n && isOver(r) ? "text-[#B91C1C] font-bold" : "text-[#8A98A3]"}`}>
          <i className={`w-2 h-2 rounded-full border ${i < n ? "bg-ink border-ink" : i === n && isOver(r) ? "border-[#B91C1C] ring-2 ring-[#FEF2F2]" : "border-[#8A98A3]"}`} />{s}
        </li>
      ))}
    </ol>
  );
}

function ReceiveBox({ ctx, r, onDone }: { ctx: CaseCtx; r: DocRequest; onDone: () => void }) {
  const [pages, setPages] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [none, setNone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const save = async () => {
    const n = Math.round(+pages);
    if (!none && (!pages.trim() || !Number.isFinite(n) || n < 0)) return setErr("Enter the number of pages received.");
    setBusy(true);
    try {
      const stored = none ? [] : await Promise.all(files.map(async (f) => ({ name: f.name, pages: 0, size: f.size, storageKey: await putMediaFile(f) })));
      markReceived(ctx, r.id, none ? 0 : n, stored, none);
      onDone();
    } catch {
      setErr("The files could not be stored in this browser.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-xl border border-line bg-wash p-3.5 space-y-3">
      <label className="inline-flex items-center gap-2 text-sm text-ink cursor-pointer">
        <input type="checkbox" checked={none} onChange={(e) => setNone(e.target.checked)} className="w-4 h-4 accent-[#3FB5D7]" />
        The recipient certified that no records exist
      </label>
      {!none && (
        <div className="grid sm:grid-cols-[140px_1fr] gap-3 items-end">
          <label className="block"><span className="eyebrow block mb-1">Pages received</span>
            <input type="number" min={0} value={pages} onChange={(e) => { setErr(""); setPages(e.target.value); }} className="w-full bg-white border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand" />
          </label>
          <label className="block"><span className="eyebrow block mb-1">Attach the files (optional)</span>
            <span className={`${btn} cursor-pointer w-full sm:w-auto`}><Upload className="w-3.5 h-3.5" />{files.length ? `${files.length} file${files.length === 1 ? "" : "s"} chosen` : "Choose files"}
              <input type="file" multiple className="hidden" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
            </span>
          </label>
        </div>
      )}
      {err && <p className="text-xs text-[#B91C1C]">{err}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className={btn} onClick={onDone}>Cancel</button>
        <button type="button" className={btnP} disabled={busy} onClick={save}>{busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Save</button>
      </div>
    </div>
  );
}

function ReminderComposer({ ctx, r, onDone }: { ctx: CaseCtx; r: DocRequest; onDone: () => void }) {
  const initTone: Tone = isOver(r) ? (reminderCount(r) >= 2 ? "Final notice" : "Firm") : "Friendly";
  const [tone, setTone] = useState<Tone>(initTone);
  const [channel, setChannel] = useState(r.channel);
  const [text, setText] = useState(reminderText(r, initTone, ctx));
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }, []);
  return (
    <div className="border border-brand rounded-xl p-3.5 space-y-3 ring-2 ring-tint bg-white">
      <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-[#5B6B78] w-14">Tone</span>
        {(["Friendly", "Firm", "Final notice"] as Tone[]).map((t) => <button key={t} type="button" aria-pressed={t === tone} onClick={() => { setTone(t); setText(reminderText(r, t, ctx)); }} className={chip(t === tone)}>{t}</button>)}
      </div>
      <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-[#5B6B78] w-14">Send by</span>
        {["Retrieval vendor portal", "Email", "Fax", "Phone call (log only)"].map((c) => <button key={c} type="button" aria-pressed={c === channel} onClick={() => setChannel(c)} className={chip(c === channel)}>{c}</button>)}
      </div>
      <textarea ref={ref} rows={6} value={text} onChange={(e) => setText(e.target.value)} aria-label="Reminder message" className="w-full bg-white border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className={btn} onClick={onDone}>Cancel</button>
        <div className="flex gap-2">
          <button type="button" className={btn} onClick={() => { sendReminder(ctx, r.id, channel, tone, text, "later"); onDone(); }}><Clock className="w-3.5 h-3.5" />Tomorrow 9 AM</button>
          <button type="button" className={btnP} disabled={!text.trim()} onClick={() => { sendReminder(ctx, r.id, channel, tone, text, "now"); onDone(); }}><Send className="w-3.5 h-3.5" />Record reminder</button>
        </div>
      </div>
      <NotConnected />
    </div>
  );
}

function DetailPanel({ ctx, r, mail }: { ctx: CaseCtx; r: DocRequest | undefined; mail: MailMsg[] }) {
  const [menu, setMenu] = useState<"" | "owner" | "due" | "snooze">("");
  const [composer, setComposer] = useState(false);
  const [rx, setRx] = useState(false);
  const [tab, setTab] = useState<"messages" | "activity" | "files">("messages");
  useEffect(() => { setMenu(""); setComposer(false); setRx(false); setTab("messages"); }, [r?.id]);
  if (!r) return <div className="lg-card p-10 text-center text-sm text-[#5B6B78] flex flex-col items-center gap-2"><Inbox className="w-8 h-8 text-[#9BDAEC]" />Select a request to see its status and history.</div>;

  const ns = nextStep(r), done = isDone(r);
  const thread = mail.filter((m) => m.rid === r.id).sort((a, b) => +new Date(a.at) - +new Date(b.at));
  const run = (a: NextAction) => {
    if (a === "send") sendDraft(ctx, r.id);
    if (a === "approve") recordApproval(ctx, r.id);
    if (a === "escalate") escalate(ctx, r.id);
    if (a === "review") markReviewed(ctx, r.id);
    if (a === "ack") markAcknowledged(ctx, r.id);
    if (a === "remind") { setRx(false); setTab("messages"); setComposer(true); }
    if (a === "received") { setComposer(false); setRx(true); }
  };
  const ICON: Record<NextAction, typeof Bell> = { send: Send, approve: Check, remind: Bell, escalate: ArrowUpRight, review: CheckCheck, received: Inbox, ack: Check };

  return (
    <div id="request-detail" className="lg-card p-5 space-y-5">
      <div className="flex gap-3.5 items-start">
        <CatIcon cat={r.cat} size={44} />
        <div className="min-w-0 flex-1">
          <div className="eyebrow">{r.cat} · {r.type} · <span className="mono-ref">{r.id}</span></div>
          <h3 className="card-title mt-0.5 break-words">{r.to}</h3>
          <div className="flex flex-wrap items-center gap-2 mt-1.5"><StatusPill r={r} /><DueChip r={r} /></div>
        </div>
      </div>

      {!done && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Manage request">
            {([["owner", "Reassign"], ["due", "Extend due date"], ["snooze", "Snooze follow-up"]] as const).map(([k, l]) => (
              <button key={k} type="button" aria-expanded={menu === k} onClick={() => setMenu(menu === k ? "" : k)} className={`${btn} ${menu === k ? "border-brand bg-tint" : ""}`}>
                {k === "owner" ? <Avatar name={r.owner} /> : k === "due" ? <Clock className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}{l}
              </button>
            ))}
          </div>
          {menu && (
            <div className="rounded-xl border border-line bg-wash p-3 space-y-2">
              {menu === "owner" && (<><span className="text-xs text-[#5B6B78]">Assign to</span><div className="flex flex-wrap gap-1.5">{OWNERS.map((o) => <button key={o.n} type="button" aria-pressed={r.owner === o.n} disabled={r.owner === o.n} onClick={() => { reassign(ctx, [r.id], o.n); setMenu(""); }} className={chip(r.owner === o.n)}><Avatar name={o.n} />{o.n}</button>)}</div></>)}
              {menu === "due" && (<><span className="text-xs text-[#5B6B78]">Current due date: {r.due ? fmtDate(r.due) : "none"}. Changes the request's deadline.</span><div className="flex flex-wrap gap-1.5">{[7, 14, 30].map((d) => <button key={d} type="button" onClick={() => { extendDue(ctx, r.id, d); setMenu(""); }} className={chip(false)}>+{d} days · {fmtShort(iso(addDays(r.due ? new Date(r.due) : today(), d)))}</button>)}</div></>)}
              {menu === "snooze" && (<><span className="text-xs text-[#5B6B78]">Pause follow-up reminders until (the due date stays the same)</span><div className="flex flex-wrap gap-1.5">{([["Tomorrow", 1], ["In 3 days", 3], ["Next week", 7]] as const).map(([l, d]) => <button key={d} type="button" onClick={() => { snooze(ctx, r.id, d); setMenu(""); }} className={chip(false)}>{l} · {fmtShort(iso(addDays(today(), d)))}</button>)}</div></>)}
            </div>
          )}
        </div>
      )}

      <Stepper r={r} />

      <div className={`rounded-xl border px-4 py-3.5 flex flex-wrap items-center justify-between gap-3 ${NEXT_BG[ns.tone]}`}>
        <div className="min-w-0 flex-[1_1_260px]">
          <div className="eyebrow">Next step</div>
          <b className={`block text-[15px] mt-0.5 ${ns.tone === "crit" ? "text-[#B91C1C]" : "text-ink"}`}>{ns.title}</b>
          <p className="text-sm text-ink mt-0.5">{ns.text}</p>
          {!done && r.status !== "Draft" && r.status !== "Awaiting approval" && <Ladder r={r} />}
          <OpenTime r={r} />
        </div>
        {ns.actions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {ns.actions.map(([a, l], i) => { const I = ICON[a]; return <button key={a} type="button" onClick={() => run(a)} className={i === 0 ? btnP : btn}><I className="w-3.5 h-3.5" />{l}</button>; })}
          </div>
        )}
      </div>

      {rx && <ReceiveBox ctx={ctx} r={r} onDone={() => setRx(false)} />}

      <dl className="grid grid-cols-2 gap-x-5 gap-y-3.5 text-sm">
        <div className="col-span-2"><dt className="eyebrow mb-1">Documents requested</dt><dd className="flex flex-wrap gap-1.5">{r.docs.map((d) => <span key={d} className="rounded-md bg-track px-2 py-0.5 text-xs text-ink">{d}</span>)}</dd></div>
        <div><dt className="eyebrow mb-1">Date range</dt><dd className="text-ink">{r.range}</dd></div>
        <div><dt className="eyebrow mb-1">Method</dt><dd className="text-ink">{r.method} · {r.channel}</dd></div>
        <div><dt className="eyebrow mb-1">Sent</dt><dd className="text-ink">{r.sent ? fmtDate(r.sent) : "Not sent"}</dd></div>
        <div><dt className="eyebrow mb-1">Due</dt><dd className="text-ink">{r.due ? fmtDate(r.due) : "Not scheduled"}</dd></div>
        <div><dt className="eyebrow mb-1">Owner</dt><dd className="flex items-center gap-2 text-ink"><Avatar name={r.owner} />{r.owner}</dd></div>
        <div><dt className="eyebrow mb-1">Estimated cost</dt><dd className="text-ink">{r.cost ? money(r.cost) : "—"}</dd></div>
        <div className="col-span-2"><dt className="eyebrow mb-1">Contact</dt><dd className={r.contact ? "text-ink" : "text-[#8A98A3]"}>{r.contact || "Not recorded"}</dd></div>
      </dl>

      <div className="inline-flex bg-track border border-line rounded-lg p-0.5" role="tablist">
        {([["messages", "Messages", thread.length], ["activity", "Activity", r.log.length], ["files", "Files", r.files.length]] as const).map(([k, l, n]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 ${tab === k ? "bg-white text-ink shadow-sm" : "text-[#5B6B78] hover:text-ink"}`}>
            {l}<span className="text-[10px] px-1.5 rounded-full bg-track text-[#5B6B78]">{n}</span>
          </button>
        ))}
      </div>

      {tab === "messages" && (
        <div className="space-y-3">
          <Thread key={r.id} ctx={ctx} messages={thread} />
          {!done && (composer
            ? <ReminderComposer ctx={ctx} r={r} onDone={() => setComposer(false)} />
            : <button type="button" onClick={() => run("remind")} className="inline-flex items-center gap-1.5 text-sm font-semibold text-deep hover:text-ink"><Bell className="w-4 h-4" />Send a reminder</button>)}
          {!done && (
            <label className="flex items-center justify-between gap-3 border-t border-line pt-3 cursor-pointer text-sm">
              <span><b className="font-semibold text-ink">Automatic reminders</b><br /><span className="text-xs text-[#5B6B78]">{r.auto ? `Next: ${nextReminder(r)} · 3 days before due, on the due date, then weekly` : "Off. You'll need to follow up manually."}</span></span>
              <input type="checkbox" role="switch" checked={r.auto} onChange={(e) => setAuto(ctx, r.id, e.target.checked)} className="w-4 h-4 accent-[#3FB5D7]" />
            </label>
          )}
        </div>
      )}
      {tab === "activity" && (
        <ol className="space-y-2.5">
          {[...r.log].reverse().map((l, i) => (
            <li key={i} className="grid grid-cols-[96px_10px_1fr] gap-2.5 text-sm">
              <span className="mono-ref text-xs pt-0.5">{fmtShort(l.at)} · {fmtTime(l.at)}</span>
              <span className="w-2 h-2 rounded-full bg-brand mt-1.5" />
              <span className="text-ink">{l.text}</span>
            </li>
          ))}
        </ol>
      )}
      {tab === "files" && (
        r.files.length ? (
          <ul className="space-y-2">
            {r.files.map((f) => (
              <li key={f.storageKey ?? f.name} className="flex items-center gap-2.5 border border-line rounded-lg px-3 py-2.5">
                <FileText className="w-4 h-4 text-deep shrink-0" />
                <span className="mono-ref text-ink flex-1 min-w-0 truncate">{f.name}</span>
                {r.reviewed && <Tag text="Reviewed" tone="ok" />}
                <button type="button" className={btn} disabled={!f.storageKey} title={f.storageKey ? "Download" : "The file is not stored in this browser"}
                  onClick={async () => { if (!(await downloadMediaFile(f.storageKey, f.name))) toast.error("The file is not stored in this browser"); }}>
                  <Download className="w-3.5 h-3.5" />Download
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-[#8A98A3]">No files yet. Files attached when the request is marked received appear here.</p>
      )}
    </div>
  );
}

export function RequestTracker({ ctx, requests, mail, focus, onNew }: {
  ctx: CaseCtx; requests: DocRequest[]; mail: MailMsg[]; focus?: { id: string; n: number }; onNew: () => void;
}) {
  const [f, setF] = useState<ListFilter>("action");
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
  const waiting = requests.filter(isWaiting);
  const review = requests.filter((r) => inFilter(r, "review"));
  const qq = q.trim().toLowerCase();
  const list = useMemo(() => requests
    .filter((r) => inFilter(r, f) && (cat === "all" || r.cat === cat) && (!qq || `${r.to} ${r.docs.join(" ")} ${r.cat} ${r.type} ${r.id}`.toLowerCase().includes(qq)))
    .sort((a, b) => BUCKETS.indexOf(bucket(a)) - BUCKETS.indexOf(bucket(b)) || urgency(a) - urgency(b)), [requests, f, cat, qq]);
  const current = list.find((r) => r.id === sel) ?? list[0];
  const cur = FILTERS.find((x) => x.key === f);
  const inCat = cat === "all" ? requests : requests.filter((r) => r.cat === cat);
  const cats = [{ c: "all", L: requests }, ...CATEGORIES.map((c) => ({ c, L: requests.filter((r) => r.cat === c) }))];

  const metric = (k: ListFilter, n: number, label: string, sub: string, Icon: typeof Clock, tone: keyof typeof METRIC_TONE) => (
    <button type="button" aria-pressed={f === k} onClick={() => setF(f === k ? "action" : k)}
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
      <span className="max-w-sm">Create a request to track it from draft to reviewed. Reminders, escalations and replies are recorded against it.</span>
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
        {metric("waiting", waiting.length, "Waiting on plaintiff", "Discovery and signed forms", Scale, "acc")}
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
              <button type="button" aria-label="Clear filters" onClick={() => { setF("action"); setCat("all"); }} className="ml-auto p-1 rounded hover:bg-white"><X className="w-3.5 h-3.5" /></button>
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
                            <span className="block text-sm font-semibold text-ink leading-snug break-words">{r.to}</span>
                            <span className="block text-xs text-[#5B6B78] truncate"><b className="font-semibold text-ink">{r.type}</b> · {r.docs.join(", ")}</span>
                            <span className="flex flex-wrap items-center gap-2"><StatusPill r={r} /><DueChip r={r} /><span className="ml-auto"><Avatar name={r.owner} /></span></span>
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
