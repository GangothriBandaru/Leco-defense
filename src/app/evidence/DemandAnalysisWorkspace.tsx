import { Fragment, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, ChevronDown, FileWarning, Scale, Stethoscope, DollarSign, Info, ExternalLink, ClipboardList } from "lucide-react";
import type { CaseDetails } from "../intake/caseDetailsStore";
import type { DocRequest } from "../tracker/trackerData";
import { statusLabel, TONE_PILL } from "../tracker/trackerData";
import { getDocumentContent } from "../components/documentText";
import { fmtDay, daysUntil } from "../conflict/caseFacts";
import { type CaseEvidence, type Claim, type ClaimArea, type Note, fmtMoney } from "./caseEvidence";
import { useCaseDecisions } from "./decisionStore";
import { Badge, STATUS_PILL, Tabs, StatementCard, Notes, NotesLegend, DecisionPanel, Empty } from "./EvidenceShared";

type Tab = "overview" | ClaimArea | "exhibits" | "terms";
const POSITIONS = ["Accept", "Dispute", "Partially dispute", "Investigate further", "Need more information"];
const AREA: Record<ClaimArea, { label: string; icon: typeof Scale }> = {
  liability: { label: "Liability", icon: Scale },
  injury: { label: "Injury & Medical", icon: Stethoscope },
  damages: { label: "Damages", icon: DollarSign },
};
const NA = (t = "Not recorded") => <span className="text-[#8A98A3]">{t}</span>;
const num = (s?: string) => { const m = s && /[\d,]+(\.\d+)?/.exec(s); return m ? +m[0].replace(/,/g, "") : undefined; };

interface Finding { text: string; ref: string; basis: Note["basis"]; go: () => void; goLabel: string }

