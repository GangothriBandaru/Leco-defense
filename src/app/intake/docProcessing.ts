import type { CaseDocument, DocStatus } from "../types/case";
import type { MediaStatus } from "./mediaEvidenceStore";

// ── Document processing ──────────────────────────────────────────────────────
// What happens to a document after upload. No extraction or AI-analysis
// service is connected to this prototype, so "processing" is the check the
// browser can genuinely run on the stored original: that it is not empty and
// really is the format its name says — a PDF has a PDF header, a Word or Excel
// file is a valid Office (zip) package, an image or recording decodes. Every
// status shown is the outcome of that check actually running; nothing is
// marked done on a timer.

export const DOC_STATUSES: DocStatus[] = ["Queued", "Processing", "Processed", "Attorney Review Required", "Failed", "Reviewed"];

/** The dashboard's semantic pill for each status. */
export const DOC_STATUS_PILL: Record<DocStatus, string> = {
  Queued: "bg-[#F1F3F5] text-[#5B6B78] border-line",
  Processing: "pill-neutral",
  Processed: "pill-complete",
  "Attorney Review Required": "pill-progress",
  Failed: "pill-risk",
  Reviewed: "bg-tint text-deep border-[#9BDAEC]",
};

export type DocFilter = "all" | "processing" | "processed" | "review" | "failed" | "reviewed";

/** Which statuses each filter shows. Reviewed stays under All and its own filter. */
export const FILTER_STATUSES: Record<Exclude<DocFilter, "all">, DocStatus[]> = {
  processing: ["Queued", "Processing"],
  processed: ["Processed"],
  review: ["Attorney Review Required"],
  failed: ["Failed"],
  reviewed: ["Reviewed"],
};

export const inFilter = (status: DocStatus, filter: DocFilter) => filter === "all" || FILTER_STATUSES[filter].includes(status);

/** A media file's status in the same terms: its file check maps onto the
 *  document statuses (media has no attorney-review step). */
export function mediaDocStatus(s: MediaStatus): DocStatus {
  switch (s) {
    case "ready": return "Processed";
    case "processing": return "Processing";
    case "failed":
    case "stalled": return "Failed";
    default: return "Queued";
  }
}

/** Processing has finished for this document — successfully or not. */
export const processingFinished = (d: CaseDocument) => d.status !== "Queued" && d.status !== "Processing";

/** A change the attorney has not yet seen: an upload or status change since they
 *  last opened or acknowledged the document. Records that predate tracking
 *  (no history) are not new. */
export const isUnseen = (d: CaseDocument) => !!d.history?.length && d.seenStatus !== d.status;

export const now = () => new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

// ── The check ────────────────────────────────────────────────────────────────

const TIMEOUT_MS = 30_000;
const extOf = (name: string) => (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? "").toLowerCase();
const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

async function head(blob: Blob, n: number) {
  return new Uint8Array(await blob.slice(0, n).arrayBuffer());
}

function decodes(blob: Blob, kind: "image" | "video" | "audio"): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const done = (fn: () => void) => { URL.revokeObjectURL(url); fn(); };
    if (kind === "image") {
      const img = new Image();
      img.onload = () => done(() => resolve(`Image opens · ${img.naturalWidth}×${img.naturalHeight}`));
      img.onerror = () => done(() => reject(new Error("This image cannot be decoded — the file may be damaged")));
      img.src = url;
    } else {
      const el = document.createElement(kind);
      el.preload = "metadata";
      el.onloadedmetadata = () => done(() => resolve(`${kind === "video" ? "Video" : "Audio"} opens · ${Math.round(el.duration)} s`));
      el.onerror = () => done(() => reject(new Error(`This ${kind} cannot be played in the browser — the file may be damaged or use an unsupported codec`)));
      el.src = url;
    }
  });
}

/** Thrown when the check could not decide — the attorney has to look. */
export class NeedsAttorney extends Error {}

/** Checks one stored document. Resolves with what was found; rejects with why
 *  it failed. A file whose type it cannot check rejects with NeedsAttorney. */
export async function checkDocument(blob: Blob, name: string): Promise<string> {
  const run = async (): Promise<string> => {
    if (blob.size === 0) throw new Error("The file is empty");
    const ext = extOf(name);
    const b = await head(blob, 8);
    const sig = String.fromCharCode(...b);
    if (ext === "pdf") {
      if (!sig.startsWith("%PDF-")) throw new Error("This is not a valid PDF — its header is missing");
      return `Valid PDF · ${kb(blob.size)}`;
    }
    if (["docx", "xlsx", "pptx"].includes(ext)) {
      if (!(b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04)) throw new Error(`This is not a valid ${ext.toUpperCase()} file — it is not an Office package`);
      return `Valid ${ext.toUpperCase()} · ${kb(blob.size)}`;
    }
    if (["doc", "xls", "ppt"].includes(ext)) {
      if (!(b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0)) throw new Error(`This is not a valid ${ext.toUpperCase()} file`);
      return `Valid ${ext.toUpperCase()} · ${kb(blob.size)}`;
    }
    if (["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext)) return decodes(blob, "image");
    if (["mp4", "mov", "webm", "m4v"].includes(ext)) return decodes(blob, "video");
    if (["mp3", "wav", "m4a", "aac", "ogg"].includes(ext)) return decodes(blob, "audio");
    if (["txt", "csv", "md", "rtf"].includes(ext)) {
      const text = await blob.slice(0, 4096).text();
      if (text.includes("�")) throw new Error("This text file cannot be read — it is not valid text");
      return `Readable text · ${kb(blob.size)}`;
    }
    throw new NeedsAttorney(`The file type ${ext ? `.${ext}` : "(none)"} cannot be checked here — open it to confirm it is the right document`);
  };
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error("The check did not finish within 30 seconds")), TIMEOUT_MS);
    run().then((v) => { window.clearTimeout(t); resolve(v); }, (e) => { window.clearTimeout(t); reject(e); });
  });
}
