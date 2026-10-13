import React, { useState, useEffect } from "react";
import {
  Eye, Sparkles, Download, FileText, ListChecks, Info, CheckCircle,
  Bot, Send, ChevronLeft, ChevronRight, ChevronDown, ZoomIn, ZoomOut, X, Search,
  Play, Pause, Clock,
} from "lucide-react";
import { useNotes } from "../notes/NotesContext";
import { getDocumentContent, type DocBlock } from "./documentText";
import { fileKind, FileTypeIcon, FileTypeTag, FILE_KIND_LABEL, type FileKind } from "./fileType";
import { EVIDENCE_INTEL } from "../workspace/evidenceData";

/* ────────────────────────────────────────────────────────────────────────────
   Standardized document actions.
   Pattern: Preview | Insights | Download. Preview & Insights both open the same
   unified Document Workspace; Download is a direct action.
   ──────────────────────────────────────────────────────────────────────────── */

export function DocActions({
  onPreview,
  onInsights,
  onDownload,
  size = "md",
  disabled,
}: {
  onPreview?: () => void;
  onInsights?: () => void;
  onDownload?: () => void;
  size?: "sm" | "md";
  /** Why an action is unavailable right now — the button is disabled and says so. */
  disabled?: { preview?: string; insights?: string; download?: string };
}) {
  const pad = size === "sm" ? "p-1.5" : "p-2";
  const icon = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";
  const base = `${pad} rounded-lg transition-colors`;
  const labelPad = size === "sm" ? "px-2.5 py-1.5" : "px-3.5 py-2";
  return (
    <div className="flex items-center justify-end gap-1.5">
      <button
        type="button"
        title={disabled?.preview ?? "Preview"}
        disabled={!!disabled?.preview}
        onClick={(e) => { e.stopPropagation(); onPreview?.(); }}
        className={`${labelPad} bg-white border border-line text-ink rounded-lg text-sm font-medium hover:bg-wash transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white`}
      >
        <Eye className={icon} strokeWidth={1.75} /> Preview
      </button>
      <button
        type="button"
        title={disabled?.insights ?? "Insights"}
        disabled={!!disabled?.insights}
        onClick={(e) => { e.stopPropagation(); onInsights?.(); }}
        className={`${labelPad} bg-white border border-line text-deep rounded-lg text-sm font-medium hover:bg-tint transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white`}
      >
        <Sparkles className={icon} strokeWidth={1.75} /> Insights
      </button>
      <button
        type="button"
        title={disabled?.download ?? "Download"}
        aria-label="Download"
        disabled={!!disabled?.download}
        onClick={(e) => { e.stopPropagation(); onDownload?.(); }}
        className={`${base} text-ink hover:bg-tint disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent`}
      >
        <Download className={icon} strokeWidth={1.75} />
      </button>
    </div>
  );
}

// Simulated document intelligence — in production this reflects real extraction.
// Insights are computed across ALL supporting documents in the set, not just one.
export type DocInsights = {
  summary: string;
  keyPoints: string[];
  entities: { label: string; value: string }[];
  supportingDocs: string[];
  confidence: { level: string; score: number };
  /** Images: what is visible. Video / audio: the important moments. */
  observations?: string[];
  moments?: { time: string; text: string }[];
};

// Images, video and audio have no document text, so their insights come from
// the analysis the case already holds for that file — what an image shows,
// the moments in a recording. Media with no analysis on file says so rather
// than borrowing a document's findings.
function buildMediaInsights(docs: any[], kind: Exclude<FileKind, "document">): DocInsights {
  const primary = docs[0] ?? {};
  const name = String(primary.name ?? "");
  const intel = EVIDENCE_INTEL[name.toLowerCase()];
  const entities = [
    { label: "Type", value: FILE_KIND_LABEL[kind] },
    ...(primary.source ? [{ label: "Source", value: String(primary.source) }] : []),
    ...(primary.date ? [{ label: "Date", value: String(primary.date) }] : []),
  ];
  if (!intel) {
    return {
      summary: `This ${FILE_KIND_LABEL[kind].toLowerCase()} has not been through detailed analysis yet, so no findings are shown for it.`,
      keyPoints: [],
      entities,
      supportingDocs: docs.map((d) => d.name),
      confidence: { level: "Not analysed", score: 0 },
    };
  }
  return {
    summary: intel.summary,
    keyPoints: intel.keyFacts.map((f) => f.text),
    entities,
    supportingDocs: docs.map((d) => d.name),
    confidence: intel.confidence,
    observations: intel.observations,
    moments: intel.moments,
  };
}

