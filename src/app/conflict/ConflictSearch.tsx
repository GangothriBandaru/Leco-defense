import { useState } from "react";
import { Info, Plus, X, AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { TONE_PILL } from "../tracker/trackerData";
import {
  type ConflictRecord, type Party, type PartyState, type SearchResult, type MatchDetail,
  STATE_META, OVERALL_META, partyState, overallState,
  recordResult, resolveMatch, recordGcDecision, clearResult, addOtherParty, removeOtherParty,
} from "./conflictStore";

const field = "w-full bg-white border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-[#8A98A3] focus:outline-none focus:border-brand";
const btn = "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-line bg-white text-xs font-semibold text-deep hover:bg-wash transition-colors";
const btnP = "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-brand hover:bg-deep text-white text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
const Pill = ({ s }: { s: PartyState }) => <span className={`${TONE_PILL[STATE_META[s][1]]} whitespace-nowrap`}>{STATE_META[s][0]}</span>;
const when = (iso?: string) => iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
const saved = (stored: boolean, msg: string) =>
  toast(stored ? msg : `${msg} for this session only. The browser didn't save it.`);

const RESULT_OPTIONS: [SearchResult, string][] = [
  ["none", "No match found"],
  ["match", "Possible match"],
  ["relationship", "Existing relationship"],
];

/** The attorney records what the firm's conflicts system returned for one party. */
function ResultEditor({ caseId, party, initial, onDone }: {
  caseId: string; party: Party; initial?: { result: SearchResult; match?: MatchDetail }; onDone: (hit: boolean) => void;
}) {
  const [result, setResult] = useState<SearchResult | "">(initial?.result ?? "");
  const [m, setM] = useState<MatchDetail>(initial?.match ?? { name: "" });
  const [err, setErr] = useState("");
  const hit = result === "match" || result === "relationship";
  const submit = () => {
    if (!result) return setErr("Choose what the search returned.");
    if (hit && !m.name.trim()) return setErr("Enter the matching name from the firm's records.");
    const clean = hit ? { name: m.name.trim(), matter: m.matter?.trim() || undefined, identifiers: m.identifiers?.trim() || undefined, distinguishing: m.distinguishing?.trim() || undefined } : undefined;
    saved(recordResult(caseId, party.key, party.name, result, clean), "Search result recorded");
    onDone(hit);
  };
  const id = `cr-${party.key.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <div className="bg-offwhite border border-line rounded-xl p-4 space-y-3">
      <fieldset>
        <legend className="eyebrow mb-2">What did the firm's conflicts search return for {party.name}?</legend>
        <div className="flex flex-wrap gap-2">
          {RESULT_OPTIONS.map(([k, l]) => (
            <label key={k} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm cursor-pointer ${result === k ? "border-brand bg-tint text-deep font-semibold" : "border-line bg-white text-ink hover:border-[#CBD7DE]"}`}>
              <input type="radio" name={`${id}-result`} value={k} checked={result === k} onChange={() => { setResult(k); setErr(""); }} className="accent-[#3FB5D7]" />{l}
            </label>
          ))}
        </div>
      </fieldset>
      {hit && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block" htmlFor={`${id}-name`}><span className="eyebrow block mb-1">Matching name in firm records *</span>
            <input id={`${id}-name`} className={field} value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} placeholder="As it appears in the record" /></label>
          <label className="block" htmlFor={`${id}-matter`}><span className="eyebrow block mb-1">{result === "relationship" ? "Relationship" : "Prior matter"}</span>
            <input id={`${id}-matter`} className={field} value={m.matter ?? ""} onChange={(e) => setM({ ...m, matter: e.target.value })} placeholder={result === "relationship" ? "e.g. Existing client, open matters" : "e.g. Matter number, role, status"} /></label>
          <label className="block" htmlFor={`${id}-ids`}><span className="eyebrow block mb-1">Identifying details from the record</span>
            <textarea id={`${id}-ids`} rows={2} className={field} value={m.identifiers ?? ""} onChange={(e) => setM({ ...m, identifiers: e.target.value })} placeholder="Only what the review needs, e.g. birth year, city" /></label>
          <label className="block" htmlFor={`${id}-dist`}><span className="eyebrow block mb-1">What supports or distinguishes it</span>
            <textarea id={`${id}-dist`} rows={2} className={field} value={m.distinguishing ?? ""} onChange={(e) => setM({ ...m, distinguishing: e.target.value })} placeholder="e.g. Different middle initial and birth year" /></label>
        </div>
      )}
      {err && <p role="alert" className="text-xs text-[#B91C1C]">{err}</p>}
      <div className="flex items-center justify-end gap-2">
        <button type="button" className="h-8 px-3 rounded-lg text-sm font-medium text-ink hover:bg-tint" onClick={() => onDone(false)}>Cancel</button>
        <button type="button" className={btnP} onClick={submit}>Record result</button>
      </div>
    </div>
  );
}

