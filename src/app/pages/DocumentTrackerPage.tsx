import { useMemo, useState } from "react";
import { ChevronLeft, RefreshCw, Plus, Inbox, Mail } from "lucide-react";
import { toast } from "sonner";
import { StageNavigator } from "../components/StageNavigator";
import type { CaseDocument } from "../types/case";
import { resolveCasePolicy } from "../insurance/casePolicy";
import { useCaseDetails } from "../intake/caseDetailsStore";
import { type CaseCtx, isDone, fmtTime } from "../tracker/trackerData";
import { useTracker, refreshLocal } from "../tracker/trackerStore";
import { RequestTracker } from "../tracker/RequestTracker";
import { CaseMailbox } from "../tracker/CaseMailbox";
import { NewRequestDrawer } from "../tracker/NewRequestDrawer";

function Ring({ pct }: { pct: number }) {
  const R = 18, C = 2 * Math.PI * R;
  return (
    <span className="relative inline-flex w-[46px] h-[46px] shrink-0">
      <svg width="46" height="46" viewBox="0 0 46 46" aria-hidden="true">
        <circle cx="23" cy="23" r={R} fill="none" stroke="var(--color-track)" strokeWidth="5" />
        <circle cx="23" cy="23" r={R} fill="none" stroke="var(--color-brand)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${C * pct} ${C}`} transform="rotate(-90 23 23)" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-ink">{Math.round(pct * 100)}%</span>
    </span>
  );
}

export function DocumentTrackerPage({ caseData, documents, stage, backLabel, onBack, onStageClick }: {
  caseData: any; documents: CaseDocument[]; stage: string; backLabel: string; onBack: () => void; onStageClick: (s: string) => void;
}) {
  const saved = useCaseDetails(caseData?.caseId);
  const policy = useMemo(() => resolveCasePolicy(caseData, documents), [caseData, documents]);
  const ctx: CaseCtx = {
    caseId: caseData.caseId,
    caseName: caseData.caseName,
    plaintiff: caseData.plaintiff,
    jurisdiction: caseData.jurisdiction,
    dateOfIncident: caseData.dateOfIncident,
    insured: saved?.insuredName ?? policy.namedInsured,
    insurer: saved?.insurerName ?? policy.insurer,
  };
  const { requests, mail, refreshedAt } = useTracker(ctx.caseId);
  const [tab, setTab] = useState<"tracker" | "mail">("tracker");
  const [drawer, setDrawer] = useState(false);
  const [focus, setFocus] = useState<{ id: string; n: number } | undefined>();

  const done = requests.filter(isDone).length;
  const pages = requests.reduce((a, r) => a + (r.pages || 0), 0);
  const unread = mail.filter((m) => m.unread).length;
  const openRequest = (id: string) => { setTab("tracker"); setFocus({ id, n: Date.now() }); };

  return (
    <div className="min-h-screen bg-wash">
      <div className="sticky top-0 z-40 bg-white">
        <div className="max-w-[1400px] mx-auto px-8 py-4 flex items-center gap-4">
          <button onClick={onBack} className="flex items-center gap-2 text-sm text-deep hover:text-ink transition-colors">
            <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />{backLabel}
          </button>
          <div className="text-sm text-[#5B6B78] ml-auto truncate">
            {ctx.caseName} <span className="mx-2">›</span> <span className="text-ink font-medium">Document Tracker</span>
          </div>
        </div>
      </div>
      <StageNavigator currentStage={stage} onStageClick={onStageClick} />

      <div className="max-w-[1400px] mx-auto p-8 space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <Ring pct={requests.length ? done / requests.length : 0} />
            <div>
              <div className="eyebrow">Document Tracker · {ctx.caseId}</div>
              <h1 className="text-[24px] font-semibold text-ink leading-tight tracking-tight">Document requests</h1>
              <p className="text-sm text-[#5B6B78] mt-0.5">{done} of {requests.length} complete · {pages.toLocaleString()} page{pages === 1 ? "" : "s"} collected</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-xs text-[#5B6B78]">{refreshedAt ? `Refreshed locally at ${fmtTime(refreshedAt)}` : "Stored in this browser"}</span>
            <button type="button" aria-label="Refresh" title="Reload what this browser has stored"
              onClick={() => { refreshLocal(ctx.caseId); toast("Refreshed from this browser. No email or vendor feed is connected."); }}
              className="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-line bg-white text-[#5B6B78] hover:text-ink hover:border-brand">
              <RefreshCw className="w-4 h-4" strokeWidth={1.75} />
            </button>
            <button type="button" onClick={() => setDrawer(true)} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-brand hover:bg-deep text-white text-sm font-semibold">
              <Plus className="w-4 h-4" />New request
            </button>
          </div>
        </div>

        <div role="tablist" aria-label="Document Tracker" className="grid grid-cols-2 gap-1.5 bg-track border border-line rounded-xl p-1.5 max-w-[620px]">
          {([["tracker", "Request Tracker", "Status of every request", Inbox], ["mail", "Case Mailbox", "Case email, threaded", Mail]] as const).map(([k, l, s, I]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`relative flex items-center gap-2.5 text-left rounded-lg px-3 py-2 transition-colors ${tab === k ? "bg-white shadow-sm text-deep" : "text-[#5B6B78] hover:text-ink"}`}>
              <I className="w-4 h-4 shrink-0" strokeWidth={1.75} />
              <span className="min-w-0"><b className="block text-sm font-semibold text-ink">{l}</b><span className="block text-xs truncate">{s}</span></span>
              {k === "mail" && unread > 0 && <span className="ml-auto text-[11px] font-semibold rounded-full bg-brand text-white px-2 py-0.5">{unread} unread</span>}
            </button>
          ))}
        </div>

        <div className={tab === "tracker" ? "" : "hidden"}>
          <RequestTracker ctx={ctx} requests={requests} mail={mail} focus={focus} onNew={() => setDrawer(true)} />
        </div>
        <div className={tab === "mail" ? "" : "hidden"}>
          <CaseMailbox ctx={ctx} mail={mail} requests={requests} onOpenRequest={openRequest} />
        </div>
      </div>

      {drawer && (
        <NewRequestDrawer ctx={ctx} onClose={() => setDrawer(false)} onCreated={(id, msg) => {
          setDrawer(false);
          openRequest(id);
          toast(msg);
        }} />
      )}
    </div>
  );
}
