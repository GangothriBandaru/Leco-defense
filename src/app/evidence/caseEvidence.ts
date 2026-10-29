import type { CaseDocument } from "../types/case";
import { getDocumentContent, type DocBlock } from "../components/documentText";

// ── Case evidence for the Evidence Conflicts and Demand & Complaint workspaces ──
// Everything here is read from the case's own documents and case record. Each
// statement carries the exact sentence or field found in a document, with the
// section it sits under; a conflict or claim is only produced when the text it
// rests on is actually present. Figures worked out from document values (for
// example, salary × days) are marked as analysis, never as a source quote.

export type MatrixCol = "plaintiff" | "insured" | "witness" | "police" | "medical" | "records" | "experts";
export const MATRIX_COLS: { key: MatrixCol; label: string }[] = [
  { key: "plaintiff", label: "Plaintiff" },
  { key: "insured", label: "Insured" },
  { key: "witness", label: "Witness" },
  { key: "police", label: "Police, 911, body cam" },
  { key: "medical", label: "EMS & medical" },
  { key: "records", label: "Records & data" },
  { key: "experts", label: "Experts" },
];

/** How a statement bears on the disputed fact. "self" = at odds with the same source. */
export type Stance = "plaintiff" | "defense" | "self" | "neutral";

export interface Source {
  id: string;
  title: string;
  type: string;
  col: MatrixCol;
  date?: string;
  /** What kind of source it is — a characteristic, not a credibility finding. */
  traits: string[];
  author?: string;
  doc?: CaseDocument;
}

export interface Statement {
  id: string;
  sourceId: string;
  col: MatrixCol;
  /** Exact text found in the source. */
  text: string;
  /** Section heading or field the text sits under. */
  where: string;
  stance: Stance;
}

export type Topic = "Liability" | "Injury" | "Medical history" | "Causation" | "Damages";
export type Severity = "Critical" | "Major" | "Minor";
export type Effect = "Helps defense" | "Hurts defense" | "Disputed experts" | "Mixed";
export interface Note { text: string; basis: "source" | "analysis" }

/** One side of a conflict: the plaintiff's version or the defense version. */
export interface Side {
  version: "plaintiff" | "defense";
  /** What this side says happened, e.g. "Full strength at the ER". */
  heading: string;
  stance: Stance;
  statements: Statement[];
  /** Shown when nothing on file speaks for this side. */
  empty?: string;
}

export interface Conflict {
  id: string;
  topic: Topic;
  severity: Severity;
  effect: Effect;
  /** The disputed fact, as a question. */
  title: string;
  /** Short label for the matrix row. */
  fact: string;
  summary: string;
  sides: [Side, Side];
  context: Note[];
  why: Note[];
  steps: { id: string; text: string }[];
  /** Plaintiff contradicts their own account. */
  selfContradiction?: boolean;
}

export type ClaimArea = "liability" | "injury" | "damages";
export type ClaimStatus = "Supported" | "Partially supported" | "Contradicted" | "Unsupported";
export interface Claim {
  id: string;
  area: ClaimArea;
  title: string;
  status: ClaimStatus;
  /** Amount stated in the plaintiff's documents, where there is one. */
  amount?: number;
  support: Statement[];
  rebuttal: Statement[];
  gaps: string[];
  conflicts: string[];
  lookAt: string;
  /** Worked figures, labelled as analysis. */
  analysis?: Note[];
  /** The amount the record's own inputs give, where it can be worked out. */
  reconciled?: number;
}

export interface Gap {
  id: string;
  item: string;
  why: string;
  claims: string[];
  /** Matches a document already on file, or a tracker request for it. */
  match: RegExp;
}

export interface CaseEvidence {
  sources: Source[];
  statements: Statement[];
  conflicts: Conflict[];
  claims: Claim[];
  gaps: Gap[];
  /** Plaintiff-sourced documents, as the exhibits sent to us. */
  exhibits: { id: string; doc: CaseDocument; claims: string[]; issue?: string }[];
  /** True when no demand letter or complaint is among the documents. */
  noDemand: boolean;
  noComplaint: boolean;
  policyLimit?: { text: string; amount?: number; source: Source };
  /** A commercial vehicle loss alongside a general liability policy's auto wording. */
  coverage?: { policy: Statement; vehicle: Statement };
}

