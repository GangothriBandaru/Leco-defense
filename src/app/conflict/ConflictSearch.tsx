import { Fragment, useState, type ReactNode } from "react";
import { Info, Plus, X, AlertTriangle, CheckCircle2, ShieldAlert, ChevronDown, SearchX } from "lucide-react";
import { toast } from "sonner";
import { TONE_PILL } from "../tracker/trackerData";
import { fmtDay } from "./caseFacts";
import {
  type ConflictRecord, type PartyCheck, type Party, type PartyState, type SearchResult, type MatchDetail, type Resolution, type GcDecision,
  ATTORNEY, STATE_META, OVERALL_META, partyState, overallState, matchDifferences,
  recordResult, resolveMatch, recordGcDecision, reopenDecision, addOtherParty, removeOtherParty,
} from "./conflictStore";

const field = "w-full bg-white border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-[#8A98A3] focus:outline-none focus:border-brand";
const fieldErr = "border-[#B91C1C] focus:border-[#B91C1C]";
const btn = "inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg border border-line bg-white text-xs font-semibold text-deep hover:bg-wash transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
const btnP = "inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg bg-brand hover:bg-deep text-white text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
const btnGhost = "h-8 px-3 rounded-lg text-sm font-medium text-ink hover:bg-tint";
const Pill = ({ s }: { s: PartyState }) => <span className={`${TONE_PILL[STATE_META[s][1]]} whitespace-nowrap`}>{STATE_META[s][0]}</span>;
const when = (iso?: string) => iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";
const saved = (stored: boolean, msg: string) => toast(stored ? msg : `${msg} for this session only. The browser didn't save it.`);
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const NOT_RECORDED = <span className="text-[#8A98A3]">Not recorded</span>;

const RESULT_OPTIONS: [SearchResult, string, string][] = [
  ["none", "No match found", "The firm's system returned nothing for this name."],
  ["match", "Possible match", "A record may be the same person or organization."],
  ["relationship", "Existing relationship", "A known client, adverse party or counsel relationship."],
];

function Labeled({ id, label, required, error, children, className = "" }: { id: string; label: string; required?: boolean; error?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="eyebrow block mb-1">{label}{required && <span className="text-[#B91C1C]"> *</span>}</label>
      {children}
      {error && <p role="alert" className="text-xs text-[#B91C1C] mt-1">{error}</p>}
    </div>
  );
}