function buildDocInsights(docs: any[]): DocInsights {
  const primary = docs[0] ?? {};
  const kind = fileKind(String(primary.name ?? ""));
  if (kind !== "document") return buildMediaInsights(docs, kind);
  return {
    summary: "Spinal MRI confirms a herniated L4-L5 disc consistent with the claimed injury.",
    keyPoints: [
      "Objective injury finding supports causation.",
      "Treatment dates fall within the injury window.",
      "$18,450 in billing usable for damages.",
    ],
    entities: [
      { label: "Provider", value: "St. Mary's Medical" },
      { label: "Date", value: primary?.date ?? "Jun 1, 2026" },
    ],
    supportingDocs: docs.map((d) => d.name),
    confidence: { level: "High", score: 92 },
  };
}

function InsightBlock({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5 text-deep" strokeWidth={1.75} />
        <span className="text-xs font-semibold uppercase tracking-wide text-[#5B6B78]">{title}</span>
      </div>
      {children}
    </div>
  );
}

/* The AI Intelligence panel that fills the right 40% of the Document Workspace.
   Default = AI Insights. "Chat With AI" transforms this same panel into a chat
   interface in place — the PDF viewer on the left stays visible throughout.
   When `onBackToPreview` is provided, a back control returns to the document-only
   Preview layout (80% viewer / 20% action rail). */
