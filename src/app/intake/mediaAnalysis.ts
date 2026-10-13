import { getMediaFile } from "./mediaFileStore";
import {
  updateVideoAnalysis, updateSetFileAnalysis, type VideoEvidence, type PhotoSetEvidence, type MediaFile,
} from "./mediaEvidenceStore";

// ── Media analysis ───────────────────────────────────────────────────────────
// The file check every upload goes through: a check on the
// stored original — it is opened and decoded, and what can be measured from it
// is recorded (a video's resolution and length, an image's dimensions, a DICOM
// file's header). It does not judge the evidence or compare it with the case's
// documents: no evidence-analysis service is connected yet. Every status shown
// comes from this check actually running, finishing or failing.

const TIMEOUT_MS = 30_000;

/** The current file check. Version 2 judges a file by its format, not by
 *  whether this browser can display it: a valid HEIC photo, a valid video in a
 *  codec the browser cannot play, or a DICOM file without the optional preamble
 *  is Ready. Files that failed an earlier version are checked again, once. */
export const CHECK_VERSION = 2;

/** Bytes from the start of a file. */
async function head(blob: Blob, n: number) {
  return new Uint8Array(await blob.slice(0, n).arrayBuffer());
}
const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.slice(from, to));

/** An ISO base-media file (MP4, MOV, HEIC): a box of type "ftyp" — or, in
 *  older QuickTime files, another top-level box — at the start. Returns its brand. */
async function isoBrand(blob: Blob): Promise<string | null> {
  const b = await head(blob, 16);
  const type = ascii(b, 4, 8);
  if (type === "ftyp") return ascii(b, 8, 12).trim().toLowerCase();
  if (["moov", "mdat", "wide", "free", "skip", "pnot"].includes(type)) return "qt";
  return null;
}
const HEIF_BRANDS = ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1", "avif"];

const extOf = (name: string) => (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? "").toLowerCase();

function withTimeout<T>(p: Promise<T>, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(`${what} did not finish within 30 seconds`)), TIMEOUT_MS);
    p.then((v) => { window.clearTimeout(t); resolve(v); }, (e) => { window.clearTimeout(t); reject(e); });
  });
}

const duration = (s: number) => {
  if (!Number.isFinite(s)) return "unknown length";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, "0")}`;
};

function checkVideo(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => {
      const out = `Video opens · ${v.videoWidth}×${v.videoHeight} · ${duration(v.duration)}`;
      URL.revokeObjectURL(url);
      resolve(out);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      // Not playable here — valid if it is a real MP4 or QuickTime file.
      isoBrand(blob).then(
        (brand) => brand
          ? resolve("Valid video file · this browser cannot play its codec — download it to view")
          : reject(new Error("This is not a valid video file — it may be damaged")),
        () => reject(new Error("This video could not be read")),
      );
    };
    v.src = url;
  });
}

function checkImage(blob: Blob, name: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(`Image opens · ${img.naturalWidth}×${img.naturalHeight}`); };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      if (!["heic", "heif"].includes(extOf(name))) { reject(new Error("This image cannot be decoded — the file may be damaged")); return; }
      // Browsers cannot display HEIC; the file is valid if it is a real HEIF image.
      isoBrand(blob).then(
        (brand) => brand && HEIF_BRANDS.includes(brand)
          ? resolve("Valid HEIC image · this browser cannot display it — download it to view")
          : reject(new Error("This is not a valid HEIC image — it may be damaged")),
        () => reject(new Error("This image could not be read")),
      );
    };
    img.src = url;
  });
}

/** A DICOM file carries "DICM" after a 128-byte preamble. Older files omit the
 *  preamble and start straight with a group 0x0002 or 0x0008 data element. */
async function checkDicom(blob: Blob): Promise<string> {
  const b = await head(blob, 132);
  if (ascii(b, 128, 132) === "DICM") return "DICOM header valid";
  const group = b[0] | (b[1] << 8);
  if (b.length >= 8 && (group === 0x0002 || group === 0x0008)) return "DICOM file valid (no preamble)";
  throw new Error("This is not a valid DICOM file — its header is missing");
}

async function checkFile(f: MediaFile, kind: "video" | "image"): Promise<string> {
  const blob = await getMediaFile(f.storageKey);
  if (!blob) throw new Error("The original file is not stored on this device, so it cannot be checked");
  if (kind === "video") return withTimeout(checkVideo(blob), "The video check");
  if (["dcm", "dicom"].includes(extOf(f.name))) return withTimeout(checkDicom(blob), "The DICOM check");
  return withTimeout(checkImage(blob, f.name), "The image check");
}

const now = () => new Date().toISOString();

/** Runs the check on one video and records each step. */
export async function analyseVideo(video: VideoEvidence) {
  updateVideoAnalysis(video.id, { analysisStatus: "processing", analysisStartedAt: now(), analysisError: undefined, analysisResult: undefined, checkVersion: CHECK_VERSION });
  try {
    const result = await checkFile(video.file, "video");
    updateVideoAnalysis(video.id, { analysisStatus: "complete", analysisCompletedAt: now(), analysisResult: result });
  } catch (e) {
    updateVideoAnalysis(video.id, { analysisStatus: "failed", analysisCompletedAt: now(), analysisError: (e as Error).message });
  }
}

/** Runs the check on every image of a set — the set is analysed as a whole. */
export async function analyseSet(set: PhotoSetEvidence) {
  set.files.forEach((_, i) => updateSetFileAnalysis(set.id, i, { analysisStatus: "processing", analysisStartedAt: now(), analysisError: undefined, analysisResult: undefined, checkVersion: CHECK_VERSION }));
  for (let i = 0; i < set.files.length; i++) {
    try {
      const result = await checkFile(set.files[i], "image");
      updateSetFileAnalysis(set.id, i, { analysisStatus: "complete", analysisCompletedAt: now(), analysisResult: result });
    } catch (e) {
      updateSetFileAnalysis(set.id, i, { analysisStatus: "failed", analysisCompletedAt: now(), analysisError: (e as Error).message });
    }
  }
}