/** Records what the firm's conflicts system returned for one party. Nothing is searched from here. */
function RecordDialog({ caseId, party, caseType, initial, onClose }: {
  caseId: string; party: Party; caseType?: string; initial?: PartyCheck; onClose: (hit: boolean) => void;
}) {
  const [result, setResult] = useState<SearchResult | "">(initial?.result ?? "");
  const [m, setM] = useState<MatchDetail>(initial?.match ?? { name: "", partyLocation: party.location });
  const [reviewer, setReviewer] = useState(initial?.reviewer ?? ATTORNEY);
  const [searchedOn, setSearchedOn] = useState(initial?.searchedOn ?? todayIso());
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [escalate, setEscalate] = useState(false);
  const [tried, setTried] = useState(false);
  const hit = result === "match" || result === "relationship";
  const errors: Record<string, string | undefined> = {
    result: !result ? "Choose what the search returned." : undefined,
    name: hit && !m.name.trim() ? "Enter the name as it appears in the firm's record." : undefined,
    reviewer: !reviewer.trim() ? "Enter who ran the search." : undefined,
    searchedOn: !searchedOn ? "Enter the date of the search." : searchedOn > todayIso() ? "The search date can't be in the future." : undefined,
  };
  const err = (k: string) => (tried ? errors[k] : undefined);
  const setF = (k: keyof MatchDetail) => (e: { target: { value: string } }) => setM({ ...m, [k]: e.target.value });
  const submit = () => {
    setTried(true);
    if (Object.values(errors).some(Boolean)) return;
    const clean = Object.fromEntries(Object.entries(m).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]).filter(([, v]) => v)) as unknown as MatchDetail;
    saved(recordResult(caseId, party.key, { searched: party.name, result: result as SearchResult, match: hit ? clean : undefined, reviewer: reviewer.trim(), searchedOn, notes: notes.trim() || undefined, escalate: hit && escalate }), "Search result recorded");
    onClose(hit);
  };
  const id = (k: string) => `rec-${k}`;

  return (
    <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-[70] p-4" onClick={() => onClose(false)}>
      <div role="dialog" aria-modal="true" aria-labelledby="rec-title" className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === "Escape") onClose(false); }}>
        <div className="sticky top-0 z-10 bg-white border-b border-line px-6 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="rec-title" className="section-header">Record search result</h2>
            <p className="secondary-text mt-0.5 break-words"><b className="text-ink font-semibold">{party.name}</b> · {party.label}</p>
          </div>
          <button type="button" onClick={() => onClose(false)} aria-label="Close" className="p-2 hover:bg-tint rounded-lg"><X className="w-5 h-5 text-[#5B6B78]" strokeWidth={1.75} /></button>
        </div>
        <div className="px-6 py-5 space-y-5">
          <p className="flex items-start gap-1.5 text-xs text-[#5B6B78]"><Info className="w-3.5 h-3.5 shrink-0 mt-px" strokeWidth={1.75} />Enter what the firm's conflicts system returned. This records the result; it doesn't run a search.</p>
          <fieldset>
            <legend className="eyebrow mb-2">Search result <span className="text-[#B91C1C]">*</span></legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {RESULT_OPTIONS.map(([k, l, s]) => (
                <label key={k} className={`rounded-lg border px-3 py-2 cursor-pointer transition-colors ${result === k ? "border-brand bg-tint" : "border-line bg-white hover:border-[#CBD7DE]"}`}>
                  <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <input type="radio" name="rec-result" value={k} checked={result === k} onChange={() => setResult(k)} className="accent-[#3FB5D7]" />{l}
                  </span>
                  <span className="block text-xs text-[#5B6B78] mt-0.5 pl-5">{s}</span>
                </label>
              ))}
            </div>
            {err("result") && <p role="alert" className="text-xs text-[#B91C1C] mt-1">{err("result")}</p>}
          </fieldset>

          {hit && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <h3 className="card-title">Existing firm record</h3>
                <Labeled id={id("name")} label="Name on the record" required error={err("name")}><input id={id("name")} className={`${field} ${err("name") ? fieldErr : ""}`} value={m.name} onChange={setF("name")} placeholder="e.g. as listed in the conflicts system" /></Labeled>
                <div className="grid grid-cols-2 gap-3">
                  <Labeled id={id("dob")} label="Date of birth"><input id={id("dob")} className={field} value={m.dob ?? ""} onChange={setF("dob")} placeholder="Date or year" /></Labeled>
                  <Labeled id={id("loc")} label="Location"><input id={id("loc")} className={field} value={m.location ?? ""} onChange={setF("location")} placeholder="City, state" /></Labeled>
                  <Labeled id={id("matter")} label="Previous matter no."><input id={id("matter")} className={field} value={m.matter ?? ""} onChange={setF("matter")} placeholder="Matter number" /></Labeled>
                  <Labeled id={id("mtype")} label="Matter type"><input id={id("mtype")} className={field} value={m.matterType ?? ""} onChange={setF("matterType")} placeholder="e.g. Landlord-tenant" /></Labeled>
                  <Labeled id={id("mstatus")} label="Matter status"><input id={id("mstatus")} className={field} value={m.matterStatus ?? ""} onChange={setF("matterStatus")} placeholder="Open, closed, client" /></Labeled>
                  <Labeled id={id("closed")} label="Closed on"><input id={id("closed")} className={field} value={m.closedOn ?? ""} onChange={setF("closedOn")} placeholder="Date or year" /></Labeled>
                </div>
              </div>
              <div className="space-y-3">
                <h3 className="card-title">Current case party</h3>
                <div><div className="eyebrow mb-1">Name and role</div><p className="text-sm text-ink py-2 break-words"><b className="font-semibold">{party.name}</b> · {party.label}</p></div>
                <Labeled id={id("pdob")} label="Date of birth or age"><input id={id("pdob")} className={field} value={m.partyDob ?? ""} onChange={setF("partyDob")} placeholder="e.g. 1985, or age 41" /></Labeled>
                <Labeled id={id("ploc")} label="Location"><input id={id("ploc")} className={field} value={m.partyLocation ?? ""} onChange={setF("partyLocation")} placeholder="City, state" /></Labeled>
                <label className="flex items-start gap-2 rounded-lg border border-line bg-offwhite px-3 py-2 text-sm text-ink cursor-pointer">
                  <input type="checkbox" checked={escalate} onChange={(e) => setEscalate(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#3FB5D7]" />
                  <span>Same person: escalate to general counsel now</span>
                </label>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Labeled id={id("reviewer")} label="Searched by" required error={err("reviewer")}><input id={id("reviewer")} className={`${field} ${err("reviewer") ? fieldErr : ""}`} value={reviewer} onChange={(e) => setReviewer(e.target.value)} /></Labeled>
            <Labeled id={id("on")} label="Search date" required error={err("searchedOn")}><input id={id("on")} type="date" max={todayIso()} className={`${field} ${err("searchedOn") ? fieldErr : ""}`} value={searchedOn} onChange={(e) => setSearchedOn(e.target.value)} /></Labeled>
            <Labeled id={id("notes")} label="Notes" className="sm:col-span-2"><textarea id={id("notes")} rows={3} className={field} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What supports or distinguishes the match, search terms used" /></Labeled>
          </div>
        </div>
        <div className="sticky bottom-0 bg-white border-t border-line px-6 py-3 flex items-center justify-end gap-2">
          <button type="button" className={btnGhost} onClick={() => onClose(false)}>Cancel</button>
          <button type="button" className={`${btnP} h-9 px-4 text-sm`} onClick={submit}>Record result</button>
        </div>
      </div>
    </div>
  );
}

function resultText(s: PartyState, r: PartyCheck | undefined) {
  if (s === "missing") return <span className="text-[#5B6B78]">Add the name in Case Details before it can be searched</span>;
  if (s === "pending") return <span className="text-[#5B6B78]">{r ? "Name changed since the last search" : "Not searched yet"}</span>;
  if (!r || r.result === "none") return "No match found";
  return <>{r.result === "match" ? "Possible match" : "Existing relationship"}: <b className="font-semibold">{r.match?.name}</b>{r.match?.matter ? `, matter ${r.match.matter}` : ""}</>;
}

const DECISIONS: Record<"match" | "relationship", [Resolution, string][]> = {
  match: [["diff", "Different person, no conflict"], ["same", "Same person, escalate to general counsel"]],
  relationship: [["diff", "Not a conflict"], ["same", "Possible conflict, escalate to general counsel"]],
};

/** Pick an option, then confirm. Picking alone records nothing. */
function ConfirmChoice<T extends string>({ name, legend, options, onConfirm, confirmText }: {
  name: string; legend: string; options: [T, string][]; onConfirm: (v: T) => void; confirmText: (label: string) => string;
}) {
  const [pick, setPick] = useState<T | "">("");
  const [confirming, setConfirming] = useState(false);
  const label = options.find(([k]) => k === pick)?.[1] ?? "";
  return (
    <fieldset className="space-y-3">
      <legend className="eyebrow mb-2">{legend}</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label={legend}>
        {options.map(([k, l]) => (
          <label key={k} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${pick === k ? "border-brand bg-tint text-deep font-semibold" : "border-line bg-white text-ink hover:border-[#CBD7DE]"}`}>
            <input type="radio" name={name} value={k} checked={pick === k} onChange={() => { setPick(k); setConfirming(false); }} className="accent-[#3FB5D7]" />{l}
          </label>
        ))}
      </div>
      {confirming && pick ? (
        <div role="alertdialog" aria-label="Confirm decision" className="rounded-lg border border-brand bg-white px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-ink">{confirmText(label)}</span>
          <span className="flex gap-2">
            <button type="button" className={btnGhost} onClick={() => setConfirming(false)}>Cancel</button>
            <button type="button" className={btnP} onClick={() => { onConfirm(pick); setConfirming(false); setPick(""); }}>Confirm and record</button>
          </span>
        </div>
      ) : (
        <button type="button" className={btnP} disabled={!pick} onClick={() => setConfirming(true)}>Record decision</button>
      )}
    </fieldset>
  );
}

function Compare({ title, rows }: { title: string; rows: [string, ReactNode][] }) {
  return (
    <div className="rounded-xl border border-line bg-white p-4 min-w-0">
      <h4 className="eyebrow mb-2">{title}</h4>
      <dl className="grid grid-cols-[112px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
        {rows.map(([k, v]) => <Fragment key={k}><dt className="text-[#5B6B78]">{k}</dt><dd className="text-ink break-words">{v || NOT_RECORDED}</dd></Fragment>)}
      </dl>
    </div>
  );
}

function MatchDetailCard({ caseId, party, c, s, caseType, onEdit }: { caseId: string; party: Party; c: PartyCheck; s: PartyState; caseType?: string; onEdit: () => void }) {
  const m = c.match ?? { name: "" };
  const diffs = matchDifferences(m, party.name, caseType);
  const [logOpen, setLogOpen] = useState(false);
  const kind = c.result === "relationship" ? "relationship" : "match";
  return (
    <section aria-labelledby="pm-title" className="rounded-xl border border-line bg-offwhite p-4 sm:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 id="pm-title" className="card-title">{kind === "match" ? "Possible Match Detail" : "Existing Relationship Detail"}</h3>
          <p className="text-xs text-[#5B6B78] mt-0.5 break-words">{party.name} · {party.label} · searched by {c.reviewer} on {fmtDay(c.searchedOn)}</p>
        </div>
        <Pill s={s} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Compare title="Existing firm record" rows={[
          ["Name", <b className="font-semibold">{m.name}</b>],
          ["Date of birth", m.dob],
          ["Location", m.location],
          ["Previous matter", m.matter],
          ["Matter type", m.matterType],
          ["Status", [m.matterStatus, m.closedOn && `closed ${m.closedOn}`].filter(Boolean).join(", ")],
        ]} />
        <Compare title="Current case party" rows={[
          ["Name", <b className="font-semibold">{party.name}</b>],
          ["Date of birth / age", m.partyDob],
          ["Location", m.partyLocation],
          ["Role", party.label],
        ]} />
      </div>

      <div>
        <div className="eyebrow mb-1.5">Differences noted</div>
        {diffs.length ? (
          <div className="flex flex-wrap gap-1.5">{diffs.map((d) => <span key={d} className="pill pill-progress">{d}</span>)}</div>
        ) : <p className="text-sm text-[#5B6B78]">None found in what was recorded.</p>}
        <p className="text-xs text-[#5B6B78] mt-1.5">Differences help the review but don't prove these are different people.</p>
      </div>
      {c.notes && <div><div className="eyebrow mb-1">Notes</div><p className="text-sm text-ink whitespace-pre-wrap break-words">{c.notes}</p></div>}

      <div className="border-t border-line pt-4 space-y-3">
        {!c.resolution ? (
          <ConfirmChoice name={`res-${party.key}`} legend="Attorney resolution" options={DECISIONS[kind]}
            confirmText={(l) => `Record "${l}" for ${party.name}?`}
            onConfirm={(v) => saved(resolveMatch(caseId, party.key, v), "Decision recorded")} />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-ink">
                <span className="eyebrow mr-2">Attorney resolution</span>
                <b className="font-semibold">{DECISIONS[kind].find(([k]) => k === c.resolution)?.[1]}</b>
                <span className="text-[#5B6B78]"> · {c.resolvedBy}, {when(c.resolvedAt)}</span>
              </p>
              <button type="button" className={btn} onClick={() => saved(reopenDecision(caseId, party.key), "Decision reopened")}>Reopen decision</button>
            </div>
            {c.resolution === "diff" && (
              <p className="flex items-start gap-2 text-sm text-[#15803D]"><CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />Recorded as no conflict. The match details stay on file.</p>
            )}
            {c.resolution === "same" && (
              <div className={`rounded-xl border px-4 py-3 space-y-3 ${c.gc === "conflict" ? "bg-[#FEF2F2] border-[#FBD5D5]" : c.gc === "cleared" ? "bg-[#ECFDF3] border-[#D1FADF]" : "bg-[#FFF7ED] border-[#FDE6C8]"}`}>
                <p className="flex items-start gap-2 text-sm text-ink">
                  {c.gc === "conflict" ? <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0 text-[#B42318]" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-[#B45309]" />}
                  <span>
                    {c.gc === "cleared" ? <>General counsel cleared this on {when(c.gcAt)}.</>
                      : c.gc === "conflict" ? <><b>Conflict confirmed</b> by general counsel on {when(c.gcAt)}. The matter can't be opened.</>
                      : <><b>Escalated to general counsel.</b> The conflict check stays open until general counsel's decision is recorded. Nothing is sent from here; refer it to general counsel through the firm's process.</>}
                  </span>
                </p>
                {!c.gc && (
                  <ConfirmChoice<GcDecision> name={`gc-${party.key}`} legend="General counsel decision" options={[["cleared", "Cleared, no conflict"], ["conflict", "Conflict confirmed"]]}
                    confirmText={(l) => `Record general counsel's decision: "${l}"?`}
                    onConfirm={(v) => saved(recordGcDecision(caseId, party.key, v), "General counsel decision recorded")} />
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap border-t border-line pt-3">
        <button type="button" aria-expanded={logOpen} onClick={() => setLogOpen(!logOpen)} className="inline-flex items-center gap-1 text-xs font-semibold text-deep hover:text-ink">
          Review history ({c.log.length}) <ChevronDown className={`w-3.5 h-3.5 transition-transform ${logOpen ? "rotate-180" : ""}`} />
        </button>
        <button type="button" className="text-xs font-semibold text-[#5B6B78] hover:text-ink underline" onClick={onEdit}>Edit search result</button>
      </div>
      {logOpen && (
        <ol className="space-y-1.5 text-xs">
          {[...c.log].reverse().map((l, i) => <li key={i} className="flex gap-3"><span className="text-[#5B6B78] whitespace-nowrap tabular-nums">{when(l.at)}</span><span className="text-ink">{l.text} · {l.by}</span></li>)}
        </ol>
      )}
    </section>
  );
}

export function ConflictSearch({ caseId, parties, record, caseType, onAddNames }: {
  caseId: string; parties: Party[]; record: ConflictRecord; caseType?: string; onAddNames: () => void;
}) {
  const states = parties.map((p) => partyState(p, record.checks[p.key]));
  const overall = overallState(states);
  const searched = states.filter((s) => s !== "pending" && s !== "missing").length;
  // Parties whose recorded result is a possible match or relationship, resolved or not.
  const reviewable = (i: number) => !["pending", "missing", "clear"].includes(states[i]);
  const [dialog, setDialog] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const selIx = parties.findIndex((p) => p.key === sel);
  const firstOpen = parties.find((_, i) => states[i] === "review" || states[i] === "escalated");
  const current = selIx >= 0 && reviewable(selIx) ? parties[selIx] : firstOpen ?? parties.find((_, i) => reviewable(i));
  const curCheck = current && record.checks[current.key];
  const dialogParty = parties.find((p) => p.key === dialog);
  const [adding, setAdding] = useState(false);
  const [other, setOther] = useState({ name: "", role: "", details: "", now: "later" });
  const [otherTried, setOtherTried] = useState(false);

  const pendingN = states.filter((s) => s === "pending").length;
  const missingN = states.filter((s) => s === "missing").length;
  const reviewN = states.filter((s) => s === "review").length;
  const escalatedN = states.filter((s) => s === "escalated").length;
  const gate = overall === "clear" ? "Every party is searched and every possible match is resolved. The conflict check is cleared."
    : overall === "conflict" ? "A conflict is confirmed. The matter can't be opened; follow the firm's conflict procedure."
    : [missingN && `${missingN} name${missingN === 1 ? "" : "s"} not provided`, pendingN && `${pendingN} not searched`, reviewN && `${reviewN} awaiting attorney review`, escalatedN && `${escalatedN} escalated to general counsel`].filter(Boolean).join(" · ") + ". The case can't be treated as cleared yet.";

  const addParty = () => {
    setOtherTried(true);
    if (!other.name.trim() || !other.role.trim()) return;
    const stored = addOtherParty(caseId, { name: other.name.trim(), role: other.role.trim(), details: other.details.trim() || undefined });
    saved(stored, "Party added");
    if (other.now === "now") {
      // The new party is the last one added for this case.
      window.setTimeout(() => setDialog(`__last__`), 0);
    }
    setOther({ name: "", role: "", details: "", now: "later" }); setAdding(false); setOtherTried(false);
  };
  const lastOther = record.others[record.others.length - 1];
  const openParty = dialog === "__last__" && lastOther ? parties.find((p) => p.key === `other:${lastOther.id}`) : dialogParty;

  return (
    <section aria-labelledby="conflict-title" className="lg-card overflow-hidden min-w-0">
      <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-line flex-wrap">
        <div className="min-w-0">
          <h2 id="conflict-title" className="section-header">Conflict Search</h2>
          <p className="secondary-text mt-0.5">Parties are checked against the firm's records. <span className="text-ink font-medium">{searched} of {parties.length} searched</span></p>
        </div>
        <span className={TONE_PILL[OVERALL_META[overall][1]]} role="status" aria-label={`Conflict check: ${OVERALL_META[overall][0]}`}>{OVERALL_META[overall][0]}</span>
      </div>

      <div className="px-6 py-5 space-y-5">
        <p className="flex items-start gap-1.5 text-xs text-[#5B6B78]">
          <Info className="w-3.5 h-3.5 shrink-0 mt-px" strokeWidth={1.75} />
          No firm conflicts database is connected, so nothing is searched from here. Run each name through the firm's conflicts system, then record what it returned.
        </p>

        <div className="border border-line rounded-xl overflow-hidden bg-white">
          <div className="hidden md:grid grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_148px_92px] gap-4 px-4 py-2.5 bg-offwhite border-b border-line eyebrow">
            <span>Party</span><span>Result</span><span>Status</span><span className="text-right">Action</span>
          </div>
          <ul className="divide-y divide-line">
            {parties.map((p, i) => {
              const s = states[i], r = record.checks[p.key], on = current?.key === p.key;
              return (
                <li key={p.key} className={on ? "bg-wash" : ""}>
                  <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_148px_92px] gap-x-4 gap-y-1.5 px-4 py-3 md:items-center">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-ink break-words">{p.name || <span className="font-normal text-[#8A98A3]">Name not provided</span>}</div>
                      <div className="text-xs text-[#5B6B78] break-words">{p.label}{p.details ? ` · ${p.details}` : ""}</div>
                    </div>
                    <div className="text-sm text-ink min-w-0 break-words">{resultText(s, r)}</div>
                    <div><Pill s={s} /></div>
                    <div className="flex md:justify-end items-center gap-1">
                      {s === "missing" ? (
                        <button type="button" className={btn} onClick={onAddNames} aria-label={`Add the ${p.label.toLowerCase()} name in Case Details`}>Add name</button>
                      ) : s === "pending" ? (
                        <button type="button" className={btnP} onClick={() => setDialog(p.key)} aria-label={`Record result for ${p.name}`}>Record</button>
                      ) : reviewable(i) ? (
                        <button type="button" className={btn} aria-pressed={on} onClick={() => { setSel(p.key); window.setTimeout(() => document.getElementById("pm-title")?.scrollIntoView({ behavior: "smooth", block: "center" }), 30); }} aria-label={`Review ${p.name}`}>Review</button>
                      ) : (
                        <button type="button" className={btn} onClick={() => setDialog(p.key)} aria-label={`Edit result for ${p.name}`}>Edit</button>
                      )}
                      {p.role === "other" && (
                        <button type="button" aria-label={`Remove ${p.name}`} title="Remove party" className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-[#5B6B78] hover:bg-tint"
                          onClick={() => saved(removeOtherParty(caseId, p.key.slice(6)), "Party removed")}><X className="w-4 h-4" /></button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="px-4 py-3 border-t border-line">
            {adding ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Labeled id="cp-name" label="Party name" required error={otherTried && !other.name.trim() ? "Enter the party's name." : undefined}>
                    <input id="cp-name" className={field} value={other.name} onChange={(e) => setOther({ ...other, name: e.target.value })} placeholder="Person or organization" />
                  </Labeled>
                  <Labeled id="cp-role" label="Role or type" required error={otherTried && !other.role.trim() ? "Enter the party's role." : undefined}>
                    <input id="cp-role" className={field} value={other.role} onChange={(e) => setOther({ ...other, role: e.target.value })} placeholder="e.g. Plaintiff's employer, co-defendant" />
                  </Labeled>
                  <Labeled id="cp-details" label="Relevant details"><input id="cp-details" className={field} value={other.details} onChange={(e) => setOther({ ...other, details: e.target.value })} placeholder="e.g. Location, how they connect to the case" /></Labeled>
                  <Labeled id="cp-now" label="Search status">
                    <select id="cp-now" className={field} value={other.now} onChange={(e) => setOther({ ...other, now: e.target.value })}>
                      <option value="later">Not searched yet</option>
                      <option value="now">Searched; record the result now</option>
                    </select>
                  </Labeled>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" className={btnGhost} onClick={() => { setAdding(false); setOtherTried(false); }}>Cancel</button>
                  <button type="button" className={btnP} onClick={addParty}>Add party</button>
                </div>
              </div>
            ) : (
              <button type="button" className="inline-flex items-center gap-1.5 text-sm font-semibold text-deep hover:text-ink" onClick={() => setAdding(true)}><Plus className="w-4 h-4" />Add another party</button>
            )}
          </div>
        </div>

        {current && curCheck ? (
          <MatchDetailCard key={current.key} caseId={caseId} party={current} c={curCheck} s={partyState(current, curCheck)} caseType={caseType} onEdit={() => setDialog(current.key)} />
        ) : (
          <section aria-labelledby="pm-title" className="rounded-xl border border-dashed border-line bg-white px-5 py-6 text-center">
            <SearchX className="w-6 h-6 text-[#9BDAEC] mx-auto mb-1.5" strokeWidth={1.75} />
            <h3 id="pm-title" className="card-title">Possible Match Detail</h3>
            <p className="text-sm text-[#5B6B78] mt-1">No possible matches recorded. When a party's search returns a possible match, it appears here for review.</p>
          </section>
        )}

        <div className={`rounded-xl border px-4 py-3 text-sm ${overall === "clear" ? "bg-[#ECFDF3] border-[#D1FADF] text-[#15803D]" : overall === "conflict" || overall === "escalated" ? "bg-[#FEF2F2] border-[#FBD5D5] text-[#B42318]" : "bg-wash border-line text-ink"}`}>
          {gate}
        </div>
      </div>

      {openParty && (
        <RecordDialog key={openParty.key} caseId={caseId} party={openParty} caseType={caseType}
          initial={partyState(openParty, record.checks[openParty.key]) === "pending" ? undefined : record.checks[openParty.key]}
          onClose={(hit) => { const k = openParty.key; setDialog(null); if (hit) setSel(k); }} />
      )}
    </section>
  );
}
