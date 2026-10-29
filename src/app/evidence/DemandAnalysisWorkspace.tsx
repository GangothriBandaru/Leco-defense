import { Fragment, useState, type ReactNode } from "react";
import { ArrowRight, ChevronDown, ExternalLink, Info, FileWarning, Square } from "lucide-react";
import type { ClaimArea, Conflict } from "./caseEvidence";
import { fmtMoney } from "./caseEvidence";
import { type DemandModel, type DClaim, type Level, type Tone, POSITIONS, conflicted, AREA_LABEL } from "./demandModel";
import { useCaseDecisions } from "./decisionStore";
import { Badge, STATUS_PILL, Tabs, Notes, NotesLegend, DecisionPanel, Empty } from "./EvidenceShared";

type Tab = "overview" | ClaimArea | "exhibits" | "terms";
const LV: Record<Level, number> = { None: 0, Weak: 1, Moderate: 2, Strong: 3 };
const LEVEL_PILL: Record<Level, string> = { Strong: "pill-complete", Moderate: "pill-progress", Weak: "pill-risk", None: "pill-neutral" };
const TONE_CLS: Record<Tone, string> = { ok: "pill-complete", warn: "pill-progress", crit: "pill-risk", "": "pill-neutral" };
const NA = (t = "Not recorded") => <span className="text-[#8A98A3]">{t}</span>;

/** Three-step strength meter, as the reference draws it. */
function Meter({ label, level, tone }: { label: string; level: Level; tone: "their" | "ours" }) {
  const fill = tone === "their" ? "bg-[#E7A54B]" : "bg-[#3FB37A]";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-[#5B6B78]" title={`${label}: ${level}`}>
      {label}
      <span className="inline-flex gap-0.5" aria-hidden="true">{[1, 2, 3].map((i) => <i key={i} className={`block w-3.5 h-1.5 rounded-sm ${i <= LV[level] ? fill : "bg-track"}`} />)}</span>
      <b className="font-semibold text-ink">{level}</b>
    </span>
  );
}