function AiIntelligencePanel({ docs, onDownload, startInChat = false, onBackToPreview, insights: insightsOverride }: { docs: any[]; onDownload?: () => void; startInChat?: boolean; onBackToPreview?: () => void; insights?: DocInsights }) {
  const [chatOpen, setChatOpen] = useState(startInChat);
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [input, setInput] = useState("");
  const insights = insightsOverride ?? buildDocInsights(docs);
  const subjectLabel = docs.length > 1 ? `${docs.length} supporting documents` : (docs[0]?.name ?? "document");

  const send = (text?: string) => {
    const msg = text ?? input;
    if (!msg.trim()) return;
    setMessages((prev) => [
      ...prev,
      { role: "user", content: msg },
      { role: "assistant", content: "Based on this document, here is a simulated LECO analysis response. In production this would reflect the actual document content." },
    ]);
    setInput("");
  };

  if (chatOpen) {
    return (
      <div className="w-full h-full flex flex-col bg-white">
        {/* Chat header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-tint flex items-center justify-center">
              <Bot className="w-4 h-4 text-deep" strokeWidth={1.75} />
            </div>
            <div>
              <div className="text-sm font-semibold text-ink leading-tight">AI Assistant</div>
              <div className="text-xs text-[#5B6B78] font-mono truncate max-w-[180px]">{subjectLabel}</div>
            </div>
          </div>
          <button onClick={() => setChatOpen(false)} className="flex items-center gap-1 text-xs font-medium text-deep hover:text-ink transition-colors">
            <ChevronLeft className="w-3.5 h-3.5" strokeWidth={1.75} /> Insights
          </button>
        </div>

        {/* Conversation history */}
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-[#5B6B78] mb-3">Try asking:</p>
              {["Summarize this document", "What injuries are mentioned?", "Create a treatment timeline", "Does this support liability?", "Identify key findings"].map((p) => (
                <button key={p} onClick={() => send(p)} className="w-full text-left text-xs text-ink bg-wash hover:bg-tint hover:text-deep border border-line hover:border-soft rounded-lg px-3 py-2.5 transition-colors">
                  {p}
                </button>
              ))}
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={i} className={msg.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${msg.role === "user" ? "bg-brand text-white" : "bg-track text-ink"}`}>
                  {msg.content}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Message input + send */}
        <div className="border-t border-line p-4 shrink-0">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Ask anything about this document..."
              autoFocus
              className="flex-1 bg-wash border border-line rounded-lg px-3 py-2 text-sm placeholder:text-[#5B6B78] focus:outline-none focus:border-brand transition-colors"
            />
            <button onClick={() => send()} className="px-3 py-2 bg-brand hover:bg-deep text-white rounded-lg transition-colors">
              <Send className="w-4 h-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Default state — AI Insights
  return (
    <div className="w-full h-full flex flex-col bg-white">
      {/* Panel header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-line shrink-0">
        <div className="flex items-center gap-2">
          {onBackToPreview && (
            <button onClick={onBackToPreview} title="Back to preview" className="p-1 -ml-1 hover:bg-tint rounded-lg transition-colors">
              <ChevronLeft className="w-4 h-4 text-[#5B6B78]" strokeWidth={1.75} />
            </button>
          )}
          <Sparkles className="w-4 h-4 text-deep" strokeWidth={1.75} />
          <span className="text-sm font-semibold text-ink">AI Insights</span>
        </div>
        <span className={`pill ${insights.confidence.score >= 80 ? "pill-complete" : insights.confidence.score > 0 ? "pill-progress" : "pill-neutral"}`}>
          {insights.confidence.score > 0 ? `${insights.confidence.level} · ${insights.confidence.score}%` : insights.confidence.level}
        </span>
      </div>

      {/* Scrollable insights — only the points that matter at a glance */}
      <div className="flex-1 overflow-auto p-5 space-y-5">
        <InsightBlock icon={FileText} title="Summary">
          <p className="text-sm text-ink leading-relaxed">{insights.summary}</p>
        </InsightBlock>

        {insights.observations && insights.observations.length > 0 && (
          <InsightBlock icon={Eye} title="What the Image Shows">
            <ul className="space-y-1.5">
              {insights.observations.map((o, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-ink leading-relaxed">
                  <CheckCircle className="w-3.5 h-3.5 text-green-600 mt-0.5 shrink-0" strokeWidth={1.75} />
                  <span>{o}</span>
                </li>
              ))}
            </ul>
          </InsightBlock>
        )}

        {insights.moments && insights.moments.length > 0 && (
          <InsightBlock icon={Clock} title="Important Moments">
            <ul className="space-y-1.5">
              {insights.moments.map((m) => (
                <li key={m.time} className="flex items-start gap-2 text-sm text-ink leading-relaxed">
                  <span className="mono-ref shrink-0 mt-px">{m.time}</span>
                  <span>{m.text}</span>
                </li>
              ))}
            </ul>
          </InsightBlock>
        )}

        {insights.keyPoints.length > 0 && (
          <InsightBlock icon={ListChecks} title="Key Points">
            <ul className="space-y-1.5">
              {insights.keyPoints.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-ink leading-relaxed">
                  <CheckCircle className="w-3.5 h-3.5 text-green-600 mt-0.5 shrink-0" strokeWidth={1.75} />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </InsightBlock>
        )}

        <InsightBlock icon={Info} title="Key Details">
          <div className="flex flex-wrap gap-2">
            {insights.entities.map(({ label, value }) => (
              <span key={label} className="inline-flex items-center gap-1.5 bg-wash border border-line rounded-lg px-2.5 py-1 text-xs">
                <span className="text-[#5B6B78]">{label}</span>
                <span className="font-semibold text-ink">{value}</span>
              </span>
            ))}
          </div>
        </InsightBlock>

        <InsightBlock icon={FileText} title="Supporting Documents">
          <ul className="space-y-1.5">
            {insights.supportingDocs.map((d) => (
              <li key={d} className="flex items-center gap-2 text-sm text-ink min-w-0">
                <FileTypeIcon name={d} className="w-3.5 h-3.5 text-[#5B6B78] shrink-0" />
                <span className="font-mono text-xs truncate">{d}</span>
                <FileTypeTag name={d} className="ml-auto" />
              </li>
            ))}
          </ul>
        </InsightBlock>
      </div>

      {/* Actions — live inside the AI panel */}
      <div className="border-t border-line p-4 shrink-0 space-y-2">
        <button
          onClick={() => setChatOpen(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-brand hover:bg-deep text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Bot className="w-4 h-4 shrink-0" strokeWidth={1.75} />
          Ask Questions
        </button>
        <button
          onClick={() => onDownload?.()}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-wash border border-line text-ink rounded-lg text-sm font-medium transition-colors"
        >
          <Download className="w-4 h-4 shrink-0" strokeWidth={1.75} />
          Download
        </button>
      </div>
    </div>
  );
}

/* The Preview action rail that fills the right 20% of the Document Workspace
   in Preview mode. The viewer takes 80% and AI insights are NOT shown by default —
   the rail just offers three actions: Insights, Chat with AI, Download. */
function PreviewActionRail({ onInsights, onChat, onDownload }: { onInsights: () => void; onChat: () => void; onDownload?: () => void }) {
  const btn = "w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-sm font-medium border transition-colors";
  return (
    <div className="w-full h-full flex flex-col bg-white p-4 gap-2">
      <button onClick={onInsights} className={`${btn} bg-tint border-brand text-deep hover:bg-white`}>
        <Sparkles className="w-4 h-4 shrink-0" strokeWidth={1.75} /> Insights
      </button>
      <button onClick={onChat} className={`${btn} bg-white border-line text-ink hover:bg-wash`}>
        <Bot className="w-4 h-4 shrink-0" strokeWidth={1.75} /> Chat with AI
      </button>
      <button onClick={() => onDownload?.()} className={`${btn} bg-white border-line text-ink hover:bg-wash`}>
        <Download className="w-4 h-4 shrink-0" strokeWidth={1.75} /> Download
      </button>
    </div>
  );
}

/* The Document Context Panel — replaces the bare action rail in preview mode.
   Keeps the attorney oriented: which damage category, how much, how many docs,
   the selected document (+ the rest on demand), and a collapsed AI summary. */
function DocumentContextPanel({
  ctx, docs, activeIndex, onSelectDoc, onInsights, onChat, onDownload,
}: {
  ctx: DocContextPanel;
  docs: any[];
  activeIndex: number;
  onSelectDoc: (idx: number) => void;
  onInsights: () => void;
  onChat: () => void;
  onDownload?: () => void;
}) {
  const [docsOpen, setDocsOpen] = useState(false);
  const activeDoc = docs[activeIndex] ?? docs[0];
  const others = docs.filter((_, i) => i !== activeIndex);
  const btn = "w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-sm font-medium border transition-colors";
  return (
    <div className="w-full h-full flex flex-col bg-white overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Document Summary */}
        <div>
          <div className="eyebrow mb-2">Document Summary</div>
          <div className="space-y-2.5">
            {ctx.summary.map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between gap-3">
                <span className="text-xs text-[#5B6B78]">{label}</span>
                <span className="text-sm font-semibold text-ink text-right">{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-line" />

        {/* Documents — selected doc + reveal the rest */}
        <div>
          <div className="eyebrow mb-2">Documents</div>
          <div className="flex items-center gap-2 rounded-lg border border-brand bg-tint px-3 py-2">
            <FileTypeIcon name={String(activeDoc?.name ?? "")} />
            <span className="text-xs font-medium text-deep truncate">{activeDoc?.name}</span>
          </div>
          {others.length > 0 && (
            <>
              <button
                onClick={() => setDocsOpen((o) => !o)}
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-deep hover:text-ink transition-colors"
              >
                {docsOpen ? "Show less" : `+${others.length} More`}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${docsOpen ? "rotate-180" : ""}`} strokeWidth={1.75} />
              </button>
              {docsOpen && (
                <div className="mt-2 space-y-1.5">
                  {docs.map((d, i) => (
                    i === activeIndex ? null : (
                      <button
                        key={(d.id ?? d.name) + i}
                        onClick={() => onSelectDoc(i)}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-line bg-white text-left hover:bg-wash transition-colors"
                      >
                        <FileTypeIcon name={d.name} />
                        <span className="text-xs text-ink truncate">{d.name}</span>
                      </button>
                    )
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Actions — pinned at the bottom */}
      <div className="border-t border-line p-4 space-y-2 shrink-0">
        <button onClick={onInsights} className={`${btn} bg-tint border-brand text-deep hover:bg-white`}>
          <Sparkles className="w-4 h-4 shrink-0" strokeWidth={1.75} /> Insights
        </button>
        <button onClick={onChat} className={`${btn} bg-white border-line text-ink hover:bg-wash`}>
          <Bot className="w-4 h-4 shrink-0" strokeWidth={1.75} /> Chat with AI
        </button>
        <button onClick={() => onDownload?.()} className={`${btn} bg-white border-line text-ink hover:bg-wash`}>
          <Download className="w-4 h-4 shrink-0" strokeWidth={1.75} /> Download
        </button>
      </div>
    </div>
  );
}

/* Renders one synthesized document-text block (heading / paragraph / fields / list). */
function DocBlockView({ block }: { block: DocBlock }) {
  switch (block.type) {
    case "heading":
      return <h3 className="text-[13px] font-semibold uppercase tracking-wide text-deep border-b border-line pb-1.5 mt-1">{block.text}</h3>;
    case "paragraph":
      return <p className="text-[13px] leading-relaxed text-ink">{block.text}</p>;
    case "list":
      return (
        <ul className="space-y-1.5">
          {block.items.map((it, i) => (
            <li key={i} className="flex items-start gap-2 text-[13px] leading-relaxed text-ink">
              <span className="mt-2 w-1 h-1 rounded-full bg-soft shrink-0" />
              <span>{it}</span>
            </li>
          ))}
        </ul>
      );
    case "fields":
      return (
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          {block.pairs.map(([label, value]) => (
            <div key={label} className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wide text-[#5B6B78]">{label}</span>
              <span className="text-[13px] text-ink font-medium">{value}</span>
            </div>
          ))}
        </div>
      );
    default:
      return null;
  }
}

/* The document "page" — renders the actual (simulated) full text of the active
   document so reviewers can read it inline. Images show a scene placeholder with
   a caption since they have no body text. */
function DocumentPage({ doc }: { doc: any }) {
  const content = getDocumentContent(doc);
  return (
    <div className="flex-1 overflow-auto bg-track flex justify-center items-start p-8">
      <div className="bg-white rounded-xl shadow-sm w-full max-w-2xl min-h-[500px] border border-line p-8">
        {content.kind === "image" && (
          <div className="mb-6 rounded-lg bg-track border border-line h-56 flex items-center justify-center">
            <div className="text-center">
              <FileText className="w-12 h-12 text-[#9BDAEC] mx-auto mb-2" strokeWidth={1.75} />
              <p className="text-xs text-[#5B6B78] font-mono">{String(doc?.name ?? "")}</p>
            </div>
          </div>
        )}
        <div className="space-y-3">
          {content.blocks.map((block, i) => (
            <DocBlockView key={i} block={block} />
          ))}
        </div>
        <div className="mt-8 pt-3 border-t border-line flex items-center justify-between text-[10px] text-[#5B6B78] font-mono">
          <span>{String(doc?.name ?? "")}</span>
          <span>Page 1 of 1</span>
        </div>
      </div>
    </div>
  );
}

/* Images, video and audio open in a viewer for their kind rather than on a
   document page. The prototype bundles no media files, so each shows a frame
   for the file with the case's own analysis of it — what an image shows, the
   moments in a recording — beneath. */
function MediaPage({ doc, kind, zoom }: { doc: any; kind: Exclude<FileKind, "document">; zoom: number }) {
  const name = String(doc?.name ?? "");
  const intel = EVIDENCE_INTEL[name.toLowerCase()];
  const moments = intel?.moments ?? [];
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  // A stored original, when the caller has one: shown as it is. When it cannot
  // be shown here, the caller says why.
  const src: string | undefined = doc?.mediaUrl;
  const unavailable: string | undefined = doc?.mediaUnavailable;
  const [broken, setBroken] = useState(false);
  if (src || unavailable) {
    return (
      <div className="flex-1 overflow-auto bg-track flex justify-center items-start p-8">
        <div className="w-full max-w-3xl">
          {src && !broken && kind === "video" && <video src={src} controls className="w-full rounded-xl bg-ink" onError={() => setBroken(true)} />}
          {src && !broken && kind !== "video" && (
            <div style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top center" }} className="transition-transform duration-200">
              <img src={src} alt={name} className="w-full rounded-xl shadow-sm border border-line bg-white" onError={() => setBroken(true)} />
            </div>
          )}
          {(!src || broken) && (
            <div className="bg-white rounded-xl shadow-sm border border-line aspect-[4/3] flex flex-col items-center justify-center gap-3 p-6 text-center">
              <FileTypeIcon name={name} className="w-12 h-12 text-[#9BDAEC]" />
              <p className="text-xs text-[#5B6B78] font-mono">{name}</p>
              <p className="secondary-text max-w-sm">{unavailable ?? "This file cannot be shown in the browser. Download the original to open it in a suitable viewer."}</p>
            </div>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-auto bg-track flex justify-center items-start p-8">
      <div className="w-full max-w-2xl space-y-4">
        {kind === "image" && (
          <div style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top center" }} className="transition-transform duration-200">
            <div className="bg-white rounded-xl shadow-sm border border-line aspect-[4/3] flex flex-col items-center justify-center gap-3">
              <FileTypeIcon name={name} className="w-12 h-12 text-[#9BDAEC]" />
              <p className="text-xs text-[#5B6B78] font-mono">{name}</p>
            </div>
          </div>
        )}
        {kind === "video" && (
          <div className="bg-ink rounded-xl aspect-video flex flex-col items-center justify-center gap-3">
            <FileTypeIcon name={name} className="w-12 h-12 text-soft" />
            <p className="text-xs text-soft font-mono">{name}</p>
            {moments[at] && <p className="text-sm text-white px-6 text-center">{moments[at].time} · {moments[at].text}</p>}
          </div>
        )}
        {kind === "audio" && (
          <div className="bg-white rounded-xl shadow-sm border border-line p-8 flex flex-col items-center justify-center gap-3">
            <FileTypeIcon name={name} className="w-12 h-12 text-[#9BDAEC]" />
            <p className="text-xs text-[#5B6B78] font-mono">{name}</p>
            {moments[at] && <p className="text-sm text-ink px-6 text-center">{moments[at].time} · {moments[at].text}</p>}
          </div>
        )}

        {/* Playback — video and audio */}
        {kind !== "image" && (
          <div className="flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-3">
            <button
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? "Pause" : "Play"}
              className="w-9 h-9 rounded-full bg-brand hover:bg-deep text-white flex items-center justify-center transition-colors shrink-0"
            >
              {playing ? <Pause className="w-4 h-4" strokeWidth={2} /> : <Play className="w-4 h-4" strokeWidth={2} />}
            </button>
            <input
              type="range"
              min={0}
              max={Math.max(0, moments.length - 1)}
              value={at}
              onChange={(e) => setAt(Number(e.target.value))}
              className="flex-1 accent-[#3FB5D7]"
              aria-label="Position"
            />
            <span className="mono-ref shrink-0">{moments[at]?.time ?? "00:00"}</span>
          </div>
        )}

        {/* The case's own analysis of this file */}
        {kind === "image" && intel?.observations && (
          <div className="rounded-xl border border-line bg-white p-4">
            <div className="eyebrow mb-2">What the image shows</div>
            <ul className="space-y-1.5">
              {intel.observations.map((o) => (
                <li key={o} className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-deep mt-0.5 shrink-0" strokeWidth={1.75} />
                  <span className="body-text leading-relaxed">{o}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {kind !== "image" && moments.length > 0 && (
          <div className="rounded-xl border border-line bg-white p-4">
            <div className="eyebrow mb-2">Important Moments</div>
            <div className="space-y-1.5">
              {moments.map((m, i) => (
                <button
                  key={m.time}
                  onClick={() => setAt(i)}
                  className={`w-full text-left rounded-lg border px-3 py-2 transition-all ${
                    i === at ? "border-brand bg-tint" : "border-line bg-offwhite hover:border-soft hover:bg-wash"
                  }`}
                >
                  <span className="mono-ref mr-2">{m.time}</span>
                  <span className="body-text">{m.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {!intel && (
          <p className="secondary-text text-center">This {FILE_KIND_LABEL[kind].toLowerCase()} has not been through detailed analysis yet.</p>
        )}
      </div>
    </div>
  );
}

/* The unified Document Workspace modal — split layout that depends on the view:
   • Preview  → Left (80%) document viewer · Right (20%) action rail (Insights / Chat / Download)
   • Insights → Left (60%) document viewer · Right (40%) AI Intelligence panel
   `docs` is the set of supporting documents for the current item (signal/row).
   `initialView` controls how the workspace opens. Renders nothing when `docs` is empty. */
// Context for the preview rail — turns the action-only rail into a Document
// Context Panel (summary rows + documents). `summary` is a flexible label/value
// list so each surface (damages, negligence, violations) can supply its own.
export type DocContextPanel = {
  summary: { label: string; value: string }[];
};

export function DocumentWorkspaceModal(props: {
  docs: any[] | null;
  onClose: () => void;
  onDownload?: () => void;
  initialView?: "preview" | "insights" | "chat";
  onPrev?: () => void;
  onNext?: () => void;
  position?: number; // 1-based index of the current item
  total?: number;    // total navigable items (signals/rows)
  noteContext?: { contextType: string; reference: string }; // auto-attached to notes
  insights?: DocInsights; // override the AI Insights content
  contextPanel?: DocContextPanel; // when set, the preview rail shows category context
}) {
  if (!props.docs || props.docs.length === 0) return null;
  // Remount (reset active tab + view) whenever the document set changes.
  const setKey = props.docs.map((d) => d.id ?? d.name).join("|");
  return <WorkspaceInner key={setKey} {...props} docs={props.docs} />;
}

function WorkspaceInner({
  docs,
  onClose,
  onDownload,
  initialView = "preview",
  onPrev,
  onNext,
  position,
  total,
  noteContext,
  insights,
  contextPanel,
}: {
  docs: any[];
  onClose: () => void;
  onDownload?: () => void;
  initialView?: "preview" | "insights" | "chat";
  onPrev?: () => void;
  onNext?: () => void;
  position?: number;
  total?: number;
  noteContext?: { contextType: string; reference: string };
  insights?: DocInsights;
  contextPanel?: DocContextPanel;
}) {
  const [activeTab, setActiveTab] = useState(0);
  // Document tab strip overflow: show a few pills, collapse the rest into a
  // searchable "+N more docs" dropdown so the strip never scrolls horizontally.
  const [docMenuOpen, setDocMenuOpen] = useState(false);
  const [docSearch, setDocSearch] = useState("");
  // Which workspace view is active. Preview = 80/20 (document only + action rail);
  // insights/chat = 60/40 (document + AI Intelligence panel).
  const [view, setView] = useState<"preview" | "insights" | "chat">(initialView);
  const isPreview = view === "preview";
  const activeDoc = docs[activeTab] ?? docs[0];
  const activeKind: FileKind = activeDoc?.mediaKind ?? fileKind(String(activeDoc?.name ?? ""));
  const [zoom, setZoom] = useState(100);

  // Register evidence/document context so a note taken from here auto-attaches it.
  const { setDocContext } = useNotes();
  const ctxType = noteContext?.contextType ?? "Document";
  const ctxRef = noteContext?.reference ?? activeDoc?.name;
  useEffect(() => {
    setDocContext({ contextType: ctxType, reference: ctxRef });
    return () => setDocContext(null);
  }, [ctxType, ctxRef, setDocContext]);
  const subtitle = [activeDoc.category, activeDoc.source, activeDoc.date].filter(Boolean).join(" · ");
  const canNavigate = (onPrev || onNext) && (total ?? 0) > 1;
  const hasPrev = !!onPrev && (position ?? 1) > 1;
  const hasNext = !!onNext && (position ?? 1) < (total ?? 1);
  return (
    <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-7xl flex flex-col overflow-hidden shadow-sm" style={{ height: "90vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-line shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-base font-semibold text-ink font-mono truncate">{activeDoc.name}</h2>
              <FileTypeTag name={String(activeDoc.name ?? "")} icon />
            </div>
            {subtitle && <p className="text-xs text-[#5B6B78]">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canNavigate && (
              <div className="flex items-center gap-1">
                <button
                  onClick={onPrev}
                  disabled={!hasPrev}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-line text-ink rounded-lg text-sm font-medium hover:bg-wash transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" strokeWidth={1.75} /> Prev
                </button>
                {position && total && <span className="text-xs text-[#5B6B78] tabular-nums px-1">{position} of {total}</span>}
                <button
                  onClick={onNext}
                  disabled={!hasNext}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-line text-ink rounded-lg text-sm font-medium hover:bg-wash transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next <ChevronRight className="w-4 h-4" strokeWidth={1.75} />
                </button>
              </div>
            )}
            <button onClick={onClose} className="p-2 hover:bg-tint rounded-lg transition-colors">
              <X className="w-5 h-5 text-[#5B6B78]" strokeWidth={1.75} />
            </button>
          </div>
        </div>

        {/* Body — split layout */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left — Document Viewer with a tab per supporting document.
              Preview gives the viewer 80%; Insights/Chat share the space 60/40. */}
          <div className="flex flex-col border-r border-line overflow-hidden" style={{ width: isPreview ? (contextPanel ? "70%" : "80%") : "60%" }}>
            {/* Document tabs/chips — only when the signal has multiple documents.
                Beyond MAX_PILLS, the rest collapse into a searchable dropdown. */}
            {docs.length > 1 && (() => {
              const MAX_PILLS = 5;
              const overflow = docs.length > MAX_PILLS;
              // First MAX_PILLS docs; surface the active doc too if it's hidden.
              const visibleIdx = docs.slice(0, MAX_PILLS).map((_, i) => i);
              if (overflow && activeTab >= MAX_PILLS) visibleIdx.push(activeTab);
              const q = docSearch.trim().toLowerCase();
              const matches = docs.map((d, idx) => ({ d, idx })).filter(({ d }) => d.name.toLowerCase().includes(q));
              return (
                <div className="relative border-b border-line bg-white shrink-0">
                  <div className="flex items-center gap-2 px-4 py-2.5 overflow-x-auto">
                    {visibleIdx.map((idx) => {
                      const d = docs[idx];
                      const active = idx === activeTab;
                      return (
                        <button
                          key={(d.id ?? d.name) + idx}
                          onClick={() => setActiveTab(idx)}
                          title={d.name}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border whitespace-nowrap transition-colors ${
                            active
                              ? "bg-tint border-brand text-deep"
                              : "bg-white border-line text-[#5B6B78] hover:border-soft hover:text-ink"
                          }`}
                        >
                          <FileTypeIcon name={d.name} className="w-3.5 h-3.5 shrink-0" />
                          <span className="max-w-[180px] truncate">{d.name}</span>
                        </button>
                      );
                    })}
                    {overflow && (
                      <button
                        onClick={() => setDocMenuOpen((o) => !o)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border whitespace-nowrap transition-colors shrink-0 ${
                          docMenuOpen ? "bg-tint border-brand text-deep" : "bg-white border-line text-deep hover:border-soft"
                        }`}
                      >
                        +{docs.length - MAX_PILLS} more docs
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${docMenuOpen ? "rotate-180" : ""}`} strokeWidth={1.75} />
                      </button>
                    )}
                  </div>

                  {/* Searchable dropdown with the full document list */}
                  {docMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setDocMenuOpen(false)} />
                      <div className="absolute right-4 top-full z-20 mt-1 w-80 max-w-[calc(100%-2rem)] bg-white border border-line rounded-xl shadow-lg overflow-hidden">
                        <div className="p-2 border-b border-line">
                          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-wash border border-line">
                            <Search className="w-3.5 h-3.5 text-[#5B6B78] shrink-0" strokeWidth={1.75} />
                            <input
                              autoFocus
                              value={docSearch}
                              onChange={(e) => setDocSearch(e.target.value)}
                              placeholder="Search documents..."
                              className="flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-[#9BA8B0]"
                            />
                          </div>
                        </div>
                        <div className="max-h-64 overflow-y-auto py-1">
                          {matches.map(({ d, idx }) => (
                            <button
                              key={(d.id ?? d.name) + idx}
                              onClick={() => { setActiveTab(idx); setDocMenuOpen(false); setDocSearch(""); }}
                              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                                idx === activeTab ? "bg-tint text-deep" : "text-ink hover:bg-wash"
                              }`}
                            >
                              <FileTypeIcon name={d.name} />
                              <span className="truncate">{d.name}</span>
                            </button>
                          ))}
                          {matches.length === 0 && (
                            <div className="px-3 py-4 text-center text-xs text-[#5B6B78]">No documents found</div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })()}

            {/* Viewer toolbar */}
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-line bg-wash shrink-0">
              {activeKind === "document" || activeKind === "image" ? (
                <>
                  <button onClick={() => setZoom((z) => Math.max(50, z - 25))} className="p-1.5 hover:bg-tint rounded-lg transition-colors"><ZoomOut className="w-4 h-4 text-[#5B6B78]" strokeWidth={1.75} /></button>
                  <span className="text-xs text-[#5B6B78] tabular-nums">{activeKind === "image" ? zoom : 100}%</span>
                  <button onClick={() => setZoom((z) => Math.min(200, z + 25))} className="p-1.5 hover:bg-tint rounded-lg transition-colors"><ZoomIn className="w-4 h-4 text-[#5B6B78]" strokeWidth={1.75} /></button>
                </>
              ) : (
                <span className="text-xs font-medium text-[#5B6B78]">{FILE_KIND_LABEL[activeKind]} preview</span>
              )}
              <div className="flex-1" />
              {activeKind === "document" && (
                <div className="flex items-center gap-2 text-xs text-[#5B6B78]">
                  <button className="p-1.5 hover:bg-tint rounded-lg transition-colors"><ChevronLeft className="w-4 h-4" strokeWidth={1.75} /></button>
                  <span>Page 1 of 1</span>
                  <button className="p-1.5 hover:bg-tint rounded-lg transition-colors"><ChevronRight className="w-4 h-4" strokeWidth={1.75} /></button>
                </div>
              )}
            </div>

            {/* Viewer area — renders the actual document text for the active tab */}
            {activeKind === "document"
              ? <DocumentPage doc={activeDoc} />
              : <MediaPage key={String(activeDoc?.name)} doc={activeDoc} kind={activeKind} zoom={zoom} />}
          </div>

          {/* Right — Preview shows the action rail (or a Document Context Panel
              when contextPanel is provided); Insights/Chat show the 40% AI panel. */}
          <div className="flex flex-col overflow-hidden shrink-0" style={{ width: isPreview ? (contextPanel ? "30%" : "20%") : "40%" }}>
            {isPreview ? (
              contextPanel ? (
                <DocumentContextPanel
                  ctx={contextPanel}
                  docs={docs}
                  activeIndex={activeTab}
                  onSelectDoc={setActiveTab}
                  onInsights={() => setView("insights")}
                  onChat={() => setView("chat")}
                  onDownload={onDownload}
                />
              ) : (
                <PreviewActionRail
                  onInsights={() => setView("insights")}
                  onChat={() => setView("chat")}
                  onDownload={onDownload}
                />
              )
            ) : (
              <AiIntelligencePanel
                key={view}
                docs={docs}
                insights={insights}
                onDownload={onDownload}
                startInChat={view === "chat"}
                onBackToPreview={() => setView("preview")}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
