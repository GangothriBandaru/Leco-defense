import { getMediaFile } from "../intake/mediaFileStore";
import type { ReqFile } from "./trackerData";

// ── Files on a request ───────────────────────────────────────────────────────
// Uploads live in this browser's file store. Sample files on the demo case are
// generated on demand as a one-page PDF that says plainly it is a sample.

const ascii = (t: string) => t.replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7E]/g, "");
const esc = (t: string) => ascii(t).replace(/[\\()]/g, (m) => "\\" + m);

/** A minimal, valid one-page PDF with a title and lines of text. */
export function samplePdf(title: string, lines: string[]): Blob {
  let y = 720;
  const text = [`BT /F1 16 Tf 72 ${y} Td (${esc(title)}) Tj ET`];
  for (const l of lines) { y -= l ? 18 : 10; if (l) text.push(`BT /F1 11 Tf 72 ${y} Td (${esc(l)}) Tj ET`); }
  const stream = text.join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offs: number[] = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([out], { type: "application/pdf" });
}

/** The sample file for a demo record, named after the file itself. */
export function sampleFile(name: string, caseName: string, from: string): Blob {
  return samplePdf(name.replace(/\.pdf$/i, "").replace(/_/g, " "), [
    "SAMPLE DOCUMENT - DEMO DATA ONLY",
    "",
    `Case: ${caseName}`,
    `Produced by: ${from}`,
    `File: ${name}`,
    "",
    "This placeholder stands in for the document on the demo case.",
    "It is not a real record and contains no case information.",
  ]);
}

/** The file's contents, or undefined when this browser doesn't hold it. */
export async function fileBlob(f: ReqFile, caseName: string, from: string): Promise<Blob | undefined> {
  if (f.storageKey) return getMediaFile(f.storageKey);
  if (f.demo) return sampleFile(f.name, caseName, from);
  return undefined;
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
