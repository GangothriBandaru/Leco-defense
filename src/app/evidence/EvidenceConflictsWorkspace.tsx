import { Fragment, useEffect, useMemo, useState } from "react";
import { GitCompareArrows, Search, FileSearch, CheckSquare, Square, ArrowRight, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { type CaseEvidence, type Conflict, type Stance, type Topic, type Severity, type Effect, MATRIX_COLS } from "./caseEvidence";
import { useCaseDecisions, toggleStep, takeFocus } from "./decisionStore";
import { Badge, SEVERITY_PILL, EFFECT_PILL, Tabs, StatementCard, Notes, NotesLegend, DecisionPanel, Empty } from "./EvidenceShared";

const DECISIONS = [
  "Use to impeach at deposition or trial",
  "Use in motion or mediation statement",
  "Investigate further",
  "Address with client (privileged)",
  "Disclose risk to carrier",
  "Not material",
];
const STANCE_CELL: Record<Stance | "mixed" | "none", [string, string]> = {
  plaintiff: ["bg-[#FFF4E5] border-[#F6D9A8]", "Supports plaintiff"],
  defense: ["bg-[#E9F8EF] border-[#BFE6CD]", "Supports defense"],
  self: ["bg-[#F3EEFB] border-[#D9CCF0]", "Contradicts itself"],
  neutral: ["bg-[#F1F5F7] border-line", "Neutral fact"],
  mixed: ["bg-[linear-gradient(90deg,#FFF4E5_50%,#E9F8EF_50%)] border-line", "Same source type, both ways"],
  none: ["bg-white border-dashed border-line", "No evidence"],
};
const sel = "bg-white border border-line rounded-lg px-2.5 py-1.5 text-sm text-ink focus:outline-none focus:border-brand";

function Metric({ label, value, sub }: { label: string; value: number | string; sub: string }) {
  return (
    <div className="lg-card px-4 py-3 min-w-0">
      <div className="eyebrow">{label}</div>
      <div className="text-[24px] font-semibold text-ink leading-8 tabular-nums">{value}</div>
      <div className="text-xs text-[#5B6B78] truncate" title={sub}>{sub}</div>
    </div>
  );
}

export function EvidenceConflictsWorkspace({ caseId, ev }: { caseId: string; ev: CaseEvidence }) {
  const dec = useCaseDecisions(caseId);
  const decided = (c: Conflict) => !!dec.items[`conflict:${c.id}`];
  const [tab, setTab] = useState<"review" | "matrix" | "sources">("review");
  const [f, setF] = useState({ topic: "All", severity: "All", effect: "All", status: "All" });
  const [selId, setSelId] = useState<string | undefined>(() => takeFocus());
  const { conflicts, sources } = ev;
  const srcOf = (id: string) => sources.find((s) => s.id === id);

  const list = useMemo(() => conflicts.filter((c) =>
    (f.topic === "All" || c.topic === f.topic) && (f.severity === "All" || c.severity === f.severity) &&
    (f.effect === "All" || c.effect === f.effect) && (f.status === "All" || (f.status === "Decided") === decided(c))), [conflicts, f, dec]);
  const current = list.find((c) => c.id === selId) ?? list[0];
  const sourcesIn = (c: Conflict) => new Set(c.sides.flatMap((s) => s.statements.map((x) => x.sourceId))).size;
  const sevCount = (s: Severity) => conflicts.filter((c) => c.severity === s).length;
  const decidedN = conflicts.filter(decided).length;
  const usedSources = new Set(ev.statements.map((s) => s.sourceId));
  const conflictStatements = conflicts.flatMap((c) => c.sides.flatMap((s) => s.statements));
  const open = (id: string) => { setSelId(id); setF({ topic: "All", severity: "All", effect: "All", status: "All" }); setTab("review"); window.setTimeout(() => document.getElementById("conflict-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }), 40); };
  useEffect(() => { if (selId) window.setTimeout(() => document.getElementById("conflict-detail")?.scrollIntoView({ block: "start" }), 60); }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[24px] font-semibold text-ink leading-tight">Evidence Conflicts</h1>
        <p className="secondary-text mt-1 max-w-3xl">Factual statements in the case file are compared across the parties, witnesses, official records, medical records, data and experts. Each conflict shows the exact source text on each side, for attorney review.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <Metric label="Conflicts found" value={conflicts.length} sub={`${sevCount("Critical")} critical · ${sevCount("Major")} major · ${sevCount("Minor")} minor`} />
        <Metric label="Hurts our client" value={conflicts.filter((c) => c.effect === "Hurts defense").length} sub="Insured's account contradicted" />
        <Metric label="Plaintiff self-contradictions" value={conflicts.filter((c) => c.selfContradiction).length} sub="Within the plaintiff's own statements" />
        <Metric label="Sources compared" value={sources.length} sub={`${conflictStatements.length} statements in conflicts · ${usedSources.size} sources cited`} />
        <Metric label="Decided" value={decidedN} sub={`${conflicts.length - decidedN} still open`} />
      </div>

      <Tabs<"review" | "matrix" | "sources"> label="evidence" value={tab} onChange={setTab} tabs={[["review", "Conflict review", conflicts.length], ["matrix", "Fact × source matrix"], ["sources", "Source library", sources.length]]} />

      {tab === "review" && (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)] gap-5 items-start">
          <section aria-label="Conflicts" className="lg-card overflow-hidden min-w-0 lg:sticky lg:top-[150px]">
            <div className="p-3 border-b border-line grid grid-cols-2 gap-2">
              {([["topic", "Topic", ["All", "Liability", "Injury", "Medical history", "Causation", "Damages"]], ["severity", "Severity", ["All", "Critical", "Major", "Minor"]], ["effect", "Effect on defense", ["All", "Helps defense", "Hurts defense", "Disputed experts", "Mixed"]], ["status", "Status", ["All", "Open", "Decided"]]] as [keyof typeof f, string, string[]][]).map(([k, l, opts]) => (
                <label key={k} className="block min-w-0"><span className="eyebrow block mb-1">{l}</span>
                  <select className={`${sel} w-full`} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}>{opts.map((o) => <option key={o}>{o}</option>)}</select>
                </label>
              ))}
            </div>
            <div className="px-3 py-2 text-xs text-[#5B6B78] border-b border-line" aria-live="polite">{list.length} of {conflicts.length} conflict{conflicts.length === 1 ? "" : "s"}</div>
            <ul className="divide-y divide-line lg:max-h-[calc(100vh-380px)] overflow-y-auto">
              {list.length ? list.map((c) => {
                const on = current?.id === c.id;
                return (
                  <li key={c.id}>
                    <button type="button" onClick={() => setSelId(c.id)} aria-pressed={on} className={`w-full text-left px-4 py-3 transition-colors ${on ? "bg-tint/70 shadow-[inset_3px_0_0_var(--color-brand)]" : "hover:bg-wash"}`}>
                      <span className="flex items-center gap-2 text-xs text-[#5B6B78]"><span className="mono-ref text-deep">{c.id}</span>{c.topic}<span className="ml-auto">{sourcesIn(c)} sources</span></span>
                      <span className="block text-sm font-semibold text-ink mt-1 leading-snug">{c.title}</span>
                      <span className="flex flex-wrap gap-1.5 mt-2">
                        <Badge cls={SEVERITY_PILL[c.severity]}>{c.severity}</Badge>
                        <Badge cls={EFFECT_PILL[c.effect]}>{c.effect}</Badge>
                        <Badge cls={decided(c) ? "pill-complete" : "pill-neutral"}>{decided(c) ? "Decided" : "Open"}</Badge>
                      </span>
                    </button>
                  </li>
                );
              }) : <li><Empty icon={Search} title={conflicts.length ? "No conflicts match these filters" : "No conflicts found"}>{conflicts.length ? "Change or clear a filter." : "Nothing in the case documents contradicts anything else on file."}</Empty></li>}
            </ul>
          </section>

          {current ? <ConflictDetail key={current.id} caseId={caseId} c={current} ev={ev} decision={dec.items[`conflict:${current.id}`]} steps={dec.steps} />
            : <div className="lg-card"><Empty icon={GitCompareArrows} title="Select a conflict">Its sources, context and decision appear here.</Empty></div>}
        </div>
      )}

      {tab === "matrix" && <Matrix ev={ev} onOpen={open} />}
      {tab === "sources" && <SourceLibrary ev={ev} onOpen={open} />}
    </div>
  );
}

function ConflictDetail({ caseId, c, ev, decision, steps }: { caseId: string; c: Conflict; ev: CaseEvidence; decision?: import("./decisionStore").Decision; steps: Record<string, string> }) {
  const srcOf = (id: string) => ev.sources.find((s) => s.id === id);
  const tone = (st: Stance) => st === "plaintiff" ? "border-t-[#F2B46B]" : st === "defense" ? "border-t-[#4FB97A]" : st === "self" ? "border-t-[#A68BD9]" : "border-t-[#B9C7D0]";
  return (
    <article id="conflict-detail" className="lg-card overflow-hidden min-w-0 scroll-mt-[150px]">
      <header className="px-6 py-4 border-b border-line">
        <div className="flex items-center gap-2 text-xs text-[#5B6B78]"><span className="mono-ref text-deep">{c.id}</span>{c.topic}</div>
        <h2 className="section-header mt-1">{c.title}</h2>
        <div className="flex flex-wrap gap-1.5 mt-2"><Badge cls={SEVERITY_PILL[c.severity]}>{c.severity}</Badge><Badge cls={EFFECT_PILL[c.effect]}>{c.effect}</Badge></div>
        <p className="text-sm text-ink mt-3 leading-relaxed">{c.summary}</p>
      </header>
      <div className="px-6 py-5 space-y-6">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {c.sides.map((s) => (
            <section key={s.label} className={`rounded-xl border border-line border-t-4 ${tone(s.stance)} bg-offwhite p-4 space-y-2.5 min-w-0`}>
              <h3 className="eyebrow">{s.label}</h3>
              {s.statements.map((st) => <StatementCard key={st.id} s={st} src={srcOf(st.sourceId)} />)}
            </section>
          ))}
        </div>
        <NotesLegend />
        <section><h3 className="card-title mb-2">Context to weigh</h3><Notes notes={c.context} /></section>
        <section><h3 className="card-title mb-2">Why it matters</h3><Notes notes={c.why} /></section>
        <section>
          <h3 className="card-title mb-2">Suggested next steps</h3>
          <ul className="space-y-1.5">
            {c.steps.map((s) => {
              const k = `${c.id}:${s.id}`, done = !!steps[k];
              return (
                <li key={s.id}>
                  <button type="button" role="checkbox" aria-checked={done} onClick={() => { const ok = toggleStep(caseId, k); if (!ok) toast("Saved for this session only. The browser didn't store it."); }}
                    className="flex items-start gap-2 text-sm text-left text-ink hover:text-deep">
                    {done ? <CheckSquare className="w-4 h-4 text-deep mt-0.5 shrink-0" /> : <Square className="w-4 h-4 text-[#8A98A3] mt-0.5 shrink-0" />}
                    <span className={done ? "line-through text-[#5B6B78]" : ""}>{s.text}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
        <DecisionPanel caseId={caseId} itemKey={`conflict:${c.id}`} title="Attorney decision" options={DECISIONS} needsOwner={["Investigate further"]} current={decision} />
      </div>
    </article>
  );
}

function Matrix({ ev, onOpen }: { ev: CaseEvidence; onOpen: (id: string) => void }) {
  const [cell, setCell] = useState<{ c: string; col: string } | null>(null);
  const srcOf = (id: string) => ev.sources.find((s) => s.id === id);
  if (!ev.conflicts.length) return <div className="lg-card"><Empty icon={GitCompareArrows} title="No disputed facts">The matrix fills in when the case documents disagree about a fact.</Empty></div>;
  const picked = cell && ev.conflicts.find((c) => c.id === cell.c);
  const pickedStatements = picked ? picked.sides.flatMap((s) => s.statements).filter((s) => s.col === cell!.col) : [];
  return (
    <section className="lg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-line flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="section-header">What each source says about each disputed fact</h2>
          <p className="secondary-text mt-0.5">Select a cell to read the source text, or a fact to open its conflict.</p>
        </div>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#5B6B78]" aria-label="Legend">
          {(Object.keys(STANCE_CELL) as (Stance | "mixed" | "none")[]).map((k) => <li key={k} className="inline-flex items-center gap-1.5"><span className={`w-3 h-3 rounded border ${STANCE_CELL[k][0]}`} />{STANCE_CELL[k][1]}</li>)}
        </ul>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-offwhite text-left eyebrow px-4 py-2.5 border-b border-line w-[220px]">Disputed fact</th>
              {MATRIX_COLS.map((m) => <th key={m.key} scope="col" className="bg-offwhite text-left eyebrow px-2 py-2.5 border-b border-line">{m.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {ev.conflicts.map((c) => (
              <tr key={c.id}>
                <th scope="row" className="sticky left-0 z-10 bg-white text-left font-normal px-4 py-2 border-b border-line align-top">
                  <button type="button" onClick={() => onOpen(c.id)} className="text-left group">
                    <span className="mono-ref text-deep mr-1.5">{c.id}</span><span className="text-ink font-medium group-hover:text-deep">{c.fact}</span>
                    <ArrowRight className="inline w-3 h-3 ml-1 text-deep opacity-60" />
                  </button>
                </th>
                {MATRIX_COLS.map((m) => {
                  const ss = c.sides.flatMap((s) => s.statements).filter((s) => s.col === m.key);
                  const stance: Stance | "mixed" | "none" = !ss.length ? "none" : ss.every((s) => s.stance === ss[0].stance) ? ss[0].stance : "mixed";
                  const on = cell?.c === c.id && cell.col === m.key;
                  return (
                    <td key={m.key} className="px-1.5 py-1.5 border-b border-line align-top">
                      <button type="button" disabled={!ss.length} onClick={() => setCell(on ? null : { c: c.id, col: m.key })} aria-pressed={on}
                        aria-label={`${c.fact} · ${m.label}: ${STANCE_CELL[stance][1]}${ss.length ? `, ${ss.length} statement${ss.length === 1 ? "" : "s"}` : ""}`}
                        className={`w-full min-h-[44px] rounded-md border px-2 py-1.5 text-left text-xs ${STANCE_CELL[stance][0]} ${on ? "ring-2 ring-brand" : ""} ${ss.length ? "cursor-pointer hover:brightness-[0.98]" : "cursor-default"}`}>
                        {ss.length ? <><span className="block text-ink line-clamp-2">{ss[0].text}</span>{ss.length > 1 && <span className="text-[#5B6B78]">+{ss.length - 1} more</span>}</> : <span className="text-[#8A98A3]">—</span>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {picked && pickedStatements.length > 0 && (
        <div className="px-6 py-4 border-t border-line bg-offwhite space-y-2.5" aria-live="polite">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="card-title">{picked.id} · {picked.fact} · {MATRIX_COLS.find((m) => m.key === cell!.col)?.label}</h3>
            <button type="button" onClick={() => onOpen(picked.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-deep hover:text-ink">Open conflict <ArrowRight className="w-3.5 h-3.5" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">{pickedStatements.map((s) => <StatementCard key={s.id} s={s} src={srcOf(s.sourceId)} />)}</div>
        </div>
      )}
    </section>
  );
}

function SourceLibrary({ ev, onOpen }: { ev: CaseEvidence; onOpen: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"title" | "type" | "statements" | "conflicts">("conflicts");
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = ev.sources.map((s) => {
    const st = ev.statements.filter((x) => x.sourceId === s.id);
    const conf = ev.conflicts.filter((c) => c.sides.some((side) => side.statements.some((x) => x.sourceId === s.id)));
    const claims = ev.claims.filter((c) => [...c.support, ...c.rebuttal].some((x) => x.sourceId === s.id));
    return { s, n: new Set(st.map((x) => x.text)).size, conf, claims, st };
  }).filter((r) => !q.trim() || `${r.s.title} ${r.s.type}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => sort === "title" ? a.s.title.localeCompare(b.s.title) : sort === "type" ? a.s.type.localeCompare(b.s.type) : sort === "statements" ? b.n - a.n : b.conf.length - a.conf.length || b.n - a.n);
  const th = (k: typeof sort, l: string, right = false) => (
    <th scope="col" aria-sort={sort === k ? (k === "title" || k === "type" ? "ascending" : "descending") : undefined} className={`eyebrow px-4 py-2.5 ${right ? "text-right" : "text-left"}`}>
      <button type="button" onClick={() => setSort(k)} className={`inline-flex items-center gap-1 hover:text-ink ${sort === k ? "text-deep" : ""}`}>{l}</button>
    </th>
  );
  return (
    <section className="lg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-line flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="section-header">Source library</h2>
          <p className="secondary-text mt-0.5">The case record and every text document compared. Characteristics describe the kind of source, not its credibility.</p>
        </div>
        <label className="flex items-center gap-2 bg-white border border-line rounded-lg px-3 focus-within:border-brand w-full sm:w-64">
          <Search className="w-4 h-4 text-[#8A98A3]" /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sources" className="flex-1 min-w-0 py-2 text-sm bg-transparent outline-none" />
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-offwhite border-b border-line">
            <tr>{th("title", "Source")}{th("type", "Type")}<th scope="col" className="eyebrow px-4 py-2.5 text-left">Date</th><th scope="col" className="eyebrow px-4 py-2.5 text-left">Characteristics</th>{th("statements", "Statements", true)}{th("conflicts", "In conflicts", true)}<th className="w-10"><span className="sr-only">Details</span></th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.length ? rows.map((r) => (
              <Fragment key={r.s.id}>
                <tr className="hover:bg-wash cursor-pointer" onClick={() => setOpenId(openId === r.s.id ? null : r.s.id)}>
                  <td className="px-4 py-2.5"><span className={r.s.doc ? "mono-ref text-ink break-all" : "font-semibold text-ink"}>{r.s.title}</span></td>
                  <td className="px-4 py-2.5 text-ink">{r.s.type}</td>
                  <td className="px-4 py-2.5 text-[#5B6B78] whitespace-nowrap">{r.s.date ?? "—"}</td>
                  <td className="px-4 py-2.5"><span className="flex flex-wrap gap-1">{r.s.traits.length ? r.s.traits.map((t) => <Badge key={t} cls="pill-neutral">{t}</Badge>) : <span className="text-[#8A98A3]">—</span>}</span></td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.n}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.conf.length ? <Badge cls="pill-progress">{r.conf.length}</Badge> : <span className="text-[#8A98A3]">0</span>}</td>
                  <td className="px-2"><button type="button" aria-expanded={openId === r.s.id} aria-label={`Show what ${r.s.title} is cited for`} onClick={(e) => { e.stopPropagation(); setOpenId(openId === r.s.id ? null : r.s.id); }} className="p-1 rounded hover:bg-tint"><ChevronDown className={`w-4 h-4 text-deep transition-transform ${openId === r.s.id ? "rotate-180" : ""}`} /></button></td>
                </tr>
                {openId === r.s.id && (
                  <tr><td colSpan={7} className="px-4 py-3 bg-offwhite">
                    {r.st.length ? (
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-1.5 text-xs">
                          {r.conf.map((c) => <button key={c.id} type="button" onClick={() => onOpen(c.id)} className="pill pill-progress hover:brightness-95">{c.id} · {c.fact}</button>)}
                          {r.claims.map((c) => <span key={c.id} className="pill pill-neutral">Claim {c.id}</span>)}
                        </div>
                        <ul className="space-y-1">{[...new Map(r.st.map((x) => [x.text, x])).values()].map((x) => <li key={x.id} className="text-sm text-ink">“{x.text}” <span className="text-xs text-[#5B6B78]">· {x.where}</span></li>)}</ul>
                      </div>
                    ) : <p className="text-sm text-[#5B6B78] flex items-center gap-1.5"><FileSearch className="w-4 h-4" />Compared; nothing in it is cited in a conflict or claim.</p>}
                  </td></tr>
                )}
              </Fragment>
            )) : <tr><td colSpan={7}><Empty icon={Search} title="No sources match" /></td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
