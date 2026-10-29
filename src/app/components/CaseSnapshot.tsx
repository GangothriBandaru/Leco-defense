import { Mail, Phone, MoreVertical, Pencil } from "lucide-react";
import { CaseDescription } from "./CaseDescription";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

interface CaseSnapshotProps {
  caseName: string;
  caseType?: string;
  caseId: string;
  summary: string;
  insuredName?: string;
  insuredEmail?: string;
  insuredPhone?: string;
  policyName?: string;
  policyNumber?: string;
  insurerName?: string;
  insurerJurisdiction?: string;
  onEdit: () => void;
}

function Value({ value, empty = "Not provided" }: { value?: string; empty?: string }) {
  return value
    ? <span className="block text-sm font-semibold text-ink leading-5 truncate" title={value}>{value}</span>
    : <span className="block text-sm text-[#8A98A3] leading-5 truncate">{empty}</span>;
}

// One cell of the information row. The row's 1px gaps over the divider colour
// draw the dividers, so they stay even however the cells wrap.
function Cell({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`bg-white px-5 py-3.5 min-w-0 ${className}`}>
      <div className="eyebrow mb-1.5 whitespace-nowrap">{label}</div>
      {children}
    </div>
  );
}

function ContactRow({ icon: Icon, value, empty }: { icon: typeof Mail; value?: string; empty: string }) {
  return (
    <div className="flex items-center gap-2 leading-5 min-w-0">
      <Icon className="w-3.5 h-3.5 shrink-0 text-deep" strokeWidth={1.75} aria-hidden="true" />
      <Value value={value} empty={empty} />
    </div>
  );
}

function SubField({ label, value }: { label: string; value?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] leading-4 text-[#8A98A3] whitespace-nowrap">{label}</div>
      <Value value={value} />
    </div>
  );
}

export function CaseSnapshot({
  caseName,
  caseType,
  caseId,
  summary,
  insuredName,
  insuredEmail,
  insuredPhone,
  policyName,
  policyNumber,
  insurerName,
  insurerJurisdiction,
  onEdit,
}: CaseSnapshotProps) {
  return (
    <div className="lg-card overflow-hidden @container">
      {/* Header — name at the left, the description preview and menu at the right */}
      <div className="flex items-center gap-6 px-6 py-4 border-b border-line">
        <h2 className="section-header min-w-0 shrink truncate" title={caseName}>{caseName}</h2>
        <CaseDescription text={summary} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title="More actions"
              aria-label="Case details actions"
              className="w-8 h-8 -mr-2 inline-flex items-center justify-center shrink-0 rounded-lg text-[#5B6B78] hover:bg-tint hover:text-ink transition-colors data-[state=open]:bg-tint data-[state=open]:text-ink"
            >
              <MoreVertical className="w-4 h-4" strokeWidth={1.75} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 rounded-xl border-line p-1">
            <DropdownMenuItem onSelect={onEdit} className="gap-2 px-3 py-2 text-sm text-ink rounded-md cursor-pointer">
              <Pencil className="w-3.5 h-3.5 text-deep" strokeWidth={1.75} /> Edit Case Details
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Information row — one row on a wide card; on a narrower one the four
          short fields share a row and Insurer Details takes the next. */}
      <div className="grid gap-px bg-[#EEF3F6] grid-cols-2 @3xl:grid-cols-4 @6xl:grid-cols-[minmax(max-content,1fr)_minmax(max-content,1fr)_minmax(max-content,1.25fr)_minmax(max-content,2fr)_minmax(max-content,1fr)]">
        <Cell label="Case Type"><Value value={caseType} /></Cell>
        <Cell label="Insured Name"><Value value={insuredName} /></Cell>
        <Cell label="Contact Details">
          <div className="space-y-1">
            <ContactRow icon={Mail} value={insuredEmail} empty="No email" />
            <ContactRow icon={Phone} value={insuredPhone} empty="No phone" />
          </div>
        </Cell>
        <Cell label="Insurer Details" className="order-last col-span-2 @3xl:col-span-4 @6xl:order-none @6xl:col-span-1">
          <div className="grid grid-cols-1 @md:grid-cols-[repeat(2,max-content)] gap-x-8 gap-y-2">
            <SubField label="Policy Name" value={policyName} />
            <SubField label="Insurer Jurisdiction" value={insurerJurisdiction} />
            <SubField label="Insurer" value={insurerName} />
            <SubField label="Policy No." value={policyNumber} />
          </div>
        </Cell>
        <Cell label="Case ID"><Value value={caseId} /></Cell>
      </div>
    </div>
  );
}
