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
  caseSubType?: string;
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
    ? <span className="block min-w-0 text-sm font-semibold text-ink leading-5 truncate" title={value}>{value}</span>
    : <span className="block min-w-0 text-sm text-[#8A98A3] leading-5 truncate">{empty}</span>;
}

// One column of the information row. The row's 1px gaps over the divider
// colour draw the dividers, so they stay even in one row or when wrapped.
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
    <div className="flex items-center gap-2 min-w-0">
      <Icon className="w-3.5 h-3.5 shrink-0 text-deep" strokeWidth={1.75} aria-hidden="true" />
      <Value value={value} empty={empty} />
    </div>
  );
}

export function CaseSnapshot({
  caseName,
  caseType,
  caseSubType,
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
  const policyMeta = [insurerName, policyNumber && `Policy No. ${policyNumber}`, insurerJurisdiction].filter(Boolean).join(" · ");
  const policyTitle = [
    ["Policy Name", policyName], ["Insurer", insurerName], ["Policy No.", policyNumber], ["Insurer Jurisdiction", insurerJurisdiction],
  ].map(([k, v]) => `${k}: ${v || "Not provided"}`).join("\n");

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

      {/* Information row — one row sized to its content on a wide card, with
          spare width going mostly to Contact and Insurer Details. On a narrower
          card the short columns pair up and Insurer Details takes its own row. */}
      <div className="grid grid-cols-1 @md:grid-cols-2 @4xl:flex gap-px bg-[#EEF3F6]">
        <Cell label="Insured Name" className="@4xl:grow @4xl:shrink-0">
          <Value value={insuredName} />
        </Cell>
        <Cell label="Contact Details" className="@4xl:grow-[1.5] @4xl:shrink">
          <div className="space-y-1">
            <ContactRow icon={Mail} value={insuredEmail} empty="No email" />
            <ContactRow icon={Phone} value={insuredPhone} empty="No phone" />
          </div>
        </Cell>
        <Cell label="Case Type / Sub-Type" className="@4xl:grow @4xl:shrink-0">
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2.5 gap-y-1">
            <span className="text-[11px] text-[#8A98A3]">Type</span>
            <Value value={caseType} />
            <span className="text-[11px] text-[#8A98A3]">Sub-Type</span>
            <Value value={caseSubType} />
          </div>
        </Cell>
        <Cell label="Insurer Details" className="order-last @md:col-span-2 @4xl:order-none @4xl:grow-[2] @4xl:shrink">
          <div className="space-y-1" title={policyTitle}>
            <Value value={policyName} empty="Policy not provided" />
            {policyMeta && <span className="block text-xs text-[#5B6B78] leading-5 truncate">{policyMeta}</span>}
          </div>
        </Cell>
        <Cell label="Case ID" className="@4xl:grow @4xl:shrink-0">
          <Value value={caseId} />
        </Cell>
      </div>
    </div>
  );
}