function resultText(s: PartyState, r: ConflictRecord["checks"][string] | undefined) {
  if (s === "missing") return <span className="text-[#8A98A3]">Add the name in Case Details to search it</span>;
  if (s === "pending") return <span className="text-[#5B6B78]">{r ? "Name changed since the last search" : "Not searched yet"}</span>;
  if (!r || r.result === "none") return "No match found";
  const what = r.result === "match" ? "Possible match" : "Existing relationship";
  return <>{what}: <b className="font-semibold">{r.match?.name}</b>{r.match?.matter ? `, ${r.match.matter}` : ""}</>;
}

export function ConflictSearch({ caseId, parties, record }: { caseId: string; parties: Party[]; record: ConflictRecord }) {
  const states = parties.map((p) => partyState(p, record.checks[p.key]));
  const overall = overallState(states);
  const searched = states.filter((s) => s !== "pending" && s !== "missing").length;
  // Parties with a recorded possible match or relationship, resolved or not.
  const reviewable = (i: number) => !["pending", "missing", "clear"].includes(states[i]);
  const hits = states.filter((_, i) => reviewable(i)).length;
  const [editing, setEditing] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const firstOpen = parties.find((_, i) => states[i] === "review" || states[i] === "assess" || states[i] === "escalated");
  const selIx = parties.findIndex((p) => p.key === sel);
  const current = selIx >= 0 && reviewable(selIx) ? parties[selIx] : firstOpen ?? parties.find((_, i) => reviewable(i));
  const cur = current && record.checks[current.key];
  const curState = current ? partyState(current, cur) : undefined;
  const [adding, setAdding] = useState(false);
  const [other, setOther] = useState({ name: "", role: "" });
  const [otherErr, setOtherErr] = useState("");

  const pendingN = states.filter((s) => s === "pending" || s === "missing").length;
  const reviewN = states.filter((s) => s === "review" || s === "assess").length;
  const escalatedN = states.filter((s) => s === "escalated").length;
  const gate = overall === "clear" ? "Every party is searched and every match is resolved. The conflict check is clear."
    : overall === "conflict" ? "A conflict is confirmed. The matter can't be opened; follow the firm's conflict procedure."
    : [pendingN && `${pendingN} part${pendingN === 1 ? "y" : "ies"} not searched`, reviewN && `${reviewN} awaiting attorney review`, escalatedN && `${escalatedN} with general counsel`].filter(Boolean).join(" · ") + ". The case can't be treated as cleared yet.";

  return (
    <section aria-labelledby="conflict-title" className="lg-card overflow-hidden min-w-0">
      <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-line flex-wrap">
        <div className="min-w-0">
          <h2 id="conflict-title" className="section-header">Conflict search</h2>
          <p className="secondary-text mt-0.5">
            Parties are checked against the firm's records. {searched} of {parties.length} searched
            {searched > 0 && <> · {hits} possible match{hits === 1 ? "" : "es"}</>}
          </p>
        </div>
        <span className={TONE_PILL[OVERALL_META[overall][1]]} role="status">{OVERALL_META[overall][0]}</span>
      </div>

      <div className="px-6 py-5 space-y-5">
        <p className="flex items-start gap-1.5 text-xs text-[#5B6B78]">
          <Info className="w-3.5 h-3.5 shrink-0 mt-px" strokeWidth={1.75} />
          No conflicts database is connected, so nothing is searched automatically. Run each name through the firm's conflicts system and record what it returns.
        </p>

        <div className="border border-line rounded-xl overflow-hidden">
          <div className="hidden md:grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_152px_96px] gap-4 px-4 py-2.5 bg-offwhite border-b border-line eyebrow">
            <span>Party</span><span>Result</span><span>Status</span><span className="sr-only">Actions</span>
          </div>
          <ul className="divide-y divide-line">
            {parties.map((p, i) => {
              const s = states[i], r = record.checks[p.key], on = current?.key === p.key && reviewable(i);
              return (
                <li key={p.key} className={on ? "bg-wash" : ""}>
                  <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_152px_96px] gap-x-4 gap-y-1.5 px-4 py-3 md:items-center">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-ink break-words">{p.name || <span className="font-normal text-[#8A98A3]">Not provided</span>}</div>
                      <div className="text-xs text-[#5B6B78]">{p.label}</div>
                    </div>
                    <div className="text-sm text-ink min-w-0 break-words">{resultText(s, r)}</div>
                    <div><Pill s={s} /></div>
                    <div className="flex md:justify-end gap-1.5">
                      {s === "missing" ? null : s === "pending" ? (
                        <button type="button" className={btn} onClick={() => setEditing(p.key)} aria-label={`Record result for ${p.name}`}>Record</button>
                      ) : reviewable(i) ? (
                        <button type="button" className={btn} aria-pressed={on} onClick={() => setSel(p.key)} aria-label={`Review ${p.name}`}>Review</button>
                      ) : (
                        <button type="button" className={btn} onClick={() => setEditing(p.key)} aria-label={`Edit result for ${p.name}`}>Edit</button>
                      )}
                      {p.role === "other" && (
                        <button type="button" aria-label={`Remove ${p.name}`} title="Remove party" className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-[#5B6B78] hover:bg-tint"
                          onClick={() => saved(removeOtherParty(caseId, p.key.slice(6)), "Party removed")}><X className="w-4 h-4" /></button>
                      )}
                    </div>
                  </div>
                  {editing === p.key && (
                    <div className="px-4 pb-4">
                      <ResultEditor caseId={caseId} party={p} initial={s === "pending" ? undefined : r} onDone={(hit) => { setEditing(null); if (hit) setSel(p.key); }} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="px-4 py-3 border-t border-line bg-white">
            {adding ? (
              <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-end">
                <label className="block" htmlFor="cp-name"><span className="eyebrow block mb-1">Name</span><input id="cp-name" className={field} value={other.name} onChange={(e) => setOther({ ...other, name: e.target.value })} placeholder="Person or organization" /></label>
                <label className="block" htmlFor="cp-role"><span className="eyebrow block mb-1">Role in the case</span><input id="cp-role" className={field} value={other.role} onChange={(e) => setOther({ ...other, role: e.target.value })} placeholder="e.g. Plaintiff's employer" /></label>
                <div className="flex gap-2">
                  <button type="button" className="h-9 px-3 rounded-lg text-sm font-medium text-ink hover:bg-tint" onClick={() => { setAdding(false); setOtherErr(""); }}>Cancel</button>
                  <button type="button" className={`${btnP} h-9`} onClick={() => {
                    if (!other.name.trim() || !other.role.trim()) return setOtherErr("Enter the party's name and role.");
                    saved(addOtherParty(caseId, other.name.trim(), other.role.trim()), "Party added");
                    setOther({ name: "", role: "" }); setAdding(false); setOtherErr("");
                  }}>Add</button>
                </div>
                {otherErr && <p role="alert" className="text-xs text-[#B91C1C] sm:col-span-3">{otherErr}</p>}
              </div>
            ) : (
              <button type="button" className="inline-flex items-center gap-1.5 text-sm font-semibold text-deep hover:text-ink" onClick={() => setAdding(true)}><Plus className="w-4 h-4" />Add another party</button>
            )}
          </div>
        </div>

        {current && cur && curState && (
          <div className="bg-offwhite border border-line rounded-xl p-4 space-y-4" aria-live="polite">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <h3 className="card-title">{cur.result === "relationship" ? "Relationship detail" : "Possible match detail"}</h3>
                <p className="text-xs text-[#5B6B78] mt-0.5">{current.label} · recorded by {cur.recordedBy} on {when(cur.recordedAt)}</p>
              </div>
              <Pill s={curState} />
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-[170px_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
              <dt className="eyebrow sm:pt-0.5">Party on this case</dt><dd className="text-ink break-words">{current.name}</dd>
              <dt className="eyebrow sm:pt-0.5">Firm record</dt><dd className="text-ink font-semibold break-words">{cur.match?.name}</dd>
              <dt className="eyebrow sm:pt-0.5">{cur.result === "relationship" ? "Relationship" : "Prior matter"}</dt><dd className="text-ink break-words">{cur.match?.matter || <span className="text-[#8A98A3]">Not recorded</span>}</dd>
              <dt className="eyebrow sm:pt-0.5">Identifying details</dt><dd className="text-ink break-words whitespace-pre-wrap">{cur.match?.identifiers || <span className="text-[#8A98A3]">Not recorded</span>}</dd>
              <dt className="eyebrow sm:pt-0.5">Supports or distinguishes</dt><dd className="text-ink break-words whitespace-pre-wrap">{cur.match?.distinguishing || <span className="text-[#8A98A3]">Not recorded</span>}</dd>
            </dl>

            <fieldset className="border-t border-line pt-4">
              <legend className="eyebrow mb-2">Attorney resolution</legend>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Conflict resolution">
                {([["diff", cur.result === "relationship" ? "Not a conflict" : "Different person, no conflict"], ["same", cur.result === "relationship" ? "Possible conflict, escalate to general counsel" : "Same person, escalate to general counsel"]] as const).map(([k, l]) => (
                  <label key={k} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${cur.resolution === k ? "border-brand bg-tint text-deep font-semibold" : "border-line bg-white text-ink hover:border-[#CBD7DE]"}`}>
                    <input type="radio" name={`res-${current.key}`} checked={cur.resolution === k} onChange={() => saved(resolveMatch(caseId, current.key, k), "Resolution recorded")} className="accent-[#3FB5D7]" />{l}
                  </label>
                ))}
              </div>
              {cur.resolution && <p className="text-xs text-[#5B6B78] mt-2">Recorded by {cur.resolvedBy} on {when(cur.resolvedAt)}.</p>}
            </fieldset>

            {cur.resolution === "diff" && (
              <p className="flex items-start gap-2 text-sm text-[#15803D]"><CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />Marked as no conflict. This party no longer blocks the check.</p>
            )}
            {cur.resolution === "same" && (
              <div className={`rounded-xl border px-4 py-3 space-y-3 ${cur.gc === "conflict" ? "bg-[#FEF2F2] border-[#FBD5D5]" : cur.gc === "cleared" ? "bg-[#ECFDF3] border-[#D1FADF]" : "bg-[#FFF7ED] border-[#FDE6C8]"}`}>
                <p className="flex items-start gap-2 text-sm text-ink">
                  {cur.gc === "conflict" ? <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0 text-[#B42318]" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-[#B45309]" />}
                  <span>
                    {cur.gc === "cleared" ? <>General counsel cleared this match on {when(cur.gcAt)}.</>
                      : cur.gc === "conflict" ? <><b>Conflict confirmed</b> by general counsel on {when(cur.gcAt)}. The matter can't be opened.</>
                      : <><b>Escalated to general counsel.</b> Further review is required; the case stays blocked until general counsel's decision is recorded. Nothing has been sent; tell general counsel directly.</>}
                  </span>
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="eyebrow">General counsel decision</span>
                  <button type="button" className={btn} aria-pressed={cur.gc === "cleared"} onClick={() => saved(recordGcDecision(caseId, current.key, "cleared"), "General counsel decision recorded")}>Cleared, no conflict</button>
                  <button type="button" className={btn} aria-pressed={cur.gc === "conflict"} onClick={() => saved(recordGcDecision(caseId, current.key, "conflict"), "General counsel decision recorded")}>Conflict confirmed</button>
                </div>
              </div>
            )}
            <div className="flex justify-end">
              <button type="button" className="text-xs font-semibold text-[#5B6B78] hover:text-ink underline" onClick={() => saved(clearResult(caseId, current.key), "Search result cleared")}>Clear this result</button>
            </div>
          </div>
        )}

        <div className={`rounded-xl border px-4 py-3 text-sm ${overall === "clear" ? "bg-[#ECFDF3] border-[#D1FADF] text-[#15803D]" : overall === "conflict" || overall === "escalated" ? "bg-[#FEF2F2] border-[#FBD5D5] text-[#B42318]" : "bg-wash border-line text-ink"}`}>
          {gate}
        </div>
      </div>
    </section>
  );
}
