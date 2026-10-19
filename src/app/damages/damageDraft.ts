import { ECONOMIC_CATEGORIES, ECONOMIC_SUBCATEGORIES, type EconomicCategory } from "./DamagesContext";
import { SEVERITY_RANGE, type Severity } from "./FactorsContext";

// ── Damages and damage factors drafted from the attorney's own words ─────────
// The same approach as the timeline's Create with AI: read in the browser, no
// model service. Only what the description states is taken — an amount written
// with a $ or "dollars", a category its words name, case documents it names.
// Everything else is left for the attorney, and nothing is saved from here.

const GENERIC = new Set(["report", "reports", "record", "records", "document", "documents", "file", "files", "final", "notes", "copy", "signed", "scan", "case", "invoice", "invoices", "bill", "bills"]);

/** Case documents the text names: the distinctive words of the file name
 *  appear together, in order (one shared word, like "hospital", is not enough). */
export function documentsNamedIn(text: string, documents: string[]): string[] {
  const lower = text.toLowerCase();
  return documents.filter((name) => {
    const words = name.replace(/\.[a-z0-9]+$/i, "").split(/[_\-.\s]+/).map((w) => w.toLowerCase())
      .filter((w) => w.length >= 4 && !GENERIC.has(w) && !/^\d+$/.test(w));
    // The words together and in order (a word or two between is allowed), as
    // a mention of that file — not words scattered through the sentence.
    return words.length > 0 && new RegExp(`\\b${words.join("\\W+(?:\\w+\\W+){0,2}?")}`, "i").test(lower);
  });
}

const GROUP_WORDS: Record<EconomicCategory, RegExp> = {
  "Medical & Care Expenses": /\b(medical|hospital|emergency|ambulance|surgery|physician|doctor|treatment|therapy|rehab\w*|medication|prescription|pharmacy|mri|x-?ray|diagnostic|imaging|chiropract\w*|counsel\w*|home health)\b/i,
  "Lost Earnings": /\b(wages?|salary|income|earnings|pto|sick leave|bonus\w*|overtime|commission\w*|employment benefits)\b/i,
  "Household Services": /\b(household|cleaning|laundry|cooking|groceries|yard work|home maintenance)\b/i,
  "Out-of-Pocket Expenses": /\b(mileage|transport\w*|parking|lodging|travel)\b/i,
  "Property Damage": /\b(vehicle|car repair|property damage|rental car|loss of use|total loss|diminished value|belongings)\b/i,
  "Other Damages": /\b(funeral|burial|vocational|special education|guardianship|medical monitoring)\b/i,
};
const SUB_WORDS: [RegExp, string][] = [
  [/\b(emergency|ambulance)\b/i, "Emergency & Ambulance"],
  [/\b(hospital|surgery|surgical)\b/i, "Hospital & Surgery"],
  [/\b(physician|specialist|doctor)\b/i, "Physician & Specialist Visits"],
  [/\b(mri|x-?ray|diagnostic|imaging|ct scan)\b/i, "Diagnostic Testing"],
  [/\b(medication|prescription|pharmacy)\b/i, "Medications"],
  [/\b(physical therapy|rehab\w*)\b/i, "Physical Therapy & Rehabilitation"],
  [/\b(chiropract\w*|pain management)\b/i, "Chiropractic & Pain Management"],
  [/\b(mental health|counsel\w*|psycholog\w*)\b/i, "Mental Health Treatment"],
  [/\b(home health|attendant)\b/i, "Attendant & Home Health Care"],
  [/\b(wheelchair|brace|equipment|device)\b/i, "Medical Equipment & Devices"],
  [/\b(wages?|salary)\b/i, "Wages & Salary"],
  [/\b(mileage|transport\w*)\b/i, "Transportation & Mileage"],
  [/\bparking\b/i, "Parking"],
  [/\b(vehicle|car) repair\b|\btotal loss\b/i, "Vehicle Repair / Total Loss"],
  [/\brental car\b|\bloss of use\b/i, "Rental Car / Loss of Use"],
];
const TYPE_FOR_GROUP: Partial<Record<EconomicCategory, string>> = {
  "Medical & Care Expenses": "Medical Bills",
  "Lost Earnings": "Lost Wages",
  "Household Services": "Household Services",
  "Out-of-Pocket Expenses": "Out-of-Pocket Expenses",
  "Property Damage": "Property Damage",
};

export interface DamageDraftFields {
  label?: string; amount?: string; group?: EconomicCategory; subcategory?: string; category?: string;
  description?: string; notes?: string; docs?: string;
}

