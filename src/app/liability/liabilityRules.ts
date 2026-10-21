import { FAULT_RULES, type FaultRuleId } from "../jurisdiction/jurisdictionData";

// ── Liability rules, by jurisdiction ─────────────────────────────────────────
// The rules a liability analysis applies — how plaintiff fault is treated, how
// fault is shared among defendants, recovery sources and settlement credit —
// kept as data per state so the workspace never hard-codes one jurisdiction.
//
// Every authority here starts unverified. The application has no legal
// research integration, so a rule is only "Verified" once an attorney records
// having checked it, and the source they checked it against. Nothing an AI
// produced is shown as settled law.

export type AuthorityStatus = "Unverified" | "Verified by attorney";

export interface Authority {
  id: string;
  /** The citation or source title. */
  citation: string;
  /** What it governs in this analysis. */
  issue: string;
  jurisdiction: string;
  /** When the text was checked to be in force — absent until verified. */
  effective?: string;
  /** Where the text can be read. */
  url?: string;
  /** What the rule says, at the level this analysis relies on. */
  summary: string;
  /** Why it may or may not apply to this case. */
  applicability?: string;
}

export interface AllocationRule {
  label: string;
  value: string;
  authorityId?: string;
}

export interface JurisdictionRules {
  state: string;
  faultRule: FaultRuleId;
  faultRuleLabel: string;
  /** What plaintiff fault does to recovery, in a sentence. */
  plaintiffFault: string;
  /** The threshold at which plaintiff fault bars recovery, if any. */
  threshold: string;
  jointAndSeveral: string;
  /** No-fault / PIP treatment for the claim type. */
  noFault: { title: string; detail: string; applicable: boolean };
  allocation: AllocationRule[];
  authorities: Authority[];
}

const ILLINOIS: JurisdictionRules = {
  state: "Illinois",
  faultRule: "mod51",
  faultRuleLabel: "Modified comparative fault · barred above 50%",
  plaintiffFault:
    "Plaintiff fault of 50% or less reduces damages in proportion; more than 50% of the proximate cause bars recovery.",
  threshold: "Barred only above 50% plaintiff fault",
  jointAndSeveral:
    "Defendants found liable answer jointly for medical expenses. For other damages, a defendant under 25% of total fault is severally liable; 25% or more, jointly. Exceptions in § 2-1118 may change this for this claim — not verified.",
  noFault: {
    title: "Not applicable",
    detail: "No-fault / PIP rules govern motor-vehicle claims. This is a delayed-treatment claim against a care facility, so no threshold applies.",
    applicable: false,
  },
  allocation: [
    { label: "Plaintiff fault", value: "Reduces recovery; bars above 50%", authorityId: "il-2-1116" },
    { label: "Joint and several", value: "Medical expenses: joint · other damages: 25% threshold", authorityId: "il-2-1117" },
    { label: "Exceptions", value: "May apply — § 2-1118 not verified for this claim", authorityId: "il-2-1118" },
    { label: "Nonparty allocation", value: "Who counts toward total fault is set by § 2-1117 — not verified", authorityId: "il-2-1117" },
    { label: "Contribution", value: "Among defendants found liable, under the Contribution Act", authorityId: "il-740-100" },
    { label: "Settlement credit", value: "Reduces recovery by any good-faith settlement", authorityId: "il-740-100" },
  ],
  authorities: [
    {
      id: "il-2-1116",
      citation: "735 ILCS 5/2-1116",
      issue: "Plaintiff fault · comparative fault bar",
      jurisdiction: "Illinois",
      url: "https://www.ilga.gov/Documents/legislation/ilcs/documents/073500050K2-1116.htm",
      summary: "In negligence actions for bodily injury, plaintiff fault of more than 50% of the proximate cause bars recovery; otherwise damages are reduced in proportion.",
      applicability: "Applies to negligence-based bodily-injury actions; no plaintiff fault is on record in this case.",
    },
    {
      id: "il-2-1117",
      citation: "735 ILCS 5/2-1117",
      issue: "Joint and several liability",
      jurisdiction: "Illinois",
      url: "https://www.ilga.gov/Documents/legislation/ilcs/documents/073500050K2-1117.htm",
      summary: "Defendants found liable are jointly and severally liable for medical expenses; for other damages, under 25% of total fault is several only, 25% or more is joint and several. Subject to § 2-1118.",
      applicability: "Matters only if more than one defendant is found liable.",
    },
    {
      id: "il-2-1118",
      citation: "735 ILCS 5/2-1118",
      issue: "Exceptions to § 2-1117",
      jurisdiction: "Illinois",
      summary: "Lists actions excepted from the § 2-1117 rule. Whether it reaches this claim has not been checked.",
      applicability: "Read the current text before relying on the 25% threshold.",
    },
    {
      id: "il-740-100",
      citation: "740 ILCS 100 (Joint Tortfeasor Contribution Act)",
      issue: "Settlement credit and contribution",
      jurisdiction: "Illinois",
      summary: "A good-faith settlement with one tortfeasor reduces the recovery against the others by the amount paid.",
      applicability: "No settlements are on record.",
    },
    {
      id: "il-2-622",
      citation: "735 ILCS 5/2-622",
      issue: "Pre-suit · health professional's report",
      jurisdiction: "Illinois",
      summary: "Healing-art malpractice complaints require an affidavit and a health professional's report.",
      applicability: "Depends on the facility's licensing type, which is not on record.",
    },
    {
      id: "il-13-212",
      citation: "735 ILCS 5/13-212(a)",
      issue: "Limitations and repose · medical malpractice",
      jurisdiction: "Illinois",
      summary: "Two years from discovery, with a four-year repose period, for healing-art malpractice.",
      applicability: "Already the working deadline in the Jurisdiction review — not yet verified there either.",
    },
    {
      id: "il-210-45",
      citation: "210 ILCS 45 (Nursing Home Care Act)",
      issue: "Resident-rights claims",
      jurisdiction: "Illinois",
      summary: "Statutory claims for residents of facilities licensed under the Act.",
      applicability: "Only if the facility is licensed under the Act — licensing not on record.",
    },
  ],
};

const RULES: JurisdictionRules[] = [ILLINOIS];

/** The rules for a state, or undefined — the workspace then says none are recorded. */
export function rulesForState(state?: string | null): JurisdictionRules | undefined {
  if (!state) return undefined;
  return RULES.find((r) => r.state.toLowerCase() === state.toLowerCase());
}

/** The generic description of a fault rule, from the jurisdiction module. */
export const faultRuleInfo = (id: FaultRuleId) => FAULT_RULES.find((r) => r.id === id);