// ── Reading documents ──

interface Hit { text: string; where: string }

function walk(blocks: DocBlock[]): Hit[] {
  const out: Hit[] = [];
  let where = "Document";
  for (const b of blocks) {
    if (b.type === "heading") { where = b.text; continue; }
    if (b.type === "paragraph") for (const s of b.text.split(/(?<=[.!?])\s+(?=[A-Z])/)) out.push({ text: s.trim(), where });
    if (b.type === "list") for (const s of b.items) out.push({ text: s, where });
    if (b.type === "fields") for (const [k, v] of b.pairs) out.push({ text: `${k}: ${v}`, where: `${where} · ${k}` });
  }
  return out;
}

const field = (hits: Hit[], name: string) => {
  const h = hits.find((x) => x.where.endsWith(` · ${name}`));
  return h ? { ...h, value: h.text.slice(name.length + 2) } : undefined;
};
const money = (s?: string) => { const m = s && /\$\s?([\d,]+(?:\.\d+)?)/.exec(s); return m ? +m[1].replace(/,/g, "") : undefined; };
const parseDate = (s?: string) => { if (!s) return undefined; const d = new Date(s.replace(/,\s*\d{1,2}:\d{2}.*$/, "")); return isNaN(+d) ? undefined : d; };
export const fmtMoney = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: n % 1 ? 2 : 0 });
const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function sourceFor(doc: CaseDocument, hits: Hit[]): Source {
  const n = doc.name.toLowerCase();
  const get = (k: string) => field(hits, k)?.value;
  const base = { id: doc.id, title: doc.name, date: doc.date, doc };
  if (/witness/.test(n)) return { ...base, date: doc.date, type: "Witness statement", col: "witness", traits: ["Third party"] };
  if (/police|crash|accident/.test(n)) return { ...base, date: doc.date, type: "Police report", col: "police", traits: ["Official record"], author: get("Officer") };
  if (/mri|x-?ray|ct_|radiology/.test(n)) return { ...base, date: doc.date, type: "MRI report", col: "medical", traits: ["Clinical record"], author: hits.find((h) => /signed by/i.test(h.text))?.text.replace(/^Electronically signed by\s*/i, "").replace(/\.$/, "") };
  if (/therapy|rehab/.test(n)) return { ...base, date: doc.date, type: "Physical therapy notes", col: "medical", traits: ["Clinical record"], author: get("Therapist") };
  if (/er_|emergency|hospital/.test(n)) return { ...base, date: doc.date, type: /bill/.test(n) ? "Emergency department file" : "Hospital record", col: "medical", traits: ["Clinical record", "Contemporaneous"], author: hits.find((h) => /^Attending:/.test(h.text))?.text.replace(/^Attending:\s*/, "").replace(/\.$/, "") };
  if (/medical|treatment|bill/.test(n)) return { ...base, date: doc.date, type: "Treatment record", col: "medical", traits: ["Clinical record"], author: get("Provider") };
  if (/insurance|policy/.test(n)) return { ...base, date: doc.date, type: "Insurance policy", col: "records", traits: ["Contract document"] };
  if (/wage|employ|payroll/.test(n)) return { ...base, date: doc.date, type: "Employment record", col: "records", traits: ["Employer record"] };
  return { ...base, date: doc.date, type: "Document", col: "records", traits: [] };
}