export function draftDamageFromText(text: string, documents: string[], bucket: "economic" | "noneconomic") {
  const t = text.trim();
  const fields: DamageDraftFields = {};
  const filled: string[] = [];
  const needed: string[] = [];

  const money = t.match(/\$\s?(\d[\d,]*(?:\.\d{1,2})?)/) ?? t.match(/\b(\d[\d,]*(?:\.\d{1,2})?)\s*(?:dollars|usd)\b/i);
  if (money) { fields.amount = money[1]; filled.push("amount"); } else needed.push("amount — none was stated");

  const name = t.match(/["“]([^"”]{3,60})["”]/)
    ?? t.match(/\b(?:add|record|include|log|claim)\s+(?:an?\s+|the\s+)?(?:(?:economic|non-economic)\s+damages?\s+(?:for|of)\s+)?([a-z][a-z &'/-]{2,50}?)\s+(?:of|for|totall?ing|amounting|worth|at|in the amount)\b/i);
  if (name) { fields.label = name[1].trim().replace(/^./, (c) => c.toUpperCase()); filled.push("damage name"); } else needed.push("damage name");

  if (bucket === "economic") {
    const groups = ECONOMIC_CATEGORIES.filter((g) => GROUP_WORDS[g].test(t));
    if (groups.length === 1) {
      fields.group = groups[0];
      filled.push("category");
      const subs = SUB_WORDS.filter(([re, sub]) => re.test(t) && ECONOMIC_SUBCATEGORIES[groups[0]].includes(sub)).map(([, s]) => s);
      if (subs.length === 1) { fields.subcategory = subs[0]; filled.push("subcategory"); }
      const ty = TYPE_FOR_GROUP[groups[0]];
      if (ty) { fields.category = ty; filled.push("damage type"); }
    } else needed.push("category — choose where it is filed");
  }

  const forWhat = t.match(/\bfor\s+([^,.;]{4,120}?)(?=,|\.|;|\s+supported|\s+backed|\s+per\b|\s+according|$)/i);
  if (forWhat) { fields.description = forWhat[1].trim().replace(/^./, (c) => c.toUpperCase()); filled.push("description"); }

  // What the attorney says supports it: matched case documents become the
  // supporting documents; anything else is kept as their note, not as fact.
  const support = t.match(/\b(?:supported by|backed by|per|according to|evidenced by)\s+([^.;]{3,120})/i);
  const docs = documentsNamedIn(t, documents);
  if (docs.length) { fields.docs = docs.join(", "); filled.push(`${docs.length} supporting ${docs.length === 1 ? "document" : "documents"}`); }
  if (support) {
    fields.notes = `Attorney noted: supported by ${support[1].trim()}.`;
    filled.push("notes");
    if (!docs.length) needed.push(`supporting document — “${support[1].trim()}” is not a file on this case; name the file or attach it`);
  }
  return { fields, filled, needed };
}

const KNOWN_FACTORS = [
  "Pain & Suffering", "Emotional Distress", "Quality of Life", "Loss of Enjoyment of Life", "Loss of Consortium",
  "Disfigurement", "Scarring", "Mental Anguish", "Inconvenience", "Cognitive Impairment", "Physical Impairment",
  "Dignity & Independence", "Family Relationship Impact", "Humiliation", "Fear and Anxiety", "Sleep Disturbance",
];

export interface FactorDraftFields {
  name?: string; description?: string; severity?: Severity; rangeLow?: string; rangeHigh?: string; multiplier?: string; note?: string;
}

export function draftFactorFromText(text: string) {
  const t = text.trim();
  const fields: FactorDraftFields = {};
  const filled: string[] = [];
  const needed: string[] = [];

  const quoted = t.match(/["“]([^"”]{3,60})["”]/);
  const known = KNOWN_FACTORS.find((k) => new RegExp(`\\b${k.replace(/&/g, "(?:&|and)").replace(/\s+/g, "\\s+")}\\b`, "i").test(t));
  const called = t.match(/\bfactor\s+(?:for|called|named|titled)\s+([^,.;]{3,50})/i);
  const name = quoted?.[1] ?? known ?? called?.[1];
  if (name) { fields.name = name.trim().replace(/^./, (c) => c.toUpperCase()); filled.push("factor name"); } else needed.push("factor name");

  const sev: Severity | undefined =
    /\b(critical|severe|catastrophic)\b/i.test(t) ? "Critical"
    : /\b(high|significant|serious|substantial)\b/i.test(t) ? "High"
    : /\b(moderate|medium)\b/i.test(t) ? "Moderate"
    : /\b(low|mild|minor)\b/i.test(t) ? "Low" : undefined;
  if (sev) {
    fields.severity = sev;
    fields.rangeLow = String(SEVERITY_RANGE[sev][0]);
    fields.rangeHigh = String(SEVERITY_RANGE[sev][1]);
    filled.push("severity and its multiplier band");
  } else needed.push("severity — not stated");

  const mult = t.match(/\bmultiplier\s+(?:of\s+|at\s+)?(\d+(?:\.\d+)?)/i) ?? t.match(/\b(\d+(?:\.\d+)?)\s*(?:x|×)(?![a-z])/i);
  if (mult) { fields.multiplier = mult[1]; filled.push("multiplier contribution"); } else needed.push("multiplier contribution — not stated");

  const why = t.match(/\b(?:because(?:\s+of)?|due to|given that|rationale[:\s]|describe that|noting that)\s*([^.]{8,400}?)(?=,?\s+(?:supported|evidenced|based on)\b|\.|$)/i);
  if (why) { const d = why[1].trim().replace(/^./, (c) => c.toUpperCase()); fields.description = /[.!?]$/.test(d) ? d : `${d}.`; filled.push("rationale"); }

  const evidence = t.match(/\b(?:supported by|evidenced by|based on|see)\s+([^.;]{3,120})/i);
  if (evidence) { fields.note = `Evidence the attorney cited: ${evidence[1].trim()}.`; filled.push("note"); }
  return { fields, filled, needed };
}
