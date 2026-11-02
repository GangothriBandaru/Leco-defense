import { Search, X } from "lucide-react";

// ── Filters for the Case Timeline Overview ───────────────────────────────────
// Every value is read off the event itself: an attorney-set type, or its title
// and text; its supporting document names; and where it came from. Nothing is
// stored, and no event is marked verified without a verification record.

export interface FilterableEvent {
  id: string;
  origin: "extracted" | "manual";
  iso: string;
  title: string;
  summary?: string;
  description?: string;
  type?: string;
  evidence: string[];
  sourceRef?: string;
}

export const CATEGORIES = [
  "Medical Events", "Treatment & Procedures", "Emergency Events", "Diagnosis & Findings", "Medication",
  "Rehabilitation", "Legal & Case Events", "Insurance Events", "Other",
] as const;
export type Category = (typeof CATEGORIES)[number];
export const SOURCES = [
  "Medical Records", "Hospital Records", "EMS Records", "Police Reports", "Expert Reports",
  "Witness Statements", "Court Documents", "Other Sources",
] as const;
export const STATUSES = ["Verified", "Pending Verification", "System Generated", "Manually Added"] as const;
export const DATE_RANGES = ["All Dates", "Today", "Last 7 Days", "Last 30 Days", "Custom Range"] as const;

// First match wins, so the more specific kinds come first.
const CATEGORY_RULES: [RegExp, Category][] = [
  [/\b(911|emergency|ambulance|ems|dispatch|admission|intake|triage)\b/i, "Emergency Events"],
  [/\b(mri|ct scan|x-?ray|radiolog|diagnos|confirm|finding|assess|imaging)/i, "Diagnosis & Findings"],
  [/\b(rehab|rehabilitation|physical therapy|therapy)\b/i, "Rehabilitation"],
  [/\b(medication|prescri|pharmacy|rx|drug)/i, "Medication"],
  [/\b(surgery|procedure|injection|treatment|operation)/i, "Treatment & Procedures"],
  [/\b(insurance|insurer|policy|coverage|claim)\b/i, "Insurance Events"],
  [/\b(suit|filed|court|complaint|demand|deadline|valuation|case ready|settlement|deposition|legal)\b/i, "Legal & Case Events"],
  [/\b(symptom|hospital|medical|doctor|physician|clinic|condition|stroke|injur)/i, "Medical Events"],
];
// An attorney-set type, where no rule above decides it.
const TYPE_CATEGORY: Record<string, Category> = {
  Treatment: "Treatment & Procedures", Injury: "Medical Events", Incident: "Emergency Events",
  "Case milestone": "Legal & Case Events", Damages: "Other", Other: "Other",
};
export function categoryOf(ev: FilterableEvent): Category {
  const text = [ev.title, ev.summary, ev.description].filter(Boolean).join(" ");
  return CATEGORY_RULES.find(([re]) => re.test(text))?.[1] ?? (ev.type ? TYPE_CATEGORY[ev.type] : undefined) ?? "Other";
}

const SOURCE_RULES: [RegExp, (typeof SOURCES)[number]][] = [
  [/(^|[_\s-])(ems|dispatch|ambulance|run[_\s-]?sheet)/i, "EMS Records"],
  [/(^|[_\s-])(er|hospital|admission|triage|vitals|discharge)([_\s.-]|$)/i, "Hospital Records"],
  [/police|crash|accident[_\s-]?report|collision[_\s-]?report/i, "Police Reports"],
  [/expert|ime|reconstruction/i, "Expert Reports"],
  [/witness/i, "Witness Statements"],
  [/court|complaint|summons|motion|docket|pleading/i, "Court Documents"],
  [/mri|radiolog|therap|treatment|medical|rehab|caregiver|clinic|physician|care[_\s-]?plan|incident[_\s-]?report|call[_\s-]?log/i, "Medical Records"],
];
export const sourceOfFile = (name: string) => SOURCE_RULES.find(([re]) => re.test(name))?.[1] ?? "Other Sources";
export const sourcesOf = (ev: FilterableEvent) => new Set([...ev.evidence, ...(ev.sourceRef ? [ev.sourceRef] : [])].map(sourceOfFile));

/** Extracted events stay pending until an attorney verifies them; none is recorded as verified yet. */
export function statusesOf(ev: FilterableEvent): Set<(typeof STATUSES)[number]> {
  return new Set(ev.origin === "manual" ? ["Manually Added"] : ["System Generated", "Pending Verification"]);
}