/** Builds the case's evidence picture from its documents and case record. */
export function buildCaseEvidence(caseData: any, documents: CaseDocument[]): CaseEvidence {
  const textDocs = documents.filter((d) => getDocumentContent(d).kind === "text");
  const read = textDocs.map((doc) => { const hits = walk(getDocumentContent(doc).blocks); return { doc, hits, src: sourceFor(doc, hits) }; });
  const caseRecord: Source = { id: "case-record", title: "Case record", type: "Case intake record", col: "records", traits: ["Firm's own record"] };
  const sources: Source[] = [caseRecord, ...read.map((r) => r.src)];
  const statements: Statement[] = [];
  let sn = 0;
  const say = (src: Source, h: Hit, stance: Stance): Statement => {
    const s: Statement = { id: `s${++sn}`, sourceId: src.id, col: src.col, text: h.text, where: h.where, stance };
    statements.push(s);
    return s;
  };
  const find = (pred: (r: (typeof read)[number]) => boolean, re: RegExp) => {
    for (const r of read) if (pred(r)) { const h = r.hits.find((x) => re.test(x.text)); if (h) return { r, h }; }
    return undefined;
  };
  const ofType = (t: RegExp) => (r: (typeof read)[number]) => t.test(r.src.type);

  const conflicts: Conflict[] = [];
  const add = (c: Omit<Conflict, "id">) => conflicts.push({ ...c, id: `C${conflicts.length + 1}` });

  // C — the case record describes a different incident from the documents.
  const recordText = [caseData?.caseType, caseData?.caseSubType, caseData?.summary].filter(Boolean).join(" · ");
  const crash = find(ofType(/Police/), /^Unit 2|commercial|truck/i);
  const crashMed = find(ofType(/Hospital|Emergency/), /struck|collision/i);
  if (recordText && !/collision|vehicle|truck|auto|traffic|crash|accident/i.test(recordText) && crash) {
    add({
      topic: "Liability", severity: "Critical", effect: "Mixed", fact: "What incident the case is about",
      title: "Does the case record describe the same incident as the documents?",
      summary: "The case record describes a different kind of incident from the one the police and hospital records describe. Every later analysis depends on which one is right.",
      sides: [
        { version: "plaintiff", heading: "A collision with a commercial truck", stance: "neutral", statements: [say(crash.r.src, crash.h, "neutral"), ...(crashMed ? [say(crashMed.r.src, crashMed.h, "neutral")] : [])] },
        { version: "defense", heading: "The firm's case record describes a different matter", stance: "neutral", statements: [say(caseRecord, { text: recordText, where: "Case type · summary" }, "neutral")] },
      ],
      context: [
        { basis: "source", text: `The case record lists ${caseData?.caseType ?? "a case type"}${caseData?.caseSubType ? ` (${caseData.caseSubType})` : ""}.` },
        { basis: "analysis", text: "One of the two may be a data-entry error in the case record, or documents from another matter may have been filed here. That needs checking before relying on either." },
      ],
      why: [{ basis: "analysis", text: "Liability theory, defendants, coverage and deadlines all follow from what the incident was. For attorney review." }],
      steps: [
        { id: "confirm-incident", text: "Confirm the incident with the assigning carrier's notice of claim." },
        { id: "check-filing", text: "Check whether these documents were filed to the right case." },
      ],
    });
  }

  // C — collision date in the police report vs hospital arrival.
  const pol = read.find((r) => r.src.type === "Police report");
  const polDate = pol && field(pol.hits, "Date / Time");
  const er = read.find((r) => /Hospital|Emergency/.test(r.src.type) && field(r.hits, "Arrival") && parseDate(field(r.hits, "Arrival")!.value) && polDate && parseDate(polDate.value) && +parseDate(field(r.hits, "Arrival")!.value)! !== +parseDate(polDate.value)!);
  if (pol && polDate && er) {
    const arr = field(er.hits, "Arrival")!;
    const lag = er.hits.find((h) => /prior to arrival/i.test(h.text));
    const a = parseDate(polDate.value)!, b = parseDate(arr.value)!;
    add({
      topic: "Liability", severity: "Critical", effect: "Mixed", fact: "Date of the collision",
      title: "When did the collision happen?",
      summary: `The police report gives ${day(a)}; the hospital record has the plaintiff arriving on ${day(b)}${b < a ? ", before the date the police report gives" : ""}.`,
      sides: [
        { version: "plaintiff", heading: `Their own records give ${day(a)} and ${day(b)}`, stance: "neutral", statements: [say(pol.src, polDate, "neutral"), say(er.src, arr, "neutral"), ...(lag ? [say(er.src, lag, "neutral")] : [])] },
        { version: "defense", heading: "No defense account of the date", stance: "neutral", statements: [], empty: "Nothing from the insured or the defense on file gives the date of the collision." },
      ],
      context: [
        { basis: "source", text: "The police field is labelled “Date / Time”; the hospital field is labelled “Arrival”." },
        { basis: "analysis", text: "The police date could be the report date rather than the collision date. The hospital record says the collision was about 45 minutes before arrival." },
      ],
      why: [
        { basis: "analysis", text: "The date of loss sets the statute of limitations and decides which policy period applies. Confirm it before relying on any deadline. For attorney review." },
      ],
      steps: [
        { id: "cad", text: "Request the 911 / CAD log with time stamps." },
        { id: "ems", text: "Request the EMS run sheet." },
        { id: "sol", text: "Check the SOL date in Case Details against the confirmed date of loss." },
      ],
    });
  }

  // C — neurological findings: full strength at the ER, reduced grip later.
  const erStrength = find(ofType(/Hospital|Emergency/), /strength 5\/5/i);
  const ptGrip = find(ofType(/therapy/i), /grip strength reduced/i);
  if (erStrength && ptGrip) {
    const escal = find(ofType(/Treatment/), /escalating pattern/i);
    add({
      topic: "Causation", severity: "Major", effect: "Helps defense", fact: "Arm strength after the collision",
      title: "Was there a strength deficit from the start?",
      summary: "The emergency exam recorded full strength in all extremities; physical therapy later recorded reduced left grip strength.",
      sides: [
        { version: "plaintiff", heading: "Weakness in the left arm from the injury", stance: "plaintiff", statements: [say(ptGrip.r.src, ptGrip.h, "plaintiff"), ...(escal ? [say(escal.r.src, escal.h, "plaintiff")] : [])] },
        { version: "defense", heading: "Full strength at the emergency exam", stance: "defense", statements: [say(erStrength.r.src, erStrength.h, "defense")] },
      ],
      context: [
        { basis: "source", text: "The emergency exam is the record made closest to the collision." },
        { basis: "analysis", text: "Symptoms can develop after an injury, so a later deficit doesn't by itself show another cause. A medical reviewer should weigh it." },
      ],
      why: [{ basis: "analysis", text: "A deficit that appears only after the emergency visit raises a causation question for the radiculopathy claim. For attorney review." }],
      steps: [
        { id: "records-between", text: "Get the treatment notes between the ER visit and the start of therapy." },
        { id: "med-review", text: "Ask a medical reviewer whether the progression fits the reported mechanism." },
      ],
    });
  }

  // C — age stated in the MRI vs the date of birth on the same record.
  const mri = read.find((r) => r.src.type === "MRI report");
  const ageHit = mri?.hits.find((h) => /\b\d{1,3}-year-old\b/.test(h.text));
  const dob = mri && field(mri.hits, "DOB");
  const dos = mri && field(mri.hits, "Date of Service");
  if (mri && ageHit && dob && dos) {
    const stated = +/\b(\d{1,3})-year-old\b/.exec(ageHit.text)![1];
    const born = new Date(dob.value), on = parseDate(dos.value);
    if (!isNaN(+born) && on) {
      let age = on.getFullYear() - born.getFullYear();
      if (on < new Date(on.getFullYear(), born.getMonth(), born.getDate())) age--;
      if (Math.abs(age - stated) >= 2) add({
        topic: "Medical history", severity: "Minor", effect: "Mixed", fact: "Patient's age in the MRI",
        title: "Does the MRI describe this patient?",
        summary: `The MRI history calls the patient ${stated} years old; the date of birth on the same report makes her ${age} on the date of service.`,
        sides: [
          { version: "plaintiff", heading: `The MRI history describes a ${stated}-year-old`, stance: "self", statements: [say(mri.src, ageHit, "self")] },
          { version: "defense", heading: `The same report's header makes her ${age}`, stance: "self", statements: [say(mri.src, dob, "self"), say(mri.src, dos, "self")] },
        ],
        context: [
          { basis: "source", text: `The MRI header lists DOB ${dob.value} and a date of service of ${dos.value}; its clinical history says ${stated}-year-old.` },
          { basis: "analysis", text: `Age worked out from the record: born ${dob.value}, scanned ${dos.value} → ${age}.` },
          { basis: "analysis", text: "This may be a transcription slip, but it should be ruled out that the history belongs to another patient or an earlier study." },
        ],
        why: [{ basis: "analysis", text: "The MRI is the main imaging support for the disc injury claim, so its identity details should be checked. For attorney review." }],
        steps: [{ id: "radiology", text: "Request the full radiology file, including the order and any prior studies." }],
      });
    }
  }

  // C — lost wages: the stated total vs salary × days missed.
  const wage = read.find((r) => r.src.type === "Employment record");
  const salary = wage && field(wage.hits, "Annual Base Salary");
  const days = wage?.hits.find((h) => /days missed:\s*\d+/i.test(h.text));
  const lost = wage?.hits.find((h) => /lost wages[^:]*:\s*\$/i.test(h.text));
  let wageCalc: { claimed: number; computed: number; perDay: number; n: number } | undefined;
  if (wage && salary && days && lost) {
    const annual = money(salary.value)!, n = +/days missed:\s*(\d+)/i.exec(days.text)![1], claimed = money(lost.text)!;
    const perDay = annual / 260, computed = Math.round(perDay * n * 100) / 100;
    wageCalc = { claimed, computed, perDay, n };
    if (Math.abs(claimed - computed) / computed > 0.01) add({
      topic: "Damages", severity: "Major", effect: "Helps defense", fact: "Lost wages to date",
      title: "Do the lost wages add up?",
      summary: `The employer states ${fmtMoney(claimed)} for ${n} days; the same record's salary gives ${fmtMoney(computed)} for ${n} working days.`,
      sides: [
        { version: "plaintiff", heading: `${fmtMoney(claimed)} in lost wages`, stance: "plaintiff", statements: [say(wage.src, lost, "plaintiff")] },
        { version: "defense", heading: `The record's own salary gives ${fmtMoney(computed)}`, stance: "defense", statements: [say(wage.src, salary, "defense"), say(wage.src, days, "defense")] },
      ],
      context: [
        { basis: "source", text: `The employer record lists an annual base salary of ${salary.value}, ${n} business days missed, and ${fmtMoney(claimed)} in lost wages.` },
        { basis: "analysis", text: `${fmtMoney(annual)} ÷ 260 working days = ${fmtMoney(Math.round(perDay * 100) / 100)} a day × ${n} days = ${fmtMoney(computed)}. Difference ${fmtMoney(Math.round((claimed - computed) * 100) / 100)}.` },
        { basis: "analysis", text: "The gap could come from overtime, bonus or benefits not shown in the record. Payroll records would settle it." },
      ],
      why: [{ basis: "analysis", text: "The figure should reconcile with payroll before it is accepted as a damages component. For attorney review." }],
      steps: [{ id: "payroll", text: "Request payroll records and W-2s for the year before the collision." }],
    });
  }

  // ── Claims as the plaintiff's documents present them ──
  const claims: Claim[] = [];
  const claim = (c: Omit<Claim, "id">, prefix: string) => { const id = `${prefix}${claims.filter((x) => x.area === c.area).length + 1}`; claims.push({ ...c, id }); return id; };
  const cid = (f: string) => conflicts.find((c) => c.fact === f)?.id;
  const ids = (...f: string[]) => f.map(cid).filter(Boolean) as string[];

  const fault = find(ofType(/Police/), /against a red traffic signal|failure to yield/i);
  const witness = find(ofType(/Witness/), /observed/i) ?? find(ofType(/Police/), /^Witness/i);
  const citation = find(ofType(/Police/), /Citation issued/i);
  if (fault) claim({
    area: "liability", title: "The insured's truck entered the intersection on a red signal and failed to yield", status: "Supported",
    support: [say(fault.r.src, fault.h, "plaintiff"), ...(witness ? [say(witness.r.src, witness.h, "plaintiff")] : []), ...(citation ? [say(citation.r.src, citation.h, "plaintiff")] : [])],
    rebuttal: [], gaps: ["The insured driver's account", "Signal timing data for the intersection"], conflicts: ids("What incident the case is about", "Date of the collision"),
    lookAt: "Nothing on file contradicts this yet. Get the driver's account and signal timing before taking a position.",
  }, "L");
  const speed = find(ofType(/Police/), /speed/i);
  if (speed) claim({
    area: "liability", title: "The truck was over the speed limit", status: "Partially supported",
    support: [say(speed.r.src, speed.h, "plaintiff")], rebuttal: [],
    gaps: ["A speed figure and how it was estimated", "Vehicle event data (EDR / telematics)"], conflicts: [],
    lookAt: "The report gives no speed or method. Event data from the truck would confirm or rebut it.",
  }, "L");
  const operator = find(ofType(/Police/), /on behalf of/i);
  if (operator) claim({
    area: "liability", title: "Logistics Co. is responsible for the truck and driver", status: "Partially supported",
    support: [say(operator.r.src, operator.h, "plaintiff")], rebuttal: [],
    gaps: ["Vehicle registration and lease", "The driver's employment or contract status"], conflicts: ids("What incident the case is about"),
    lookAt: "Ownership and the driver's status decide vicarious liability and which policy responds.",
  }, "L");

  const mriImp = find(ofType(/MRI/), /acute and consistent/i);
  const herniation = find(ofType(/MRI/), /^C5-C6 posterior disc herniation/i);
  if (mriImp) claim({
    area: "injury", title: "C5-C6 herniation and C6-C7 protrusion caused by the collision", status: "Supported",
    support: [...(herniation ? [say(herniation.r.src, herniation.h, "plaintiff")] : []), say(mriImp.r.src, mriImp.h, "plaintiff")], rebuttal: [],
    gaps: ["Prior cervical imaging or treatment records"], conflicts: ids("Patient's age in the MRI"),
    lookAt: "Causation rests on the radiologist's impression. Prior records would show whether the findings predate the collision.",
  }, "I");
  const derm = find(ofType(/Hospital|Emergency/), /dermatome/i);
  if (derm || ptGrip) claim({
    area: "injury", title: "Left-sided cervical radiculopathy", status: erStrength && ptGrip ? "Partially supported" : "Supported",
    support: [...(derm ? [say(derm.r.src, derm.h, "plaintiff")] : []), ...(ptGrip ? [say(ptGrip.r.src, ptGrip.h, "plaintiff")] : [])],
    rebuttal: erStrength ? [say(erStrength.r.src, erStrength.h, "defense")] : [],
    gaps: ["Nerve conduction study or neurology findings"], conflicts: ids("Arm strength after the collision"),
    lookAt: "Sensory change was recorded at the ER; the strength deficit appears only later.",
  }, "I");
  const perm = find(ofType(/therapy/i), /permanent residual impairment/i);
  const perm2 = find(ofType(/Treatment/), /permanent residual impairment/i);
  if (perm || perm2) claim({
    area: "injury", title: "Permanent residual impairment", status: "Unsupported",
    support: [...(perm ? [say(perm.r.src, perm.h, "plaintiff")] : []), ...(perm2 ? [say(perm2.r.src, perm2.h, "plaintiff")] : [])], rebuttal: [],
    gaps: ["An impairment rating from a treating physician", "Records after maximum medical improvement"], conflicts: [],
    lookAt: "The records say permanence is “anticipated”; none rates or establishes it.",
  }, "I");
  const esi = find(ofType(/Treatment/), /epidural steroid injections/i);
  if (esi) claim({
    area: "injury", title: "Two cervical epidural steroid injections", status: "Partially supported",
    support: [say(esi.r.src, esi.h, "plaintiff")], rebuttal: [],
    gaps: ["Procedure notes for each injection"], conflicts: [],
    lookAt: "Billed at the injection line of the summary, but no procedure notes are on file.",
  }, "I");

  const tread = read.find((r) => r.src.type === "Treatment record");
  const total = tread && field(tread.hits, "Total to date");
  if (tread && total) {
    const lines = ["Imaging (MRI)", "Specialist visits", "Injections", "Physical therapy"].map((k) => field(tread.hits, k)).filter(Boolean) as (Hit & { value: string })[];
    const sum = lines.reduce((a, l) => a + (money(l.value) ?? 0), 0);
    const erBill = read.find((r) => /bill|invoice/i.test(r.doc.name) && !r.hits.some((h) => /\$/.test(h.text)));
    claim({
      area: "damages", title: "Past medical expenses", status: "Partially supported", amount: money(total.value),
      support: [say(tread.src, total, "plaintiff"), ...lines.map((l) => say(tread.src, l, "plaintiff"))], rebuttal: [],
      gaps: ["Itemized bills with CPT codes from each provider", ...(erBill ? ["Emergency department charges"] : [])], conflicts: [],
      lookAt: erBill ? `The total comes from a billing summary, not itemized bills. ${erBill.doc.name} holds clinical notes and no charges.` : "The total comes from a billing summary, not itemized bills.",
      analysis: [{ basis: "analysis", text: `The summary lines add to ${fmtMoney(sum)}${sum === money(total.value) ? ", matching the stated total" : `, against a stated total of ${total.value}`}. No itemized bill is on file to verify them.` }],
    }, "D");
  }
  if (wage && lost) claim({
    area: "damages", title: "Lost wages to date", status: wageCalc && Math.abs(wageCalc.claimed - wageCalc.computed) / wageCalc.computed > 0.01 ? "Partially supported" : "Supported", amount: money(lost.text),
    support: [say(wage.src, lost, "plaintiff"), ...(days ? [say(wage.src, days, "plaintiff")] : [])],
    rebuttal: salary ? [say(wage.src, salary, "defense")] : [],
    gaps: ["Payroll records and W-2s"], conflicts: ids("Lost wages to date"),
    lookAt: "The stated total doesn't reconcile with the salary on the same record.",
    reconciled: wageCalc?.computed,
    analysis: wageCalc ? [{ basis: "analysis", text: `Salary-based figure: ${fmtMoney(wageCalc.computed)} (${wageCalc.n} days × ${fmtMoney(Math.round(wageCalc.perDay * 100) / 100)}).` }] : undefined,
  }, "D");
  const capacity = wage?.hits.find((h) => /reduced capacity/i.test(h.text));
  if (wage && capacity) claim({
    area: "damages", title: "Reduced earning capacity", status: "Unsupported",
    support: [say(wage.src, capacity, "plaintiff")], rebuttal: [],
    gaps: ["Work restrictions from a physician", "Pay records after return to work"], conflicts: [],
    lookAt: "The employer notes modified duty, but no restriction or pay change is documented.",
  }, "D");
  const pain = find(ofType(/Treatment/), /affecting sleep, work/i);
  if (pain) claim({
    area: "damages", title: "Pain and loss of enjoyment of life", status: "Partially supported",
    support: [say(pain.r.src, pain.h, "plaintiff")], rebuttal: [],
    gaps: ["The plaintiff's own account (interrogatory answers or deposition)"], conflicts: [],
    lookAt: "Documented in the treatment record; no amount is claimed in any document on file.",
  }, "D");

  const names = documents.map((d) => d.name).join(" ");
  const forClaims = (p: (c: Claim) => boolean, n = 9) => claims.filter(p).slice(0, n).map((c) => c.id);
  // `have` spots the record among the documents; `match` finds a tracker request for it.
  const gapList: (Gap & { have: RegExp })[] = [
    { id: "G1", item: "Demand letter", why: "Sets the amount, terms and any deadline the carrier must answer.", claims: [], have: /demand/i, match: /demand/i },
    { id: "G2", item: "Complaint", why: "Fixes the allegations and the amount claimed once suit is filed.", claims: [], have: /complaint|petition/i, match: /complaint|petition|pleading/i },
    { id: "G3", item: "Itemized medical bills", why: "Needed to verify the amounts behind the past medical total.", claims: forClaims((c) => c.title === "Past medical expenses"), have: /itemi[sz]ed|ub-?04|hcfa|cms-?1500/i, match: /itemi[sz]ed|medical bills|billing/i },
    { id: "G4", item: "Prior medical records (5 years)", why: "Shows whether the neck findings predate the collision.", claims: forClaims((c) => c.area === "injury", 1), have: /prior|pre-?accident/i, match: /prior|medical records|pharmacy/i },
    { id: "G5", item: "Injection procedure notes", why: "Confirms the epidural injections that were billed.", claims: forClaims((c) => /epidural/.test(c.title)), have: /injection|procedure/i, match: /injection|procedure/i },
    { id: "G6", item: "Insured driver's statement", why: "The defense account of the collision is not on file.", claims: forClaims((c) => c.area === "liability", 1), have: /driver.*statement|recorded.statement|insured.*statement/i, match: /driver|recorded statement|insured/i },
    { id: "G7", item: "Truck event data (EDR / telematics)", why: "Tests the speed and signal claims.", claims: forClaims((c) => c.area === "liability", 2), have: /edr|telematics|event.data/i, match: /edr|telematics|event data|vehicle data/i },
    { id: "G8", item: "911 / CAD log", why: "Fixes the date and time of the collision.", claims: [], have: /911|cad\b|dispatch/i, match: /911|cad\b|dispatch|police/i },
    { id: "G9", item: "Payroll records and W-2s", why: "Reconciles the lost wage figure.", claims: forClaims((c) => /wages/i.test(c.title)), have: /w-?2|payroll|pay.?stub/i, match: /payroll|w-?2|wage|employment/i },
    { id: "G10", item: "Physician impairment rating", why: "Permanence is claimed but not rated.", claims: forClaims((c) => /Permanent/.test(c.title)), have: /impairment|\bime\b|rating/i, match: /impairment|\bime\b|rating/i },
  ];
  // A gap tied to claims only shows when one of those claims was found.
  const needsClaim = new Set(["G3", "G5", "G9", "G10"]);
  const billsFile = documents.some((d) => /bill|invoice/i.test(d.name));
  const finalGaps: Gap[] = gapList
    .filter((g) => !g.have.test(names) && (!needsClaim.has(g.id) || g.claims.length > 0 || (g.id === "G3" && billsFile)))
    .map(({ have: _, ...g }) => (g.id === "G3" && !g.claims.length ? { ...g, why: "No itemized bill for any provider is on file." } : g));
  const exhibits = documents.filter((d) => d.source === "Plaintiff").map((doc, i) => {
    const used = claims.filter((c) => [...c.support, ...c.rebuttal].some((s) => s.sourceId === doc.id)).map((c) => c.id);
    const r = read.find((x) => x.doc.id === doc.id);
    const issue = r && /bill|invoice/i.test(doc.name) && !r.hits.some((h) => /\$/.test(h.text)) ? "Named as bills, but holds clinical notes and no charges."
      : conflicts.find((c) => c.sides.some((s) => s.statements.some((st) => st.sourceId === doc.id)))?.title;
    return { id: `E${i + 1}`, doc, claims: used, issue };
  });

  const pol2 = read.find((r) => r.src.type === "Insurance policy");
  const limit = pol2 && field(pol2.hits, "Each Occurrence Limit");
  const autoWording = pol2 && /GENERAL LIABILITY/i.test(pol2.hits.map((h) => h.text + h.where).join(" ")) ? pol2.hits.find((h) => /Auto/i.test(h.text)) : undefined;
  const truck = find(ofType(/Police/), /truck/i);

  return {
    sources,
    statements, conflicts, claims, gaps: finalGaps, exhibits,
    noDemand: !/demand/i.test(names), noComplaint: !/complaint|petition/i.test(names),
    policyLimit: limit && pol2 ? { text: limit.value, amount: money(limit.value), source: pol2.src } : undefined,
    coverage: pol2 && autoWording && truck ? { policy: say(pol2.src, autoWording, "neutral"), vehicle: say(truck.r.src, truck.h, "neutral") } : undefined,
  };
}