export function DemandAnalysisWorkspace({ caseId, ev, facts, requests, onOpenConflict, onOpenTracker }: {
  caseId: string; ev: CaseEvidence; facts: CaseDetails; requests: DocRequest[];
  onOpenConflict: (id: string) => void; onOpenTracker?: () => void;
}) {
  const dec = useCaseDecisions(caseId);
  const [tab, setTab] = useState<Tab>("overview");
  const [openClaim, setOpenClaim] = useState<string | null>(null);
  const positioned = ev.claims.filter((c) => dec.items[`claim:${c.id}`]).length;
  const byArea = (a: ClaimArea) => ev.claims.filter((c) => c.area === a);
  const goClaim = (c: Claim) => { setTab(c.area); setOpenClaim(c.id); window.setTimeout(() => document.getElementById(`claim-${c.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); };
  const conflictOf = (id: string) => ev.conflicts.find((c) => c.id === id);

  // Tracker status for a missing record, without creating anything.
  const gapStatus = (re: RegExp): { label: string; tone: string } => {
    const r = requests.find((x) => re.test(`${x.to} ${x.type} ${x.cat} ${x.docs.join(" ")}`));
    if (!r) return { label: "Not requested", tone: "" };
    const [l, t] = statusLabel(r);
    return { label: l, tone: t };
  };

  const findings: Finding[] = [
    ...ev.conflicts.filter((c) => c.severity === "Critical").map((c): Finding => ({ text: c.summary, ref: c.id, basis: "source", go: () => onOpenConflict(c.id), goLabel: "Open in Evidence Conflicts" })),
    ...ev.claims.filter((c) => c.conflicts.length && c.area === "damages").map((c): Finding => ({ text: `${c.title}: ${c.lookAt}`, ref: c.id, basis: "analysis", go: () => goClaim(c), goLabel: "Open claim" })),
    ...ev.exhibits.filter((x) => x.issue?.startsWith("Named as bills")).map((x): Finding => ({ text: `${x.doc.name}: ${x.issue}`, ref: x.id, basis: "source", go: () => setTab("exhibits"), goLabel: "Open exhibits" })),
    ...ev.claims.filter((c) => c.status === "Unsupported").map((c): Finding => ({ text: `${c.title}: ${c.lookAt}`, ref: c.id, basis: "analysis", go: () => goClaim(c), goLabel: "Open claim" })),
    ...(ev.noDemand || ev.noComplaint ? [{ text: `${[ev.noDemand && "No demand letter", ev.noComplaint && "no complaint"].filter(Boolean).join(" and ")} is on file. Claims below are as the plaintiff's records present them, and terms can't be checked.`, ref: "Terms", basis: "source" as const, go: () => setTab("terms"), goLabel: "Open terms & deadlines" }] : []),
  ];

  const tabs: [Tab, string, number?][] = [
    ["overview", "Overview"], ["liability", "Liability", byArea("liability").length], ["injury", "Injury & Medical", byArea("injury").length],
    ["damages", "Damages", byArea("damages").length], ["exhibits", "Exhibits & Gaps", ev.gaps.length], ["terms", "Terms & Deadlines"],
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-[24px] font-semibold text-ink leading-tight">Demand and Complaint Analysis</h1>
          <p className="secondary-text mt-1 max-w-3xl">What the plaintiff claims, how well each claim is supported by the records on file, where it conflicts with them, and what to look at next.</p>
        </div>
        {ev.claims.length > 0 && <Badge cls={positioned === ev.claims.length ? "pill-complete" : "pill-progress"}>{positioned} of {ev.claims.length} positions set</Badge>}
      </div>
      {(ev.noDemand || ev.noComplaint) && (
        <p className="flex items-start gap-2 rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink">
          <Info className="w-4 h-4 text-deep mt-0.5 shrink-0" />
          <span>{[ev.noDemand && "No demand letter", ev.noComplaint && "no complaint"].filter(Boolean).join(" and ")} is in the case documents. The claims below are taken from the plaintiff's own records; they'll be compared against the demand and complaint once those are filed.</span>
        </p>
      )}

      <Tabs label="demand" value={tab} onChange={(t) => { setTab(t); setOpenClaim(null); }} tabs={tabs} />

      {tab === "overview" && (
        <div className="space-y-5">
          <section className="lg-card p-5">
            <h2 className="section-header mb-1">Read this first</h2>
            <NotesLegend />
            {findings.length ? (
              <ol className="mt-3 divide-y divide-line">
                {findings.map((f, i) => (
                  <li key={i} className="py-3 flex items-start gap-3 flex-wrap sm:flex-nowrap">
                    <span className="mono-ref text-deep w-12 shrink-0 pt-0.5">{f.ref}</span>
                    <div className="flex-1 min-w-0"><Notes notes={[{ text: f.text, basis: f.basis }]} /></div>
                    <button type="button" onClick={f.go} className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-deep hover:text-ink">{f.goLabel} <ArrowRight className="w-3.5 h-3.5" /></button>
                  </li>
                ))}
              </ol>
            ) : <Empty icon={ClipboardList} title="Nothing needs attention yet">Findings appear here once claims or conflicts are found in the case documents.</Empty>}
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {(Object.keys(AREA) as ClaimArea[]).map((a) => {
              const L = byArea(a), I = AREA[a].icon;
              const conf = new Set(L.flatMap((c) => c.conflicts)).size;
              const gaps = ev.gaps.filter((g) => g.claims.some((id) => L.some((c) => c.id === id))).length;
              const amounts = L.filter((c) => c.amount !== undefined);
              return (
                <section key={a} className="lg-card p-5 flex flex-col">
                  <div className="flex items-center gap-2 mb-3"><span className="w-8 h-8 rounded-lg bg-tint text-deep inline-flex items-center justify-center"><I className="w-4 h-4" strokeWidth={1.75} /></span><h3 className="card-title">{AREA[a].label}</h3></div>
                  {L.length ? (
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm mb-4">
                      <dt className="text-[#5B6B78]">Claims</dt><dd className="text-ink font-semibold tabular-nums">{L.length}</dd>
                      <dt className="text-[#5B6B78]">Supported</dt><dd className="text-ink tabular-nums">{L.filter((c) => c.status === "Supported").length}</dd>
                      <dt className="text-[#5B6B78]">Partially / un-supported</dt><dd className="text-ink tabular-nums">{L.filter((c) => c.status !== "Supported").length}</dd>
                      <dt className="text-[#5B6B78]">Conflicts</dt><dd className="text-ink tabular-nums">{conf}</dd>
                      <dt className="text-[#5B6B78]">Evidence gaps</dt><dd className="text-ink tabular-nums">{gaps}</dd>
                      {amounts.length > 0 && <><dt className="text-[#5B6B78]">Claimed in records</dt><dd className="text-ink tabular-nums">{fmtMoney(amounts.reduce((s, c) => s + (c.amount ?? 0), 0))}</dd></>}
                    </dl>
                  ) : <p className="text-sm text-[#5B6B78] mb-4">No {AREA[a].label.toLowerCase()} claims found in the case documents.</p>}
                  <button type="button" onClick={() => setTab(a)} className="mt-auto btn btn-secondary gap-1.5">Review {AREA[a].label.toLowerCase()} <ArrowRight className="w-4 h-4" /></button>
                </section>
              );
            })}
          </div>

          <section className="lg-card p-5">
            <h2 className="section-header mb-3">Demand at a glance</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              {([
                ["Demand amount", facts.demandAmount ? `$${facts.demandAmount.replace(/^\$/, "")}` : null, facts.demandAmount ? "Recorded in Case Details" : undefined],
                ["Complaint ad damnum", null, ev.noComplaint ? "No complaint on file" : undefined],
                ["Policy limit", facts.policyLimits ?? ev.policyLimit?.text ?? null, facts.policyLimits ? "Case Details" : ev.policyLimit ? `${ev.policyLimit.source.title} · each occurrence` : undefined],
                ["Carrier offer", null, undefined],
                ["Demand date", fmtDay(facts.demandDate) ?? null, undefined],
                ["Status", facts.demandStatus ?? null, "Deadline not recorded"],
              ] as [string, string | null, string | undefined][]).map(([k, v, sub]) => (
                <div key={k} className="lg-zone lg-zone-grey px-3.5 py-2.5 min-w-0">
                  <div className="eyebrow mb-1">{k}</div>
                  <div className="text-sm font-semibold text-ink break-words">{v ?? NA()}</div>
                  {sub && <div className="text-xs text-[#5B6B78] mt-0.5 break-words">{sub}</div>}
                </div>
              ))}
            </div>
          </section>

          <section className="lg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-line">
              <h2 className="section-header">What changed from demand to complaint</h2>
              <p className="secondary-text mt-0.5">{ev.noDemand && ev.noComplaint ? "Neither document is on file, so nothing can be compared yet." : "Only what the documents state is compared."}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-offwhite border-b border-line"><tr><th className="eyebrow text-left px-5 py-2.5">Item</th><th className="eyebrow text-left px-5 py-2.5">Demand</th><th className="eyebrow text-left px-5 py-2.5">Complaint</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {["Amount claimed", "Liability theory", "Injury allegations", "Earning capacity / wage loss", "Prior medical history"].map((item) => (
                    <tr key={item}>
                      <td className="px-5 py-2.5 text-ink font-medium">{item}</td>
                      <td className="px-5 py-2.5">{item === "Amount claimed" && facts.demandAmount ? <>${facts.demandAmount.replace(/^\$/, "")} <span className="text-xs text-[#5B6B78]">· Case Details</span></> : NA(ev.noDemand ? "No demand letter on file" : "Not stated")}</td>
                      <td className="px-5 py-2.5">{NA(ev.noComplaint ? "No complaint on file" : "Not stated")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {(tab === "liability" || tab === "injury" || tab === "damages") && (
        <AreaTab area={tab} ev={ev} caseId={caseId} dec={dec.items} openClaim={openClaim} setOpenClaim={setOpenClaim} onOpenConflict={onOpenConflict} gapStatus={gapStatus} conflictOf={conflictOf} />
      )}

      {tab === "exhibits" && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
          <section className="lg-card overflow-hidden min-w-0">
            <div className="px-5 py-4 border-b border-line"><h2 className="section-header">Exhibits they attached</h2><p className="secondary-text mt-0.5">Documents received from the plaintiff ({ev.exhibits.length}).</p></div>
            {ev.exhibits.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="bg-offwhite border-b border-line"><tr>{["#", "Document", "Pages", "Claims", "Review", "Key issue"].map((h) => <th key={h} className="eyebrow text-left px-4 py-2.5">{h}</th>)}</tr></thead>
                  <tbody className="divide-y divide-line">
                    {ev.exhibits.map((x) => (
                      <tr key={x.id} className="align-top">
                        <td className="px-4 py-2.5 mono-ref text-deep">{x.id}</td>
                        <td className="px-4 py-2.5 mono-ref text-ink break-all">{x.doc.name}</td>
                        <td className="px-4 py-2.5">{NA()}</td>
                        <td className="px-4 py-2.5">{x.claims.length ? <span className="flex flex-wrap gap-1">{x.claims.map((id) => <button key={id} type="button" onClick={() => { const c = ev.claims.find((k) => k.id === id); if (c) goClaim(c); }} className="pill pill-neutral hover:brightness-95">{id}</button>)}</span> : NA("None")}</td>
                        <td className="px-4 py-2.5"><Badge cls={x.doc.status === "Processed" ? "pill-complete" : "pill-progress"}>{x.doc.status}</Badge></td>
                        <td className="px-4 py-2.5 text-ink">{x.issue ?? NA("—")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Empty icon={FileWarning} title="No plaintiff documents on file" />}
          </section>
          <section className="lg-card overflow-hidden min-w-0">
            <div className="px-5 py-4 border-b border-line flex items-start justify-between gap-3 flex-wrap">
              <div><h2 className="section-header">Missing from the file</h2><p className="secondary-text mt-0.5">{ev.gaps.length} record{ev.gaps.length === 1 ? "" : "s"} not among the case documents. Status comes from the Document Tracker.</p></div>
              {onOpenTracker && <button type="button" onClick={onOpenTracker} className="btn btn-secondary gap-1.5">Document Tracker <ExternalLink className="w-3.5 h-3.5" /></button>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="bg-offwhite border-b border-line"><tr>{["Record", "Why it's needed", "Status"].map((h) => <th key={h} className="eyebrow text-left px-4 py-2.5">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-line">
                  {ev.gaps.map((g) => {
                    const s = gapStatus(g.match);
                    return (
                      <tr key={g.id} className="align-top">
                        <td className="px-4 py-2.5"><span className="mono-ref text-deep mr-1.5">{g.id}</span><span className="text-ink font-medium">{g.item}</span>{g.claims.length > 0 && <span className="block text-xs text-[#5B6B78] mt-0.5">For {g.claims.join(", ")}</span>}</td>
                        <td className="px-4 py-2.5 text-ink">{g.why}</td>
                        <td className="px-4 py-2.5"><span className={`${TONE_PILL[s.tone] ?? TONE_PILL[""]} whitespace-nowrap`}>{s.label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {tab === "terms" && <TermsTab ev={ev} facts={facts} onOpenConflict={onOpenConflict} />}
    </div>
  );
}

function AreaTab({ area, ev, caseId, dec, openClaim, setOpenClaim, onOpenConflict, gapStatus, conflictOf }: {
  area: ClaimArea; ev: CaseEvidence; caseId: string; dec: Record<string, import("./decisionStore").Decision>;
  openClaim: string | null; setOpenClaim: (id: string | null) => void; onOpenConflict: (id: string) => void;
  gapStatus: (re: RegExp) => { label: string; tone: string }; conflictOf: (id: string) => import("./caseEvidence").Conflict | undefined;
}) {
  const L = ev.claims.filter((c) => c.area === area);
  const srcOf = (id: string) => ev.sources.find((s) => s.id === id);
  const gapsFor = (c: Claim) => ev.gaps.filter((g) => g.claims.includes(c.id));
  const attention = L.filter((c) => c.status !== "Supported" || c.conflicts.length);
  const conf = new Set(L.flatMap((c) => c.conflicts));
  if (!L.length) return <div className="lg-card"><Empty icon={AREA[area].icon} title={`No ${AREA[area].label.toLowerCase()} claims found`}>None of the case documents make a {AREA[area].label.toLowerCase()} claim yet.</Empty></div>;

  return (
    <div className="space-y-5">
      <section className="lg-card p-5">
        <h2 className="section-header">{AREA[area].label} summary</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-3">
          {([["Claims", L.length], ["Supported", L.filter((c) => c.status === "Supported").length], ["Partially supported", L.filter((c) => c.status === "Partially supported").length], ["Unsupported", L.filter((c) => c.status === "Unsupported" || c.status === "Contradicted").length], ["Conflicts", conf.size], ["Positions set", L.filter((c) => dec[`claim:${c.id}`]).length]] as [string, number][]).map(([k, v]) => (
            <div key={k} className="lg-zone lg-zone-grey px-3.5 py-2.5"><div className="eyebrow">{k}</div><div className="text-[20px] font-semibold text-ink tabular-nums">{v}</div></div>
          ))}
        </div>
      </section>

      {attention.length > 0 && (
        <section className="lg-card p-5">
          <h2 className="section-header mb-2">Needs your attention</h2>
          <ul className="divide-y divide-line">
            {attention.map((c) => (
              <li key={c.id} className="py-2.5 flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-[#B45309] mt-0.5 shrink-0" />
                <p className="flex-1 text-sm text-ink"><b className="font-semibold">{c.title}.</b> {c.lookAt}</p>
                <button type="button" onClick={() => { setOpenClaim(c.id); window.setTimeout(() => document.getElementById(`claim-${c.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 30); }} className="mono-ref text-deep hover:text-ink shrink-0">{c.id}</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {area === "injury" && <ProviderTable ev={ev} />}
      {area === "damages" && <AmountTable claims={L} />}

      <div className="space-y-3">
        {L.map((c) => {
          const open = openClaim === c.id;
          return (
            <article key={c.id} id={`claim-${c.id}`} className="lg-card overflow-hidden scroll-mt-[150px]">
              <button type="button" aria-expanded={open} onClick={() => setOpenClaim(open ? null : c.id)} className="w-full text-left px-5 py-4 flex items-start gap-3 hover:bg-wash">
                <span className="mono-ref text-deep pt-0.5 w-8 shrink-0">{c.id}</span>
                <span className="flex-1 min-w-0">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Badge cls={STATUS_PILL[c.status]}>{c.status}</Badge>
                    {c.conflicts.map((id) => <Badge key={id} cls="pill-progress">Conflict {id}</Badge>)}
                    {dec[`claim:${c.id}`] && <Badge cls="pill-complete">Position: {dec[`claim:${c.id}`].choice}</Badge>}
                    {c.amount !== undefined && <span className="text-sm font-semibold text-ink tabular-nums ml-1">{fmtMoney(c.amount)}</span>}
                  </span>
                  <span className="block text-sm font-semibold text-ink mt-1.5">{c.title}</span>
                  <span className="block text-sm text-[#5B6B78] mt-0.5"><b className="font-semibold text-ink">Look at:</b> {c.lookAt}</span>
                </span>
                <ChevronDown className={`w-4 h-4 text-deep mt-1 transition-transform ${open ? "rotate-180" : ""}`} />
              </button>
              {open && (
                <div className="px-5 pb-5 space-y-4 border-t border-line pt-4">
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <section className="rounded-xl border border-line border-t-4 border-t-[#F2B46B] bg-offwhite p-4 space-y-2.5 min-w-0">
                      <h3 className="eyebrow">Plaintiff's support</h3>
                      {c.support.map((s) => <StatementCard key={s.id} s={s} src={srcOf(s.sourceId)} />)}
                    </section>
                    <section className="rounded-xl border border-line border-t-4 border-t-[#4FB97A] bg-offwhite p-4 space-y-2.5 min-w-0">
                      <h3 className="eyebrow">Defense rebuttal on file</h3>
                      {c.rebuttal.length ? c.rebuttal.map((s) => <StatementCard key={s.id} s={s} src={srcOf(s.sourceId)} />) : <p className="text-sm text-[#5B6B78]">Nothing in the case documents rebuts this yet.</p>}
                    </section>
                  </div>
                  {c.analysis && <Notes notes={c.analysis} />}
                  {c.conflicts.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {c.conflicts.map((id) => <button key={id} type="button" onClick={() => onOpenConflict(id)} className="inline-flex items-center gap-1 text-xs font-semibold text-deep hover:text-ink">{id} · {conflictOf(id)?.title} <ArrowRight className="w-3.5 h-3.5" /></button>)}
                    </div>
                  )}
                  <div>
                    <h3 className="eyebrow mb-1.5">Evidence gaps</h3>
                    <ul className="space-y-1">
                      {c.gaps.map((g) => <li key={g} className="text-sm text-ink flex items-start gap-2"><FileWarning className="w-4 h-4 text-[#B45309] mt-0.5 shrink-0" />{g}</li>)}
                      {gapsFor(c).map((g) => { const s = gapStatus(g.match); return <li key={g.id} className="text-xs text-[#5B6B78] pl-6">{g.id} {g.item}: <span className={`${TONE_PILL[s.tone] ?? TONE_PILL[""]}`}>{s.label}</span></li>; })}
                    </ul>
                  </div>
                  <DecisionPanel caseId={caseId} itemKey={`claim:${c.id}`} title="Attorney position" options={POSITIONS} needsOwner={["Investigate further", "Need more information"]} current={dec[`claim:${c.id}`]} />
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function ProviderTable({ ev }: { ev: CaseEvidence }) {
  const billing = ev.claims.find((c) => c.title === "Past medical expenses");
  const line = (re: RegExp) => billing?.support.find((s) => re.test(s.text))?.text.split(": ")[1];
  const med = ev.sources.filter((s) => s.col === "medical" && s.doc);
  if (!med.length) return null;
  const rows = med.map((s) => {
    const head = getDocumentContent(s.doc).blocks.find((b) => b.type === "heading");
    const billed = s.type === "MRI report" ? line(/^Imaging/) : s.type === "Physical therapy notes" ? line(/^Physical therapy/) : s.type === "Treatment record" ? [line(/^Specialist/), line(/^Injections/)].filter(Boolean).join(" + ") || undefined : undefined;
    const issue = /bill|invoice/i.test(s.title) && s.type !== "Treatment record" ? "File named as bills holds clinical notes; no charges" : !billing ? "No bill on file for this provider" : !billed ? "No charge for this provider in the billing summary" : "Summary amount only; no itemized bill";
    return { s, provider: head && head.type === "heading" ? head.text : s.title, billed, issue };
  });
  return (
    <section className="lg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-line"><h2 className="section-header">Treatment providers</h2><p className="secondary-text mt-0.5">{billing ? "Billed amounts come from the billing summary in the treatment record." : "No bill or billing summary is on file for any provider."} Visit counts aren't stated in any record on file.</p></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-offwhite border-b border-line"><tr>{["Provider", "Record", "Date", "Visits", "Billed", "Flag"].map((h) => <th key={h} className="eyebrow text-left px-4 py-2.5">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.s.id} className="align-top">
                <td className="px-4 py-2.5 text-ink font-medium">{r.provider}</td>
                <td className="px-4 py-2.5"><span className="mono-ref break-all">{r.s.title}</span><span className="block text-xs text-[#5B6B78]">{r.s.type}</span></td>
                <td className="px-4 py-2.5 whitespace-nowrap text-[#5B6B78]">{r.s.date ?? "—"}</td>
                <td className="px-4 py-2.5">{NA("Not stated")}</td>
                <td className="px-4 py-2.5 tabular-nums">{r.billed ?? NA("—")}</td>
                <td className="px-4 py-2.5 text-ink">{r.issue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-5 py-3 border-t border-line text-sm text-[#5B6B78]">Medical history: no prior records are on file, so omissions from the plaintiff's history can't be checked yet.</p>
    </section>
  );
}

function AmountTable({ claims }: { claims: Claim[] }) {
  const L = claims.filter((c) => c.amount !== undefined);
  if (!L.length) return null;
  return (
    <section className="lg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-line"><h2 className="section-header">Amounts claimed against the records</h2><p className="secondary-text mt-0.5">A missing document doesn't make an amount false; it stays unverified until reviewed.</p></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-offwhite border-b border-line"><tr><th className="eyebrow text-left px-4 py-2.5">Claim</th><th className="eyebrow text-right px-4 py-2.5">Claimed</th><th className="eyebrow text-right px-4 py-2.5">Records give</th><th className="eyebrow text-right px-4 py-2.5">Difference</th><th className="eyebrow text-left px-4 py-2.5">Status</th></tr></thead>
          <tbody className="divide-y divide-line">
            {L.map((c) => {
              const diff = c.reconciled !== undefined ? Math.round((c.amount! - c.reconciled) * 100) / 100 : undefined;
              return (
                <tr key={c.id}>
                  <td className="px-4 py-2.5"><span className="mono-ref text-deep mr-1.5">{c.id}</span>{c.title}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(c.amount!)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{c.reconciled !== undefined ? fmtMoney(c.reconciled) : NA("Unverified")}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{diff ? <span className="text-[#B45309] font-semibold">{fmtMoney(diff)}</span> : diff === 0 ? "—" : NA("—")}</td>
                  <td className="px-4 py-2.5"><Badge cls={diff ? "pill-progress" : c.reconciled !== undefined ? "pill-complete" : "pill-neutral"}>{diff ? "Disputed portion" : c.reconciled !== undefined ? "Reconciles" : "Pending itemized records"}</Badge></td>
                </tr>
              );
            })}
            <tr className="bg-offwhite font-semibold"><td className="px-4 py-2.5">Economic total claimed in records</td><td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(L.reduce((s, c) => s + c.amount!, 0))}</td><td colSpan={3} /></tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TermsTab({ ev, facts, onOpenConflict }: { ev: CaseEvidence; facts: CaseDetails; onOpenConflict: (id: string) => void }) {
  const demand = num(facts.demandAmount);
  const limitAmount = num(facts.policyLimits) ?? ev.policyLimit?.amount;
  const dateConflict = ev.conflicts.find((c) => c.fact === "Date of the collision");
  const deadline = (label: string, date?: string, verified?: string): { tone: string; title: string; body: ReactNode } => {
    if (!date) return { tone: "warn", title: `${label} not recorded`, body: "Add it in Stage 2 Case Details once it has been calculated and checked." };
    const n = daysUntil(date);
    if (verified !== "Verified") return { tone: "warn", title: `${label} ${fmtDay(date)} is unverified`, body: "No status is worked out from an unverified date." };
    return n !== undefined && n < 0 ? { tone: "crit", title: `${label} passed ${fmtDay(date)}`, body: `${-n} days ago, per the verified date in Case Details.` }
      : { tone: n !== undefined && n <= 30 ? "warn" : "", title: `${label} ${fmtDay(date)}`, body: `${n} days left, per the verified date in Case Details.` };
  };
  const flags: { tone: string; title: string; body: ReactNode; basis: string }[] = [
    ...(demand && limitAmount ? [{ tone: demand >= limitAmount ? "crit" : "", title: demand >= limitAmount ? "Demand at or above the policy limit" : "Demand within the policy limit", body: `Demand ${fmtMoney(demand)} against a limit of ${fmtMoney(limitAmount)}. Excess exposure and any time-limited terms need review.`, basis: "Case Details · policy declarations" }] : []),
    ...(ev.noDemand ? [{ tone: "warn", title: "Demand terms can't be checked", body: "No demand letter is on file, so any deadline, release condition or lien language is unknown.", basis: "Case documents" }] : []),
    ...(dateConflict ? [{ tone: "crit", title: "Date of loss is disputed in the records", body: <>Every deadline that runs from the date of loss depends on it. <button type="button" onClick={() => onOpenConflict(dateConflict.id)} className="font-semibold text-deep hover:text-ink">Open {dateConflict.id}</button></>, basis: "Police report · hospital record" }] : []),
    { ...deadline("Statute of limitations", facts.solDate, facts.solVerified), basis: "Stage 2 Case Details" },
    ...(facts.caseStatus === "Suit" ? [{ ...deadline("Answer due", facts.answerDueDate, facts.answerVerified), basis: "Stage 2 Case Details" }] : []),
    ...(ev.coverage ? [{ tone: "warn", title: "Coverage for a vehicle loss needs review", body: <>The loss involves a commercial truck, and the policy on file is a general liability policy with this auto wording: “{ev.coverage.policy.text}”. Whether it responds is a question for coverage review, not a conclusion.</>, basis: `${ev.policyLimit?.source.title ?? "Policy"} · police report` }] : []),
    { tone: "", title: "Lien and health-insurer status not recorded", body: "No lien, Medicare or health-insurer information is on file.", basis: "Case documents" },
  ];
  const terms: [string, ReactNode][] = [
    ["Amount demanded", facts.demandAmount ? `$${facts.demandAmount.replace(/^\$/, "")}` : NA()],
    ["Demand type", NA(ev.noDemand ? "No demand letter on file" : "Not recorded")],
    ["Deadline", NA()],
    ["Conditions and release terms", NA(ev.noDemand ? "No demand letter on file" : "Not recorded")],
    ["Carrier response", NA()],
    ["Offer date and amount", NA()],
    ["Status", facts.demandStatus ?? NA()],
  ];
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-5 items-start">
      <section className="lg-card p-5">
        <h2 className="section-header mb-3">Demand terms</h2>
        <dl className="grid grid-cols-[150px_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
          {terms.map(([k, v]) => <Fragment key={k}><dt className="text-[#5B6B78]">{k}</dt><dd className="text-ink break-words">{v}</dd></Fragment>)}
        </dl>
        <p className="text-xs text-[#5B6B78] mt-3">Amounts and status come from Stage 2 Case Details; nothing here is calculated from legal rules.</p>
      </section>
      <section className="lg-card p-5">
        <h2 className="section-header mb-3">Risk flags</h2>
        <ul className="space-y-2.5">
          {flags.map((fl, i) => (
            <li key={i} className={`rounded-xl border px-4 py-3 ${fl.tone === "crit" ? "bg-[#FEF2F2] border-[#FBD5D5]" : fl.tone === "warn" ? "bg-[#FFF7ED] border-[#FDE6C8]" : "bg-white border-line"}`}>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <p className="text-sm font-semibold text-ink">{fl.title}</p>
                <span className="text-[11px] text-[#5B6B78]">{fl.basis}</span>
              </div>
              <p className="text-sm text-ink mt-1 leading-relaxed">{fl.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
