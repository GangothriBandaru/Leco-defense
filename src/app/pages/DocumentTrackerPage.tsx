import { useMemo, useState } from "react";
import { ChevronLeft, RefreshCw, Plus, Inbox, Mail } from "lucide-react";
import { toast } from "sonner";
import { StageNavigator } from "../components/StageNavigator";
import type { CaseDocument } from "../types/case";
import { resolveCasePolicy } from "../insurance/casePolicy";
import { useCaseDetails } from "../intake/caseDetailsStore";
import { type CaseCtx, fmtTime } from "../tracker/trackerData";
import { useTracker, refreshLocal } from "../tracker/trackerStore";
import { RequestTracker } from "../tracker/RequestTracker";
import { CaseMailbox } from "../tracker/CaseMailbox";
import { NewRequestDrawer } from "../tracker/NewRequestDrawer";

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
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-[22px] font-semibold text-ink leading-tight tracking-tight">Document requests</h1>
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

        <div role="tablist" aria-label="Document Tracker" className="grid grid-cols-2 gap-1 bg-track rounded-xl p-1 max-w-[640px]">
          {([["tracker", "Request Tracker", "Status of every request", Inbox], ["mail", "Case Mailbox", "Case email, threaded", Mail]] as const).map(([k, l, s, I]) => {
            const on = tab === k;
            return (
              <button key={k} type="button" role="tab" aria-selected={on} onClick={() => setTab(k)}
                className={`flex items-center gap-3 text-left rounded-lg px-3 py-2.5 min-w-0 transition-colors ${on ? "bg-white border border-line shadow-[0_1px_2px_rgba(14,58,71,0.06)]" : "border border-transparent hover:bg-white/60"}`}>
                <span className={`w-8 h-8 rounded-lg inline-flex items-center justify-center shrink-0 ${on ? "bg-tint text-deep" : "bg-white/70 text-[#5B6B78]"}`}>
                  <I className="w-4 h-4" strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <b className={`block text-sm font-semibold truncate ${on ? "text-ink" : "text-[#3C4F5C]"}`}>{l}</b>
                  <span className="block text-xs text-[#5B6B78] truncate">{s}</span>
                </span>
                {k === "mail" && unread > 0 && <span className="text-[11px] font-semibold rounded-full bg-brand text-white px-2 py-0.5 whitespace-nowrap">{unread} unread</span>}
              </button>
            );
          })}
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
