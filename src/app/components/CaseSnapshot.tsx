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

const EMPTY = "Not provided";

function Value({ value }: { value?: string }) {
  return value
    ? <span className="text-sm font-semibold text-ink whitespace-nowrap">{value}</span>
    : <span className="text-sm text-[#8A98A3] whitespace-nowrap">{EMPTY}</span>;
}

function Column({ label, children, grow }: { label: string; children: React.ReactNode; grow?: boolean }) {
  return (
    <div className={`flex flex-col px-5 py-4 ${grow ? "flex-1" : ""}`}>
      <span className="eyebrow mb-1.5 whitespace-nowrap">{label}</span>
      {children}
    </div>
  );
}

function ContactRow({ icon: Icon, value, label }: { icon: typeof Mail; value?: string; label: string }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Icon className="w-3.5 h-3.5 shrink-0 text-deep" strokeWidth={1.75} aria-label={label} />
      {value
        ? <span className="text-sm font-semibold text-ink whitespace-nowrap">{value}</span>
        : <span className="text-sm text-[#8A98A3] whitespace-nowrap">No {label.toLowerCase()}</span>}
    </div>
  );
}

function InsurerField({ label, value }: { label: string; value?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-[#8A98A3] leading-tight mb-0.5 whitespace-nowrap">{label}</div>
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
    <div className="lg-card overflow-hidden">
      {/* Title row — summary fills the space between the name and the menu */}
      <div className="flex items-center gap-8 px-6 pt-6 pb-5 border-b border-line">
        <div className="shrink-0">
          <h2 className="section-header">{caseName}</h2>
        </div>
        <CaseDescription text={summary} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title="More actions"
              aria-label="Case details actions"
              className="w-8 h-8 -mr-2 inline-flex items-center justify-center shrink-0 self-start rounded-lg text-[#5B6B78] hover:bg-tint hover:text-ink transition-colors data-[state=open]:bg-tint data-[state=open]:text-ink"
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

      {/* Metadata strip */}
      <div className="flex flex-wrap divide-x divide-[#EEF3F6]">
        <Column label="Case Type"><Value value={caseType} /></Column>
        <Column label="Insured Name"><Value value={insuredName} /></Column>
        <Column label="Contact Details">
          <div className="flex flex-col gap-1.5">
            <ContactRow icon={Mail} value={insuredEmail} label="Email" />
            <ContactRow icon={Phone} value={insuredPhone} label="Phone" />
          </div>
        </Column>
        <Column label="Insurer Details" grow>
          <div className="grid grid-cols-[auto_auto] gap-x-6 gap-y-2 w-max">
            <InsurerField label="Policy Name" value={policyName} />
            <InsurerField label="Insurer Jurisdiction" value={insurerJurisdiction} />
            {(insurerName || policyNumber) && (
              <>
                <InsurerField label="Insurer" value={insurerName} />
                <InsurerField label="Policy No." value={policyNumber} />
              </>
            )}
          </div>
        </Column>
        <Column label="Case ID"><Value value={caseId} /></Column>
      </div>
    </div>
  );
}
