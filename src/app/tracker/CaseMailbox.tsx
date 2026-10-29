import { useState } from "react";
import { Inbox, Bell, CheckCheck, FileText, Send, Copy, Landmark, Mail, Search, Paperclip, ArrowRight } from "lucide-react";
import { type CaseCtx, type DocRequest, type MailMsg, fmtShort } from "./trackerData";
import { markThreadRead } from "./trackerStore";
import { Thread, Tag, KIND_TONE, StatusPill, DueChip, NotConnected } from "./TrackerShared";

const FOLDERS: [string, string, typeof Inbox, (m: MailMsg) => boolean][] = [
  ["inbox", "Inbox", Inbox, (m) => m.dir === "in"],
  ["needs", "Needs reply", Bell, (m) => m.dir === "in" && !m.replied && ["Notice", "Reply", "Quote", "Court notice"].includes(m.kind)],
  ["ack", "Acknowledgments", CheckCheck, (m) => m.kind === "Acknowledgment"],
  ["resp", "Records received", FileText, (m) => m.kind === "Response"],
  ["sent", "Sent", Send, (m) => m.dir === "out"],
  ["drafts", "Drafts", Copy, (m) => m.dir === "draft"],
  ["court", "Court notices", Landmark, (m) => m.kind === "Court notice"],
  ["all", "All mail", Mail, () => true],
];
const t = (m: MailMsg) => +new Date(m.at);

