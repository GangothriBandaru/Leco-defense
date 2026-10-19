import { useEffect, useState } from "react";
import {
  Camera, ChevronDown, Download, Loader2, ScanLine, Video, Image as ImageIcon,
  AlertTriangle, CheckCircle, X, Info, Upload, Trash2,
} from "lucide-react";
import type { CaseDocument } from "../types/case";
import { classifyDocuments } from "../types/case";
import {
  useMediaEvidence, fileStatus, setStatus, STALLED_AFTER_MS, updateMediaFileDetails, removeMediaFileRecord,
  type MediaFile, type MediaStatus, type PhotoSetEvidence, type VideoEvidence, type MediaRef,
} from "./mediaEvidenceStore";
import { analyseVideo, analyseSet, CHECK_VERSION } from "./mediaAnalysis";
import { inFilter, mediaDocStatus, type DocFilter } from "./docProcessing";
import { getMediaFile, downloadMediaFile, deleteMediaFile } from "./mediaFileStore";
import { DocActions, DocumentWorkspaceModal, RowActionGroup, type DocInsights } from "../components/DocumentWorkspace";

// ── Media evidence ───────────────────────────────────────────────────────────
// A case's videos, photo sets and medical image studies, apart from its
// documents. Everything here — counts, statuses, warnings, the actions on offer
// — is read from the case's media records. Run analysis performs the real file
// check (mediaAnalysis); Preview and Download use the stored original file.

const NEW_BADGE = <span className="pill pill-neutral shrink-0 text-[10px] font-bold tracking-[0.06em]">NEW</span>;
const formatDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const extOf = (name: string) => (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? "").toLowerCase();
const minutesSince = (iso?: string) => (iso ? Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60000)) : 0);

// ── Status ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: MediaStatus }) {
  switch (status) {
    case "processing":
      return <span className="pill bg-tint text-deep border-[#D6F2F7] shrink-0"><Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} /> Processing</span>;
    case "stalled":
      return <span className="pill pill-progress shrink-0"><AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.75} /> Stalled</span>;
    case "ready":
      return <span className="pill pill-complete shrink-0"><CheckCircle className="w-3.5 h-3.5" strokeWidth={1.75} /> Ready</span>;
    case "partly-ready":
      return <span className="pill pill-progress shrink-0">Partly ready</span>;
    case "failed":
      return <span className="pill pill-risk shrink-0"><X className="w-3.5 h-3.5" strokeWidth={1.75} /> Failed</span>;
    default:
      return <span className="pill pill-neutral shrink-0">Pending</span>;
  }
}

/** The line under a file name: what the check found, why it failed, or that it stalled. */
function fileNote(f: MediaFile): { text: string; tone: "muted" | "amber" | "red"; spin?: boolean } | null {
  const s = fileStatus(f);
  if (s === "processing") return { text: "Analysing…", tone: "muted", spin: true };
  if (s === "stalled") return { text: `No progress for ${minutesSince(f.analysisStartedAt)} minutes — the file check stopped before finishing.`, tone: "amber" };
  if (s === "failed") return { text: f.analysisError ?? "The check failed.", tone: "red" };
  if (s === "ready") return { text: f.analysisResult ?? "Checked.", tone: "muted" };
  return null;
}

const NOTE_TONE = { muted: "text-[#5B6B78]", amber: "text-[#B45309]", red: "text-[#B91C1C]" };

// ── Actions ──────────────────────────────────────────────────────────────────

const outline = "inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-line rounded-lg text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

/** The dashboard's standard evidence actions — Preview | Insights | Download —
 *  each disabled, with the reason, when this file cannot support it. */
function FileActions({ file, label, onPreview, onInsights, onEdit, onDelete }: { file: MediaFile; label: string; onPreview: () => void; onInsights: () => void; onEdit: () => void; onDelete: () => void }) {
  // Always offered. Preview and Insights explain an unavailable file in their
  // own view; a download that finds no file says so here.
  const [downloadFailed, setDownloadFailed] = useState(false);
  return (
    <div className="flex flex-col items-end gap-1">
      <RowActionGroup name={label} onEdit={onEdit} onDelete={onDelete}>
        <DocActions
          size="row"
          onPreview={onPreview}
          onInsights={onInsights}
          onDownload={async () => setDownloadFailed(!(await downloadMediaFile(file.storageKey, file.name)))}
          disabled={{ download: file.storageKey ? undefined : "The original file is not stored on this device" }}
        />
      </RowActionGroup>
      {downloadFailed && <span role="alert" className="text-xs text-[#B91C1C]">The original file is not stored on this device.</span>}
    </div>
  );
}