export interface TimelineFilter { category: string; range: string; from: string; to: string; source: string; status: string; q: string }
export const NO_FILTER: TimelineFilter = { category: "", range: "All Dates", from: "", to: "", source: "", status: "", q: "" };
export const filterActive = (f: TimelineFilter) => !!(f.category || f.source || f.status || f.q.trim() || f.range !== "All Dates");

const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const isoDaysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/** All filters together (AND); the list keeps its order. */
export function applyTimelineFilter<T extends FilterableEvent>(events: T[], f: TimelineFilter): T[] {
  const q = f.q.trim().toLowerCase();
  const today = isoToday();
  const [lo, hi] =
    f.range === "Today" ? [today, today]
    : f.range === "Last 7 Days" ? [isoDaysAgo(7), today]
    : f.range === "Last 30 Days" ? [isoDaysAgo(30), today]
    : f.range === "Custom Range" ? [f.from || "", f.to || ""]
    : ["", ""];
  return events.filter((ev) =>
    (!f.category || categoryOf(ev) === f.category) &&
    (!f.source || sourcesOf(ev).has(f.source as never)) &&
    (!f.status || statusesOf(ev).has(f.status as never)) &&
    (!lo || ev.iso >= lo) && (!hi || ev.iso <= hi) &&
    (!q || [ev.title, ev.summary, ev.description, categoryOf(ev), ...ev.evidence, ev.sourceRef].filter(Boolean).join(" ").toLowerCase().includes(q)));
}

const sel = "h-9 w-full bg-white border border-line rounded-lg px-2.5 text-sm text-ink focus:outline-none focus:border-brand";

export function TimelineFilterBar<T extends FilterableEvent>({ events, value, onChange }: { events: T[]; value: TimelineFilter; onChange: (f: TimelineFilter) => void }) {
  const set = (k: keyof TimelineFilter) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value });
  const count = (pred: (ev: T) => boolean) => events.filter(pred).length;
  const field = (id: string, label: string, control: React.ReactNode) => (
    <label htmlFor={id} className="block min-w-[150px] flex-1 sm:flex-none sm:w-44">
      <span className="eyebrow block mb-1">{label}</span>{control}
    </label>
  );
  return (
    <div role="group" aria-label="Filter timeline events" className="rounded-xl border border-line bg-offwhite p-3 mb-5">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2.5">
        {field("tf-category", "Event category", (
          <select id="tf-category" className={sel} value={value.category} onChange={set("category")}>
            <option value="">All Events</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c} ({count((ev) => categoryOf(ev) === c)})</option>)}
          </select>
        ))}
        {field("tf-range", "Date range", (
          <select id="tf-range" className={sel} value={value.range} onChange={set("range")}>
            {DATE_RANGES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        ))}
        {value.range === "Custom Range" && <>
          {field("tf-from", "From", <input id="tf-from" type="date" className={sel} value={value.from} max={value.to || undefined} onChange={set("from")} />)}
          {field("tf-to", "To", <input id="tf-to" type="date" className={sel} value={value.to} min={value.from || undefined} onChange={set("to")} />)}
        </>}
        {field("tf-source", "Source", (
          <select id="tf-source" className={sel} value={value.source} onChange={set("source")}>
            <option value="">All Sources</option>
            {SOURCES.map((s) => <option key={s} value={s}>{s} ({count((ev) => sourcesOf(ev).has(s))})</option>)}
          </select>
        ))}
        {field("tf-status", "Verification", (
          <select id="tf-status" className={sel} value={value.status} onChange={set("status")}>
            <option value="">All Statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s} ({count((ev) => statusesOf(ev).has(s))})</option>)}
          </select>
        ))}
        <label htmlFor="tf-q" className="block flex-1 min-w-[200px]">
          <span className="eyebrow block mb-1">Search</span>
          <span className="flex items-center gap-2 h-9 bg-white border border-line rounded-lg px-2.5 focus-within:border-brand">
            <Search className="w-4 h-4 text-[#8A98A3] shrink-0" />
            <input id="tf-q" type="search" value={value.q} onChange={set("q")} placeholder="Search timeline events..." className="flex-1 min-w-0 text-sm bg-transparent outline-none" />
          </span>
        </label>
        {filterActive(value) && (
          <button type="button" onClick={() => onChange(NO_FILTER)} className="h-9 inline-flex items-center gap-1 px-2.5 rounded-lg text-sm font-semibold text-deep hover:bg-tint">
            <X className="w-3.5 h-3.5" /> Clear all
          </button>
        )}
      </div>
    </div>
  );
}