export function CaseMailbox({ ctx, mail, requests, onOpenRequest }: {
  ctx: CaseCtx; mail: MailMsg[]; requests: DocRequest[]; onOpenRequest: (id: string) => void;
}) {
  const [folder, setFolder] = useState("inbox");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState("");
  const fd = FOLDERS.find((x) => x[0] === folder) ?? FOLDERS[0];
  const qq = q.trim().toLowerCase();
  const match = (m: MailMsg) => fd[3](m) && (!qq || `${m.subject} ${m.fromN} ${m.toN} ${m.body}`.toLowerCase().includes(qq));
  const keyOf = (m: MailMsg) => m.rid ?? m.id;
  const threadOf = (k: string) => mail.filter((m) => keyOf(m) === k).sort((a, b) => t(a) - t(b));
  const threads = [...new Set(mail.filter(match).map(keyOf))]
    .map((k) => { const L = threadOf(k), M = L.filter(match); return { k, L, last: M[M.length - 1], unread: L.some((m) => m.unread) }; })
    .sort((a, b) => t(b.last) - t(a.last));
  const current = threads.find((x) => x.k === sel) ?? threads[0];
  const req = current && requests.find((r) => r.id === current.k);
  const count = (x: (typeof FOLDERS)[number]) => { const L = mail.filter(x[3]); return x[0] === "inbox" ? L.filter((m) => m.unread).length : L.length; };
  const pick = (k: string) => {
    setSel(k);
    markThreadRead(ctx.caseId, k);
    if (window.innerWidth < 1024) window.setTimeout(() => document.getElementById("mail-read")?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  };

  return (
    <div className="space-y-3">
      <NotConnected />
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)] xl:grid-cols-[190px_minmax(280px,340px)_minmax(0,1fr)] gap-4 items-start">
        <nav aria-label="Mail folders" className="hidden xl:flex flex-col gap-0.5 sticky top-[150px]">
          {FOLDERS.map((x) => {
            const I = x[2], n = count(x), on = x[0] === folder;
            return (
              <button key={x[0]} type="button" onClick={() => { setFolder(x[0]); setSel(""); }} aria-current={on ? "true" : undefined}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-left ${on ? "bg-tint text-deep font-semibold" : "text-ink hover:bg-wash"}`}>
                <I className="w-4 h-4 shrink-0" strokeWidth={1.75} /><span className="flex-1">{x[1]}</span>
                {n > 0 && <span className={`text-[11px] font-semibold px-1.5 rounded-full ${on ? "bg-white" : "bg-track"}`}>{n}</span>}
              </button>
            );
          })}
          <p className="text-xs text-[#5B6B78] border-t border-line mt-2 pt-3 px-2.5">Only mail for <b className="text-ink">{ctx.caseName}</b>, filed by request.</p>
        </nav>

        <section className="space-y-2.5 min-w-0">
          <label className="xl:hidden block">
            <span className="sr-only">Folder</span>
            <select value={folder} onChange={(e) => { setFolder(e.target.value); setSel(""); }} className="w-full bg-white border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand">
              {FOLDERS.map((x) => <option key={x[0]} value={x[0]}>{x[1]}{count(x) ? ` (${count(x)})` : ""}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 bg-white border border-line rounded-lg px-3 focus-within:border-brand">
            <Search className="w-4 h-4 text-[#8A98A3]" /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search case mail" className="flex-1 min-w-0 py-2 text-sm bg-transparent outline-none" />
          </label>
          <div className="flex items-baseline justify-between px-0.5"><b className="text-sm font-semibold text-ink">{fd[1]}</b><span className="text-xs text-[#5B6B78]">{threads.length} conversation{threads.length === 1 ? "" : "s"}</span></div>
          <div className="lg-card overflow-hidden lg:max-h-[720px] lg:overflow-y-auto divide-y divide-line">
            {threads.length ? threads.map((th) => {
              const m = th.last, r = requests.find((x) => x.id === th.k), on = current?.k === th.k;
              return (
                <button key={th.k} type="button" onClick={() => pick(th.k)} aria-pressed={on} className={`w-full flex gap-2.5 text-left px-3.5 py-3 ${on ? "bg-tint" : "hover:bg-wash"}`}>
                  <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${th.unread ? "bg-brand" : ""}`} aria-label={th.unread ? "Unread" : undefined} />
                  <span className="flex-1 min-w-0 space-y-0.5">
                    <span className="flex justify-between gap-2 text-[13px]">
                      <span className={`truncate ${th.unread ? "font-semibold text-ink" : "text-ink"}`}>{m.dir === "in" ? m.fromN || m.fromE || "Unknown sender" : `To: ${m.toN || m.toE || "—"}`}</span>
                      <span className="text-[11px] text-[#5B6B78] whitespace-nowrap">{fmtShort(m.at)}</span>
                    </span>
                    <span className={`block text-[13.5px] truncate ${th.unread ? "font-semibold text-ink" : "text-ink"}`}>{r ? r.to : m.subject}</span>
                    <span className="block text-xs text-[#5B6B78] truncate">{m.body.replace(/\s+/g, " ").slice(0, 90)}</span>
                    <span className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <Tag text={m.kind} tone={KIND_TONE[m.kind]} />
                      {r && <span className="rounded-md bg-track px-1.5 py-px text-[11px] text-ink">{r.cat}</span>}
                      {th.L.length > 1 && <span className="text-[11px] text-[#5B6B78]">{th.L.length} messages</span>}
                      {th.L.some((x) => x.att.length) && <Paperclip className="w-3 h-3 text-[#5B6B78]" />}
                    </span>
                  </span>
                </button>
              );
            }) : (
              <div className="text-center text-sm text-[#5B6B78] py-10 px-4 flex flex-col items-center gap-2">
                <Inbox className="w-7 h-7 text-[#9BDAEC]" /><b className="text-ink">Nothing here</b>
                {folder === "inbox" || folder === "court" || folder === "ack" || folder === "resp" || folder === "needs"
                  ? "Incoming email isn't connected, so only replies and approvals you record appear here."
                  : "No messages in this folder."}
              </div>
            )}
          </div>
        </section>

        <section id="mail-read" className="min-w-0 lg:col-start-2 xl:col-start-3 lg:row-start-1 lg:row-span-2 xl:row-span-1 scroll-mt-[150px]">
          {current ? (
            <div className="lg-card p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="eyebrow">{req ? <>{req.cat} · {req.type} · <span className="mono-ref">{req.id}</span></> : "No linked request"}</div>
                  <h3 className="card-title mt-0.5 break-words">{req ? req.to : current.last.subject}</h3>
                  {req && <div className="flex flex-wrap items-center gap-2 mt-1.5"><StatusPill r={req} /><DueChip r={req} /></div>}
                </div>
                {req && <button type="button" onClick={() => onOpenRequest(req.id)} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-line bg-white text-xs font-semibold text-deep hover:bg-wash">Open request <ArrowRight className="w-3.5 h-3.5" /></button>}
              </div>
              <Thread key={current.k} ctx={ctx} messages={current.L} />
            </div>
          ) : (
            <div className="lg-card p-10 text-center text-sm text-[#5B6B78] flex flex-col items-center gap-2"><Mail className="w-8 h-8 text-[#9BDAEC]" />Select a conversation.</div>
          )}
        </section>
      </div>
    </div>
  );
}