// ── Preview ──────────────────────────────────────────────────────────────────

function PreviewModal({ file, kind, onClose }: { file: MediaFile; kind: "video" | "image"; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const ext = extOf(file.name);
  const viewable = kind === "video" ? ["mp4", "mov", "webm", "m4v"].includes(ext) : ["jpg", "jpeg", "png", "webp", "gif"].includes(ext);
  useEffect(() => {
    let objectUrl: string | null = null;
    getMediaFile(file.storageKey).then((blob) => {
      if (!blob) { setMissing(true); return; }
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [file.storageKey]);
  return (
    <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-line">
          <span className="mono-ref text-ink truncate">{file.name}</span>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => downloadMediaFile(file.storageKey, file.name)} className={`${outline} text-ink hover:bg-wash`}>
              <Download className="w-3.5 h-3.5" strokeWidth={1.75} /> Download
            </button>
            <button onClick={onClose} aria-label="Close" className="p-1.5 hover:bg-tint rounded-lg transition-colors">
              <X className="w-5 h-5 text-[#5B6B78]" strokeWidth={1.75} />
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-[320px] bg-[#F1F3F5] flex items-center justify-center p-6 overflow-auto">
          {missing ? (
            <p className="secondary-text text-center">The original file is not stored on this device, so it cannot be previewed.</p>
          ) : !viewable ? (
            <p className="secondary-text text-center max-w-md">
              {ext === "heic" || ext === "heif" ? "HEIC" : ext === "dcm" || ext === "dicom" ? "DICOM" : ext.toUpperCase()} files can't be shown in the browser. Download the original to open it in a suitable viewer.
            </p>
          ) : !url ? (
            <Loader2 className="w-6 h-6 text-brand animate-spin" strokeWidth={1.75} />
          ) : kind === "video" ? (
            <video src={url} controls className="max-w-full max-h-[70vh] rounded-lg bg-ink" />
          ) : (
            <img src={url} alt={file.name} className="max-w-full max-h-[70vh] rounded-lg shadow-sm" />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Insights ─────────────────────────────────────────────────────────────────
// Insights open the dashboard's Document Workspace, showing the stored file and
// only what its record holds: the file check's outcome, the set and study it
// belongs to, where it came from. No evidence analysis has run on media yet, so
// no findings are shown — the panel says so instead of inventing them.

interface InsightsTarget {
  file: MediaFile;
  kind: "video" | "image";
  label: string;
  source: string;
  uploadedAt: string;
  /** The date as the attorney edited it, when they did. */
  date?: string;
  /** The set or study the file belongs to, and what it can be compared with. */
  group?: { title: string; study?: string; compareWith: string[]; missing?: string };
}

const VIEWABLE = { video: ["mp4", "mov", "webm", "m4v"], image: ["jpg", "jpeg", "png", "webp", "gif"] };

function insightsFor(t: InsightsTarget): DocInsights {
  const status = fileStatus(t.file);
  const summary = {
    ready: `File check complete — ${t.file.analysisResult ?? "the file opens"}. No evidence analysis has been run on this file yet: the evidence-analysis service is not connected, so no findings are shown.`,
    processing: "The file is still being checked. Insights will be available once the check finishes.",
    stalled: "The file check stopped before finishing, so nothing has been measured from this file and no findings are available.",
    failed: `The file check failed: ${t.file.analysisError ?? "no reason was recorded"}. No findings are available for this file.`,
    "not-analysed": t.file.storageKey
      ? "This file has not been checked yet, so no findings are available."
      : "The original file is not stored on this device, so it has not been checked and no findings are available.",
    "partly-ready": "",
  }[status];
  const keyPoints = t.group
    ? [t.group.missing ?? `Case documents to compare with once evidence analysis is available: ${t.group.compareWith.join(", ")}.`]
    : [];
  const statusLabel = { ready: "Ready", processing: "Processing", stalled: "Stalled", failed: "Failed", "not-analysed": "Pending", "partly-ready": "Partly ready" }[status];
  return {
    summary,
    keyPoints,
    entities: [
      { label: "Evidence", value: t.label },
      ...(t.group ? [{ label: t.kind === "image" && t.group.study !== undefined ? "Study" : "Set", value: t.group.study ? `${t.group.title} · ${t.group.study}` : t.group.title }] : []),
      { label: "Source", value: t.source },
      { label: t.date ? "Date" : "Uploaded", value: t.date ?? formatDate(t.uploadedAt) },
      { label: "File size", value: t.file.size ? `${(t.file.size / 1024 / 1024).toFixed(1)} MB` : "Not available" },
      { label: "Status", value: statusLabel },
    ],
    supportingDocs: [t.file.name],
    confidence: { level: "No findings yet", score: 0 },
  };
}

function MediaInsights({ target, onClose }: { target: InsightsTarget; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const ext = extOf(target.file.name);
  const viewable = VIEWABLE[target.kind].includes(ext);
  useEffect(() => {
    let objectUrl: string | null = null;
    if (!viewable) return;
    getMediaFile(target.file.storageKey).then((blob) => {
      if (!blob) { setMissing(true); return; }
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [target.file.storageKey, viewable]);
  const kindName = ext === "heic" || ext === "heif" ? "HEIC" : ext === "dcm" || ext === "dicom" ? "DICOM" : ext.toUpperCase();
  const doc = {
    id: `${target.label}-${target.file.storageKey ?? target.file.name}`,
    name: target.file.name,
    source: target.source,
    date: target.date ?? formatDate(target.uploadedAt),
    category: target.label,
    mediaKind: target.kind,
    mediaUrl: url ?? undefined,
    mediaUnavailable: missing || !target.file.storageKey
      ? "The original file is not stored on this device, so it cannot be shown."
      : !viewable
        ? `${kindName} files can't be shown in the browser. Download the original to open it in a suitable viewer.`
        : url ? undefined : "Loading the file…",
  };
  return (
    <DocumentWorkspaceModal
      docs={[doc]}
      initialView="insights"
      insights={insightsFor(target)}
      noteContext={{ contextType: "Media evidence", reference: `${target.label} · ${target.file.name}` }}
      onClose={onClose}
      onDownload={target.file.storageKey ? () => { void downloadMediaFile(target.file.storageKey, target.file.name); } : undefined}
    />
  );
}

// ── Layout pieces ────────────────────────────────────────────────────────────

const TH = "text-left px-4 py-2.5 eyebrow";

function Category({
  title, icon: Icon, count, children,
}: { title: string; icon: any; count: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-line rounded-xl overflow-hidden bg-white">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full flex items-center justify-between px-5 py-3 bg-[#F6FDFF] hover:bg-tint transition-colors text-left">
        <span className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-deep" strokeWidth={1.75} />
          <span className="text-sm font-semibold text-ink">{title}</span>
          <span className="text-xs font-medium text-[#5B6B78] bg-white border border-line px-2 py-0.5 rounded-full">{count}</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-[#5B6B78] transition-transform ${open ? "" : "-rotate-90"}`} strokeWidth={1.75} />
      </button>
      {open && (
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full min-w-[760px] table-fixed">
            {/* The same column widths in every category, so they line up. */}
            <colgroup>
              <col />
              <col className="w-[104px]" />
              <col className="w-[124px]" />
              <col className="w-[150px]" />
              <col className="w-[152px]" />
            </colgroup>
            <thead className="bg-white border-b border-line">
              <tr>
                <th className={TH}>File Name</th>
                <th className={TH}>Source</th>
                <th className={TH}>Date</th>
                <th className={TH}>Status</th>
                <th className={`${TH} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">{children}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NameCell({ label, file }: { label: string; file: MediaFile }) {
  const note = fileNote(file);
  return (
    <td className="px-4 py-3 align-middle">
      <div className="text-sm font-semibold text-ink truncate" title={file.label ?? label}>{file.label ?? label}</div>
      <div className="mono-ref truncate max-w-[280px]" title={file.name}>{file.name}</div>
      {note && (
        <div className={`text-xs mt-0.5 flex items-center gap-1 ${NOTE_TONE[note.tone]}`}>
          {note.spin && <Loader2 className="w-3 h-3 animate-spin shrink-0" strokeWidth={1.75} />}
          <span className="min-w-0">{note.text}</span>
        </div>
      )}
    </td>
  );
}

/** One media file, with its default details and the details shown. */
interface MediaTarget {
  ref: MediaRef;
  file: MediaFile;
  defaults: { label: string; source: "Attorney" | "Client"; date: string };
  shown: { label: string; source: "Attorney" | "Client"; date: string };
}

function targetOf(ref: MediaRef, file: MediaFile, label: string, source: "Attorney" | "Client" | undefined, uploadedAt: string): MediaTarget {
  const defaults = { label, source: source ?? "Attorney", date: formatDate(uploadedAt) };
  return { ref, file, defaults, shown: { label: file.label ?? defaults.label, source: file.source ?? defaults.source, date: file.date ?? defaults.date } };
}

/** Edit a media file's details — never the image, video or audio itself. */
function EditMediaModal({ target, onClose }: { target: MediaTarget; onClose: () => void }) {
  const [form, setForm] = useState(target.shown);
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    const label = form.label.trim();
    const date = form.date.trim();
    if (!label) { setError("A display name is required."); return; }
    if (!date) { setError("A date is required."); return; }
    const changed = [label !== target.shown.label && "name", form.source !== target.shown.source && "source", date !== target.shown.date && "date"].filter(Boolean);
    if (!changed.length) { onClose(); return; }
    try {
      // Stored only where it differs from the default, so a reset is a reset.
      updateMediaFileDetails(target.ref, {
        label: label === target.defaults.label ? undefined : label,
        source: form.source === target.defaults.source ? undefined : form.source,
        date: date === target.defaults.date ? undefined : date,
      }, `Details edited: ${changed.join(", ")}`);
      onClose();
    } catch {
      setError("The change could not be saved in this browser. Nothing was changed.");
    }
  };
  return (
    <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Edit media details" className="bg-white rounded-xl w-full max-w-md shadow-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <h2 className="card-title">Edit media details</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 hover:bg-tint rounded-lg"><X className="w-4 h-4 text-[#5B6B78]" strokeWidth={1.75} /></button>
        </div>
        <div className="p-6 space-y-4">
          <label className="block">
            <span className="eyebrow block mb-1">Display name</span>
            <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:border-brand" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="eyebrow block mb-1">Source</span>
              <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value as "Attorney" | "Client" })} className="w-full px-3 py-2 rounded-lg border border-line text-sm bg-white focus:outline-none focus:border-brand">
                <option value="Attorney">Attorney</option>
                <option value="Client">Client</option>
              </select>
            </label>
            <label className="block">
              <span className="eyebrow block mb-1">Date</span>
              <input value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:border-brand" />
            </label>
          </div>
          <p className="text-xs text-[#5B6B78]">Details only — the file <span className="mono-ref">{target.file.name}</span> and its check are not changed, and nothing is reprocessed.</p>
          {error && <p role="alert" className="text-sm text-[#B91C1C]">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 bg-wash border-t border-line rounded-b-xl">
          <button onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button onClick={save} className="btn btn-primary">Save changes</button>
        </div>
      </div>
    </div>
  );
}

/** Confirm, then remove the stored original and the file's record. */
function DeleteMediaModal({ target, onClose }: { target: MediaTarget; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    try {
      if (target.file.storageKey) await deleteMediaFile(target.file.storageKey);
    } catch {
      setBusy(false);
      setError("The stored file could not be removed from this browser. The file was not deleted.");
      return;
    }
    try {
      removeMediaFileRecord(target.ref);
      onClose();
    } catch {
      setBusy(false);
      setError("The stored file was removed, but its record could not be updated in this browser. It now shows as not stored.");
    }
  };
  return (
    <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div role="alertdialog" aria-modal="true" aria-label="Delete media file" className="bg-white rounded-xl w-full max-w-md shadow-sm" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-5 space-y-2">
          <h2 className="card-title flex items-center gap-2"><Trash2 className="w-4 h-4 text-[#B91C1C]" strokeWidth={1.75} /> Delete this file?</h2>
          <p className="body-text">
            <span className="font-semibold text-ink">{target.shown.label}</span> (<span className="mono-ref text-ink">{target.file.name}</span>) will be removed from this case{target.file.storageKey ? ", and its stored file deleted from this browser" : ""}. This cannot be undone.
          </p>
          {error && <p role="alert" className="text-sm text-[#B91C1C]">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 bg-wash border-t border-line rounded-b-xl">
          <button onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button onClick={() => void confirm()} disabled={busy} className="btn bg-[#B91C1C] border border-[#B91C1C] text-white hover:bg-[#991B1B] disabled:opacity-60">Delete file</button>
        </div>
      </div>
    </div>
  );
}

function SetBand({
  set, word, comparison, onPreview, onInsights, onEdit, onDelete,
}: {
  set: PhotoSetEvidence;
  word: string;
  /** The case documents the set can be compared with, or the reason there are none. */
  comparison: { docs: string[]; missing?: string };
  onPreview: (f: MediaFile) => void;
  onInsights: (f: MediaFile & { number: number }, groupTitle: string, study?: string) => void;
  onEdit: (t: MediaTarget) => void;
  onDelete: (t: MediaTarget) => void;
}) {
  const [open, setOpen] = useState(true);
  const status = setStatus(set.files);
  const first = set.files[0]?.number;
  const last = set.files[set.files.length - 1]?.number;
  const study = set.study;
  const things = set.kind === "scene" ? "photos" : "images";
  const unit = set.files.length === 1 ? things.slice(0, -1) : things;
  // Study type and body part in the title, the rest beneath — only what was entered.
  const titleBits = study ? [study.scanType && study.scanType !== "Not sure" ? study.scanType : null, study.bodyPart || null].filter(Boolean) : [];
  const detailBits = study ? [study.view || null, study.side && study.side !== "Not sure" ? study.side : null, study.studyDate ? `study date ${study.studyDate}` : null].filter(Boolean) : [];
  const groupTitle = `${word} ${first === last ? first : `${first}–${last}`}`;
  const studyText = titleBits.length ? titleBits.join(" · ") : undefined;
  return (
    <>
      <tr className="bg-[#F6FDFF]">
        <td colSpan={3} className="px-4 py-3 align-top">
          <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex items-start gap-2 text-left min-w-0 w-full">
            <ChevronDown className={`w-4 h-4 text-[#5B6B78] mt-0.5 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} strokeWidth={1.75} />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">
                {[groupTitle, `${set.files.length} ${unit}`, ...titleBits].join(" · ")}
              </span>
              {detailBits.length > 0 && <span className="block text-xs text-[#5B6B78]">{detailBits.join(" · ")}</span>}
              {status === "processing" && (
                <span className="block text-xs text-[#5B6B78] mt-0.5">The {things} are being checked.</span>
              )}
              {status === "stalled" && (
                <span className="block text-xs text-[#B45309] mt-0.5">The file check has made no progress for over {Math.round(STALLED_AFTER_MS / 60000)} minutes and stopped.</span>
              )}
              {comparison.missing ? (
                <span className="text-xs text-[#B45309] mt-0.5 flex items-start gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" strokeWidth={1.75} /> {comparison.missing}
                </span>
              ) : (
                <span className="block text-xs text-[#5B6B78] mt-0.5">Will be compared with: {comparison.docs.join(", ")} (found on this case)</span>
              )}
            </span>
          </button>
        </td>
        <td className="px-4 py-3 align-middle"><StatusBadge status={status} /></td>
        <td className="px-4 py-3 align-middle" />
      </tr>
      {open && set.files.map((f) => {
        const t = targetOf({ setId: set.id, number: f.number }, f, `${word} ${f.number}`, set.source, set.uploadedAt);
        return (
          <tr key={f.number} className="bg-white">
            <NameCell label={t.defaults.label} file={f} />
            <td className="px-4 py-3 align-middle text-sm text-[#5B6B78]">{t.shown.source}</td>
            <td className="px-4 py-3 align-middle text-sm text-[#5B6B78] whitespace-nowrap">{t.shown.date}</td>
            <td className="px-4 py-3 align-middle"><StatusBadge status={fileStatus(f)} /></td>
            <td className="px-4 py-3 align-middle">
              <FileActions file={f} label={t.shown.label} onPreview={() => onPreview(f)} onInsights={() => onInsights(f, groupTitle, studyText)} onEdit={() => onEdit(t)} onDelete={() => onDelete(t)} />
            </td>
          </tr>
        );
      })}
    </>
  );
}

// ── Panel ────────────────────────────────────────────────────────────────────

export function MediaEvidencePanel({
  caseId, documents = [], onUpload, statusFilter = "all",
}: { caseId: string; documents?: CaseDocument[]; onUpload?: () => void; statusFilter?: DocFilter }) {
  const { videos: allVideos, sets: allSets } = useMediaEvidence(caseId);
  // The Documents status filter, applied to each file by its check status.
  const shows = (f: MediaFile) => inFilter(mediaDocStatus(fileStatus(f)), statusFilter);
  const videos = allVideos.filter((v) => shows(v.file));
  const sets = allSets
    .map((x) => ({ ...x, files: x.files.filter(shows) }))
    .filter((x) => x.files.length > 0);
  const totalFiles = allVideos.length + allSets.reduce((t, x) => t + x.files.length, 0);
  const [preview, setPreview] = useState<{ file: MediaFile; kind: "video" | "image" } | null>(null);
  const [insights, setInsights] = useState<InsightsTarget | null>(null);
  const [editing, setEditing] = useState<MediaTarget | null>(null);
  const [deleting, setDeleting] = useState<MediaTarget | null>(null);
  // Re-read the clock so a check that stops making progress shows as stalled.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(t);
  }, []);

  // Files never checked, and files an earlier version of the check failed, are
  // checked now — once. A file that is not stored here fails the check.
  useEffect(() => {
    const unchecked = (f: MediaFile) => !f.analysisStatus || (f.analysisStatus === "failed" && (f.checkVersion ?? 1) < CHECK_VERSION);
    allVideos.filter((v) => unchecked(v.file)).forEach((v) => { void analyseVideo(v); });
    allSets.filter((x) => x.files.some(unchecked)).forEach((x) => { void analyseSet(x); });
  }, [allVideos, allSets]);

  const scene = sets.filter((s) => s.kind === "scene");
  const medical = sets.filter((s) => s.kind === "medical");

  // What each kind of set can be compared with, from the case's own documents.
  const categories = classifyDocuments(documents);
  const docsIn = (name: string) => categories.find((c) => c.name === name)?.docs.map((d) => d.name) ?? [];
  // Shown by name, without the file extension or underscores.
  const readable = (n: string) => n.replace(/\.[a-z0-9]+$/i, "").replace(/_+/g, " ").trim();
  const sceneDocs = docsIn("Police Reports").map(readable);
  const medicalDocs = [...docsIn("Medical Records"), ...documents.filter((d) => /expert|letter/i.test(d.name)).map((d) => d.name)].map(readable);
  const sceneComparison = sceneDocs.length
    ? { docs: sceneDocs }
    : { docs: [], missing: "No crash report, incident report or witness statement is on this case, so there is nothing to compare the photos with yet." };
  const medicalComparison = medicalDocs.length
    ? { docs: Array.from(new Set(medicalDocs)) }
    : { docs: [], missing: "No medical record, bill or expert letter is on this case, so there is nothing to compare the images with yet." };

  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  const imagesIn = (xs: PhotoSetEvidence[]) => xs.reduce((t, x) => t + x.files.length, 0);

  // Summary — from the records.
  const allFiles: MediaFile[] = [...videos.map((v) => v.file), ...sets.flatMap((s) => s.files)];
  const statuses = allFiles.map((f) => fileStatus(f));
  const processing = statuses.filter((s) => s === "processing").length;
  const attention = statuses.filter((s) => s === "stalled" || s === "failed").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {processing > 0 && <span className="pill bg-tint text-deep border-[#D6F2F7]"><Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} /> In Progress</span>}
          <span className="secondary-text">
            {[processing > 0 && `${processing} processing`, attention > 0 && `${attention} need attention`, `${allFiles.length} ${allFiles.length === 1 ? "file" : "files"}`].filter(Boolean).join(" · ")}
          </span>
        </div>
        {onUpload && (
          <button onClick={onUpload} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand hover:bg-deep text-white rounded-lg text-xs font-semibold transition-all">
            <Upload className="w-3.5 h-3.5" strokeWidth={1.75} /> Upload Video &amp; Photos
          </button>
        )}
      </div>

      {totalFiles > 0 && allFiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center border border-dashed border-line rounded-xl bg-white">
          <Camera className="w-8 h-8 text-[#9BDAEC] mb-3" strokeWidth={1.75} />
          <p className="text-sm text-[#5B6B78]">No media files match this filter.</p>
          <p className="text-xs text-[#5B6B78] mt-1">{totalFiles} {totalFiles === 1 ? "file is" : "files are"} on this case under other statuses.</p>
        </div>
      ) : allFiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-line rounded-xl bg-white">
          <Camera className="w-8 h-8 text-[#9BDAEC] mb-3" strokeWidth={1.75} />
          <p className="text-sm text-[#5B6B78]">No video or photos on this case yet.</p>
          <p className="text-xs text-[#5B6B78] mt-1">Media evidence is analysed on its own, not read as documents.</p>
        </div>
      ) : (
        <>
          <Category title="Video" icon={Video} count={n(videos.length, "video", "videos")}>
            {videos.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-4 text-sm text-[#8A98A3]">No videos.</td></tr>
            ) : videos.map((v: VideoEvidence) => {
              const status = fileStatus(v.file);
              const t = targetOf({ videoId: v.id }, v.file, `Video ${v.number}`, v.source, v.uploadedAt);
              return (
                <tr key={v.id} className="bg-white">
                  <NameCell label={t.defaults.label} file={v.file} />
                  <td className="px-4 py-3 align-middle text-sm text-[#5B6B78]">{t.shown.source}</td>
                  <td className="px-4 py-3 align-middle text-sm text-[#5B6B78] whitespace-nowrap">{t.shown.date}</td>
                  <td className="px-4 py-3 align-middle"><StatusBadge status={status} /></td>
                  <td className="px-4 py-3 align-middle">
                    <FileActions
                      file={v.file}
                      label={t.shown.label}
                      onPreview={() => setPreview({ file: v.file, kind: "video" })}
                      onInsights={() => setInsights({ file: v.file, kind: "video", label: t.shown.label, source: t.shown.source, uploadedAt: v.uploadedAt, date: v.file.date })}
                      onEdit={() => setEditing(t)}
                      onDelete={() => setDeleting(t)}
                    />
                  </td>
                </tr>
              );
            })}
          </Category>

          <Category title="Photos" icon={ImageIcon} count={`${n(imagesIn(scene), "photo", "photos")} · ${n(scene.length, "set", "sets")}`}>
            {scene.length === 0
              ? <tr><td colSpan={5} className="px-4 py-4 text-sm text-[#8A98A3]">No scene photo sets.</td></tr>
              : scene.map((s) => <SetBand
                  key={s.id} set={s} word="Scene Image" comparison={sceneComparison}
                  onPreview={(f) => setPreview({ file: f, kind: "image" })}
                  onInsights={(f, title, study) => setInsights({
                    file: f, kind: "image", label: f.label ?? `Scene Image ${f.number}`, source: f.source ?? s.source ?? "Attorney", uploadedAt: s.uploadedAt, date: f.date,
                    group: { title, study, compareWith: sceneComparison.docs, missing: sceneComparison.missing },
                  })}
                  onEdit={setEditing}
                  onDelete={setDeleting}
                />)}
          </Category>

          <Category title="Medical images" icon={ScanLine} count={`${n(imagesIn(medical), "image", "images")} · ${n(medical.length, "study", "studies")}`}>
            {medical.length === 0
              ? <tr><td colSpan={5} className="px-4 py-4 text-sm text-[#8A98A3]">No medical image studies.</td></tr>
              : medical.map((s) => <SetBand
                  key={s.id} set={s} word="Medical Image" comparison={medicalComparison}
                  onPreview={(f) => setPreview({ file: f, kind: "image" })}
                  onInsights={(f, title, study) => setInsights({
                    file: f, kind: "image", label: f.label ?? `Medical Image ${f.number}`, source: f.source ?? s.source ?? "Attorney", uploadedAt: s.uploadedAt, date: f.date,
                    group: { title, study, compareWith: medicalComparison.docs, missing: medicalComparison.missing },
                  })}
                  onEdit={setEditing}
                  onDelete={setDeleting}
                />)}
          </Category>

          <p className="text-xs text-[#5B6B78] leading-relaxed flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 shrink-0 mt-px" strokeWidth={1.75} />
            Each file is checked when it arrives: that it opens, and what can be measured from it (a video's resolution and length, an image's dimensions, a DICOM header). Insights show that check; comparing media with the case's documents needs the evidence-analysis service, which is not connected yet.
          </p>
        </>
      )}

      {preview && <PreviewModal file={preview.file} kind={preview.kind} onClose={() => setPreview(null)} />}
      {insights && <MediaInsights target={insights} onClose={() => setInsights(null)} />}
      {editing && <EditMediaModal target={editing} onClose={() => setEditing(null)} />}
      {deleting && <DeleteMediaModal target={deleting} onClose={() => setDeleting(null)} />}
    </div>
  );
}

export { NEW_BADGE };