function Card({ title, sub, right, children, className = "" }: { title: string; sub?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`lg-card overflow-hidden min-w-0 ${className}`}>
      <div className="px-5 py-4 border-b border-line flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0"><h2 className="section-header">{title}</h2>{sub && <p className="secondary-text mt-0.5">{sub}</p>}</div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Table({ head, rows, numeric = [] }: { head: string[]; rows: ReactNode[][]; numeric?: number[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="bg-offwhite border-b border-line"><tr>{head.map((h, i) => <th key={h} scope="col" className={`eyebrow px-4 py-2.5 ${numeric.includes(i) ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">{rows.map((r, i) => <tr key={i} className="align-top">{r.map((c, j) => <td key={j} className={`px-4 py-2.5 ${numeric.includes(j) ? "text-right tabular-nums" : ""}`}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function DemandAnalysisWorkspace({ caseId, model, conflicts, onOpenConflict, onOpenTracker }: {
  caseId: string; model: DemandModel; conflicts: Conflict[]; onOpenConflict: (id: string) => void; onOpenTracker?: () => void;
}) {
  const dec = useCaseDecisions(caseId);
  const [tab, setTab] = useState<Tab>("overview");
  const [open, setOpen] = useState<string | null>(null);
  const positioned = model.claims.filter((c) => dec.items[`claim:${c.id}`]).length;
  const inArea = (a: ClaimArea) => model.claims.filter((c) => c.area === a);
  const go = (ref?: string) => {
    if (!ref) return;
    if (/^C\d+$/.test(ref)) return onOpenConflict(ref);
    const c = model.claims.find((x) => x.id === ref);
    if (c) { setTab(c.area); setOpen(c.id); window.setTimeout(() => document.getElementById(`claim-${c.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); return; }
    setTab("exhibits");
  };
  const refLabel = (ref: string) => /^C\d+$/.test(ref) ? `Open ${ref}` : model.claims.some((c) => c.id === ref) ? `Review ${ref}` : `Open ${ref}`;
  const Attn = ({ items }: { items: [string, string?][] }) => (
    <ol className="divide-y divide-line">
      {items.map(([text, ref], i) => (
        <li key={i} className="py-2.5 flex items-start gap-3">
          <span className="w-5 h-5 rounded-full bg-tint text-deep text-[11px] font-semibold inline-flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
          <p className="flex-1 text-sm text-ink">{text}</p>
          {ref && <button type="button" onClick={() => go(ref)} className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-deep hover:text-ink">{refLabel(ref)} <ArrowRight className="w-3.5 h-3.5" /></button>}
        </li>
      ))}
    </ol>
  );

  const tabs: [Tab, string, number?][] = [
    ["overview", "Overview"],
    ...(["liability", "injury", "damages"] as ClaimArea[]).map((a): [Tab, string, number?] => { const n = inArea(a).filter(conflicted).length; return [a, AREA_LABEL[a], n || undefined]; }),
    ["exhibits", "Exhibits & Gaps"], ["terms", "Terms & Deadlines"],
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="eyebrow">Case tool{model.asOf ? ` · as of ${model.asOf}` : ""} · {model.basis === "reference" ? "from the case file" : "derived from the case records"}</div>
          <h1 className="text-[24px] font-semibold text-ink leading-tight mt-0.5">Demand and Complaint Analysis</h1>
          <p className="secondary-text mt-1 max-w-3xl">What the plaintiff claims, how well each claim is supported by the records on file, where it conflicts with them, and what to look at next.</p>
        </div>
        {model.claims.length > 0 && <Badge cls={positioned === model.claims.length ? "pill-complete" : "pill-progress"}>{positioned} of {model.claims.length} positions set</Badge>}
      </div>

      <Tabs label="demand" value={tab} onChange={(t) => setTab(t)} tabs={tabs} />

      {tab === "overview" && (
        <div className="space-y-5">
          {model.notice && (
            <p className="flex items-start gap-2 rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink"><Info className="w-4 h-4 text-deep mt-0.5 shrink-0" />{model.notice}</p>
          )}
          <Card title="Read this first" sub={model.readFirst.length ? `The ${model.readFirst.length} things that matter most in this demand and complaint` : undefined} className="border-t-4 border-t-brand">
            <div className="px-5 py-2">
              <NotesLegend />
              {model.readFirst.length ? (
                <ol className="divide-y divide-line mt-1">
                  {model.readFirst.map((f, i) => (
                    <li key={i} className="py-3 flex items-start gap-3">
                      <span className="w-5 h-5 rounded-full bg-tint text-deep text-[11px] font-semibold inline-flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                      <div className="flex-1 min-w-0"><Notes notes={[{ text: f.text, basis: f.basis }]} /></div>
                      {f.ref && <button type="button" onClick={() => go(f.ref)} className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-deep hover:text-ink">{refLabel(f.ref)} <ArrowRight className="w-3.5 h-3.5" /></button>}
                    </li>
                  ))}
                </ol>
              ) : <Empty icon={FileWarning} title="Nothing flagged yet">Findings appear here once claims or conflicts are found.</Empty>}
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {model.sections.map((s) => {
              const L = inArea(s.area);
              const gaps = L.reduce((a, c) => a + c.gaps.length, 0);
              return (
                <section key={s.area} className="lg-card p-5 flex flex-col gap-3 min-w-0">
                  <div><div className="eyebrow">{s.question}</div><h3 className="card-title mt-0.5">{s.title}</h3></div>
                  <Meter label="Plaintiff's case" level={s.their} tone="their" />
                  <p className="text-sm text-[#5B6B78] leading-relaxed">{s.verdict}</p>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                    <dt className="text-[#5B6B78]">Claims</dt><dd className="text-ink font-semibold tabular-nums">{L.length}</dd>
                    <dt className="text-[#5B6B78]">Conflict with our records</dt><dd className="text-ink font-semibold tabular-nums">{L.filter(conflicted).length}</dd>
                    <dt className="text-[#5B6B78]">Unsupported</dt><dd className="text-ink font-semibold tabular-nums">{L.filter((c) => c.status === "Unsupported").length}</dd>
                    <dt className="text-[#5B6B78]">Evidence gaps</dt><dd className="text-ink font-semibold tabular-nums">{gaps}</dd>
                  </dl>
                  <button type="button" onClick={() => setTab(s.area)} className="mt-auto btn btn-primary gap-1.5">Review {s.title.toLowerCase()} <ArrowRight className="w-4 h-4" /></button>
                </section>
              );
            })}
          </div>

          <Card title="Demand at a glance" sub={model.glanceSub}>
            <div className="p-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
              {model.glance.map((g) => (
                <div key={g.label} className="lg-zone lg-zone-grey px-4 py-3 min-w-0">
                  <div className="eyebrow">{g.label}</div>
                  <div className="text-[22px] font-semibold text-ink tabular-nums leading-8 break-words">{g.value ?? <span className="text-base font-normal text-[#8A98A3]">Not recorded</span>}</div>
                  {g.note && <div className="text-xs text-[#5B6B78] break-words">{g.note}</div>}
                </div>
              ))}
            </div>
          </Card>

          <Card title="What changed from demand to complaint" sub={model.changes.sub}>
            <Table head={model.changes.head} rows={model.changes.rows.map((r) => [
              <span className="font-semibold text-ink">{r.item}</span>,
              r.demand === "Not on file" ? NA(r.demand) : r.demand,
              <span className="flex flex-wrap items-center gap-2">{r.complaint === "Not on file" ? NA(r.complaint) : r.complaint}{r.changed && <Badge cls="pill-progress">Changed</Badge>}{r.ref && <button type="button" onClick={() => go(r.ref)} className="text-xs font-semibold text-deep hover:text-ink">{r.ref}</button>}</span>,
            ])} />
          </Card>
        </div>
      )}

      {(tab === "liability" || tab === "injury" || tab === "damages") && (() => {
        const s = model.sections.find((x) => x.area === tab)!;
        const L = inArea(tab);
        const gaps = L.reduce((a, c) => a + c.gaps.length, 0);
        const posN = L.filter((c) => dec.items[`claim:${c.id}`]).length;
        return (
          <div className="space-y-5">
            <section className="lg-card p-5 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div><div className="eyebrow">{s.question}</div><h2 className="section-header mt-0.5">{s.title}</h2></div>
                <Meter label="Plaintiff's case" level={s.their} tone="their" />
              </div>
              <p className="text-sm text-ink leading-relaxed max-w-[80ch]">{s.verdict}</p>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                <span><b className="tabular-nums">{L.length}</b> claims</span>
                <span className="text-[#7C4DBA]"><b className="tabular-nums">{L.filter(conflicted).length}</b> conflict with our records</span>
                <span className="text-[#B42318]"><b className="tabular-nums">{L.filter((c) => c.status === "Unsupported").length}</b> unsupported</span>
                <span><b className="tabular-nums">{gaps}</b> gaps</span>
                <span className="text-[#15803D]"><b className="tabular-nums">{posN}</b> of {L.length} positions set</span>
              </div>
              {s.attention.length > 0 && <div className="border-t border-line pt-3"><div className="eyebrow mb-1">Needs your attention</div><Attn items={s.attention} /></div>}
            </section>

            <div className="space-y-2.5">
              <div className="eyebrow">Claims in this section · select to open</div>
              {L.length ? L.map((c) => <ClaimCard key={c.id} c={c} open={open === c.id} onToggle={() => setOpen(open === c.id ? null : c.id)} caseId={caseId} decision={dec.items[`claim:${c.id}`]} conflicts={conflicts} onOpenConflict={onOpenConflict} />)
                : <div className="lg-card"><Empty icon={FileWarning} title={`No ${s.title.toLowerCase()} claims found`} /></div>}
            </div>

            {tab === "injury" && model.providers && (
              <Card title="Treatment, provider by provider" sub={model.providers.sub}>
                <Table head={["Provider", "Dates", "Visits", "Billed", "In the demand", "What our records show", "Flag"]} numeric={[3]} rows={model.providers.rows.map((r) => [
                  <span className="font-semibold text-ink">{r.provider}</span>, <span className="whitespace-nowrap">{r.dates}</span>, r.visits, r.billed, r.inDemand, r.ours, <Badge cls={TONE_CLS[r.tone]}>{r.flag}</Badge>,
                ])} />
              </Card>
            )}
            {tab === "injury" && model.history && (
              <Card title="Medical history the demand leaves out" sub={model.history.sub} right={model.history.rows.length ? <Badge cls="pill-risk">{model.history.rows.length} omission{model.history.rows.length === 1 ? "" : "s"}</Badge> : undefined}>
                {model.history.rows.length ? (
                  <Table head={["Source", "Date", "Finding", "Effect"]} rows={model.history.rows.map((r) => [
                    <span className="font-semibold text-ink">{r.source}</span>, <span className="whitespace-nowrap">{r.date}</span>, r.finding,
                    r.ref ? <button type="button" onClick={() => go(r.ref)} className="pill pill-progress hover:brightness-95">{r.effect}</button> : <Badge cls="pill-progress">{r.effect}</Badge>,
                  ])} />
                ) : <p className="px-5 py-4 text-sm text-[#5B6B78]">{model.history.empty}</p>}
              </Card>
            )}
            {tab === "damages" && model.reconcile && (() => {
              const r = model.reconcile;
              const max = Math.max(...r.rows.map((x) => x.demanded), 1);
              return (
                <Card title={r.title} sub={r.sub} right={<Badge cls="pill-complete">{r.verifiedLabel}</Badge>}>
                  <div className="p-5 space-y-4">
                    {r.rows.map((x) => (
                      <div key={x.label} className="space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap text-sm">
                          <b className="font-semibold text-ink">{x.label}</b>
                          {x.str && <Badge cls={LEVEL_PILL[x.str]}>Their support: {x.str}</Badge>}
                          <span className="ml-auto text-[#5B6B78] tabular-nums">{fmtMoney(x.demanded)} claimed · {x.verified ? `${fmtMoney(x.verified)} supported` : x.verified === 0 ? "none supported" : "unverified"}</span>
                        </div>
                        <div className="relative h-3 rounded-full" role="img" aria-label={`${x.label}: ${fmtMoney(x.demanded)} claimed, ${x.verified ? fmtMoney(x.verified) : "none"} supported`}>
                          <div className="absolute inset-y-0 left-0 rounded-full border-2 border-[#9BDAEC] bg-white" style={{ width: `${(x.demanded / max) * 100}%` }} />
                          {!!x.verified && <div className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{ width: `${(x.verified / max) * 100}%` }} />}
                        </div>
                        <p className="text-xs text-[#5B6B78]">{x.note}</p>
                      </div>
                    ))}
                    <p className="text-xs text-[#5B6B78] border-t border-line pt-3">{r.note}</p>
                  </div>
                </Card>
              );
            })()}
          </div>
        );
      })()}

      {tab === "exhibits" && (
        <div className="space-y-5">
          <section className="lg-card p-5 space-y-3">
            <div><div className="eyebrow">What they sent and what's missing</div><h2 className="section-header mt-0.5">Exhibits &amp; gaps</h2></div>
            {model.exhibitsAttention.length > 0 && <div className="border-t border-line pt-3"><div className="eyebrow mb-1">Needs your attention</div><Attn items={model.exhibitsAttention} /></div>}
          </section>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
            <Card title="Exhibits they attached" sub={model.exhibits.sub}>
              {model.exhibits.rows.length ? (
                <Table head={["Exhibit", "Document", "Supports", "Strength", "Look at"]} rows={model.exhibits.rows.map((x) => [
                  <span className="mono-ref text-deep whitespace-nowrap">{x.id}</span>,
                  <span><span className="font-semibold text-ink break-words">{x.doc}</span>{x.pages && <span className="block text-xs text-[#5B6B78]">{x.pages} pp.</span>}</span>,
                  x.supports.length ? <span className="flex flex-wrap gap-1">{x.supports.map((id) => <button key={id} type="button" onClick={() => go(id)} className="mono-ref text-deep hover:text-ink">{id}</button>)}</span> : NA("None"),
                  x.strength ? <Badge cls={LEVEL_PILL[x.strength]}>{x.strength}</Badge> : NA("Not rated"),
                  <span className="text-[#5B6B78]">{x.look}</span>,
                ])} />
              ) : <Empty icon={FileWarning} title="No exhibits on file" />}
            </Card>
            <Card title="Missing from the demand" sub={`${model.gaps.filter((g) => g.tone !== "ok").length} still open`} right={onOpenTracker && <button type="button" onClick={onOpenTracker} className="btn btn-secondary gap-1.5">Document Tracker <ExternalLink className="w-3.5 h-3.5" /></button>}>
              <Table head={["Item", "Needed for", "Status"]} rows={model.gaps.map((g) => [
                <span><span className="font-semibold text-ink">{g.item}</span>{g.claims && g.claims.length > 0 && <span className="block text-xs text-[#5B6B78]">For {g.claims.join(", ")}</span>}</span>,
                g.neededFor,
                <span className="flex items-center gap-2 flex-wrap"><Badge cls={TONE_CLS[g.tone]}>{g.status}</Badge>{g.requestId && onOpenTracker && <button type="button" onClick={onOpenTracker} className="text-xs font-semibold text-deep hover:text-ink">Request {g.requestId}</button>}</span>,
              ])} />
            </Card>
          </div>
        </div>
      )}

      {tab === "terms" && (
        <div className="space-y-5">
          <section className="lg-card p-5 space-y-3">
            <div><div className="eyebrow">Settlement exposure</div><h2 className="section-header mt-0.5">Terms &amp; deadlines</h2></div>
            {model.termsAttention.length > 0 && <div className="border-t border-line pt-3"><div className="eyebrow mb-1">Needs your attention</div><Attn items={model.termsAttention} /></div>}
          </section>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
            <Card title="Demand terms">
              <dl className="p-5 grid grid-cols-[150px_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-sm">
                {model.terms.map(([k, v]) => <Fragment key={k}><dt className="text-[#5B6B78]">{k}</dt><dd className="text-ink break-words">{v ?? NA()}</dd></Fragment>)}
              </dl>
            </Card>
            <Card title="Risk flags">
              <ul className="p-5 space-y-2.5">
                {model.flags.map((f, i) => (
                  <li key={i} className={`rounded-xl border px-4 py-3 ${f.tone === "crit" ? "bg-[#FEF2F2] border-[#FBD5D5]" : f.tone === "warn" ? "bg-[#FFF7ED] border-[#FDE6C8]" : f.tone === "ok" ? "bg-[#ECFDF3] border-[#D1FADF]" : "bg-white border-line"}`}>
                    <p className="text-sm font-semibold text-ink">{f.title}</p>
                    <p className="text-sm text-ink mt-1 leading-relaxed">{f.body}</p>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function ClaimCard({ c, open, onToggle, caseId, decision, conflicts, onOpenConflict }: {
  c: DClaim; open: boolean; onToggle: () => void; caseId: string; decision?: import("./decisionStore").Decision; conflicts: Conflict[]; onOpenConflict: (id: string) => void;
}) {
  const cf = conflicted(c);
  return (
    <article id={`claim-${c.id}`} className="lg-card overflow-hidden scroll-mt-[150px]">
      <button type="button" aria-expanded={open} onClick={onToggle} className="w-full text-left px-5 py-4 hover:bg-wash">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="mono-ref text-deep mr-1">{c.id}</span>
          <Badge cls={STATUS_PILL[c.status]}>{c.status}</Badge>
          {cf && <Badge cls="pill-progress">Conflict with our records</Badge>}
          {c.tag && <Badge cls="pill-neutral">{c.tag}</Badge>}
          {decision && <Badge cls="pill-complete">Position: {decision.choice}</Badge>}
          <ChevronDown className={`w-4 h-4 text-deep ml-auto transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
        <span className="block text-sm font-semibold text-ink mt-2">{c.title}{c.amount ? <span className="font-normal text-[#5B6B78] tabular-nums"> · {fmtMoney(c.amount)}</span> : null}</span>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2">
          <Meter label="Their support" level={c.their} tone="their" />
          <Meter label="Our rebuttal" level={c.ours} tone="ours" />
          <span className="pill pill-neutral">{c.exhibits.length ? `${c.exhibits.length} exhibit${c.exhibits.length > 1 ? "s" : ""}` : "No exhibits"}</span>
          <span className="pill pill-neutral">{c.gaps.length} gap{c.gaps.length === 1 ? "" : "s"}</span>
        </span>
        <span className="block text-sm text-[#5B6B78] mt-2"><b className="font-semibold text-ink">Look at:</b> {c.look}</span>
      </button>
      {open && (
        <div className="px-5 pb-5 pt-4 border-t border-line space-y-4">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <section className="rounded-xl border border-line border-t-4 border-t-[#F2B46B] bg-offwhite p-4 space-y-2.5 min-w-0">
              <h3 className="eyebrow">They claim</h3>
              {c.quotes.map((q, i) => (
                <div key={i} className="rounded-lg border border-line bg-white px-3.5 py-3">
                  <div className="flex items-center gap-2 text-xs mb-1 flex-wrap"><Badge cls="pill-neutral">{q.doc}</Badge><span className="mono-ref text-[#5B6B78]">{q.loc}</span></div>
                  <blockquote className="text-sm text-ink border-l-2 border-[#F2B46B] pl-3 break-words">“{q.text}”</blockquote>
                </div>
              ))}
              <div className="eyebrow pt-1">Evidence they attached</div>
              {c.exhibits.length ? c.exhibits.map((e, i) => (
                <div key={i} className="rounded-lg border border-line bg-white px-3.5 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2 flex-wrap"><span><span className="mono-ref text-deep">{e.ex}</span> · <b className="font-semibold text-ink break-words">{e.doc}</b></span>{e.str && <Badge cls={LEVEL_PILL[e.str]}>{e.str}</Badge>}</div>
                  <p className="text-ink mt-1">{e.shows}</p>
                  {e.loc && <p className="mono-ref text-xs text-[#5B6B78] mt-0.5">{e.loc}</p>}
                </div>
              )) : <p className="rounded-lg border border-[#FBD5D5] bg-[#FEF2F2] px-3.5 py-2.5 text-sm text-ink"><b className="text-[#B42318]">Missing grounds.</b> No evidence attached; the claim rests on counsel's words alone.</p>}
            </section>
            <section className="rounded-xl border border-line border-t-4 border-t-[#4FB97A] bg-offwhite p-4 space-y-2.5 min-w-0">
              <h3 className="eyebrow">{cf ? "Our records show" : "Our file"}</h3>
              {c.ours_.length ? c.ours_.map((o, i) => (
                <div key={i} className="rounded-lg border border-line bg-white px-3.5 py-3">
                  <div className="text-xs text-[#5B6B78] mb-1"><b className="font-semibold text-ink">{o.doc}</b> · <span className="mono-ref">{o.loc}</span></div>
                  <blockquote className="text-sm text-ink border-l-2 border-[#4FB97A] pl-3 break-words">“{o.text}”</blockquote>
                  {o.conflict && conflicts.some((k) => k.id === o.conflict) && <button type="button" onClick={() => onOpenConflict(o.conflict!)} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-deep hover:text-ink">Open evidence conflict {o.conflict} <ArrowRight className="w-3.5 h-3.5" /></button>}
                </div>
              )) : <p className="rounded-lg border border-dashed border-line bg-white px-3.5 py-2.5 text-sm text-[#5B6B78]"><b className="text-ink">Nothing in our file yet.</b> See the gaps below for what to request.</p>}
            </section>
          </div>
          {cf && c.response && <p className="rounded-xl border border-[#D9CCF0] bg-[#F7F3FD] px-4 py-3 text-sm text-ink"><b className="text-[#6B3FA0]">How the conflict cuts.</b> {c.response}</p>}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <section className="rounded-xl border border-line p-4">
              <h3 className="card-title mb-2">Gaps in their support</h3>
              <ul className="space-y-1.5">{c.gaps.map((g) => <li key={g} className="flex items-start gap-2 text-sm text-ink"><Square className="w-4 h-4 text-[#8A98A3] mt-0.5 shrink-0" aria-hidden="true" />{g}</li>)}</ul>
            </section>
            <section className="rounded-xl border border-line p-4">
              <h3 className="card-title mb-2">Suggested response</h3>
              {c.response ? <p className="text-sm text-ink leading-relaxed">{c.response}</p> : <p className="text-sm text-[#8A98A3]">None recorded.</p>}
              {c.law && <div className="mt-2"><Badge cls="pill-neutral">{c.law}</Badge></div>}
            </section>
          </div>
          <DecisionPanel caseId={caseId} itemKey={`claim:${c.id}`} title="Your position" options={POSITIONS} needsOwner={["Investigate"]} current={decision} />
        </div>
      )}
    </article>
  );
}
