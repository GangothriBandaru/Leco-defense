/* ────────────────────────────────────────────────────────────────────────────
   Simulated full-text document content for the Document Workspace viewer.

   This is a prototype: there are no real files behind the document names, so we
   synthesize realistic, readable body text per document type. Content is keyed
   off the filename (same buckets as classifyDocuments) and stays consistent with
   the demo case — Estate of Miller vs Logistics Co. / Evelyn Miller, a motor
   vehicle accident with cervical disc injury. In production this would be the
   actual extracted document text.
   ──────────────────────────────────────────────────────────────────────────── */

export type DocBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "fields"; pairs: [string, string][] }
  | { type: "list"; items: string[] };

export interface DocumentContent {
  kind: "text" | "image";
  blocks: DocBlock[];
}

type DocKind =
  | "mri"
  | "er"
  | "therapy"
  | "treatment"
  | "medical"
  | "police"
  | "insurance"
  | "wage"
  | "photo"
  | "general";

function classifyName(name: string): DocKind {
  const n = name.toLowerCase();
  if (/\.(jpg|jpeg|png|gif|webp)$|photo|image|picture|scene/.test(n)) return "photo";
  if (/(mri|ct_|x-?ray|radiology|imaging)/.test(n)) return "mri";
  if (/(er_|emergency|admission|discharge|hospital)/.test(n)) return "er";
  if (/(therapy|rehab|physical)/.test(n)) return "therapy";
  if (/(treatment|surgery|medication|prescription|clinical|follow)/.test(n)) return "treatment";
  if (/(medical|records|bills|invoice)/.test(n)) return "medical";
  if (/(police|accident|incident|witness|citation|patrol|officer|crash|report)/.test(n)) return "police";
  if (/(insurance|policy|claim|coverage|liability)/.test(n)) return "insurance";
  if (/(wage|employment|salary|income|w2|pay|employer|job|verification|loss)/.test(n)) return "wage";
  return "general";
}

const PATIENT = "Miller, Evelyn";
const DOB = "03/14/1981";
const MRN = "STM-4471902";
const CLAIM = "PI-2024-001";

function buildContent(doc: any): DocumentContent {
  const kind = classifyName(String(doc?.name ?? ""));
  const date = doc?.date ?? "Jun 1, 2026";

  switch (kind) {
    case "mri":
      return {
        kind: "text",
        blocks: [
          { type: "heading", text: "ST. MARY'S MEDICAL CENTER — DEPARTMENT OF RADIOLOGY" },
          { type: "fields", pairs: [
            ["Patient", PATIENT], ["DOB", DOB], ["MRN", MRN],
            ["Exam", "MRI Cervical Spine w/o Contrast"], ["Date of Service", date], ["Referring", "Dr. A. Reyes, MD"],
          ]},
          { type: "heading", text: "CLINICAL HISTORY" },
          { type: "paragraph", text: "41-year-old female involved in a motor vehicle collision. Presents with persistent axial neck pain radiating to the left upper extremity, with associated paresthesia. Evaluate for disc herniation and cord compression." },
          { type: "heading", text: "TECHNIQUE" },
          { type: "paragraph", text: "Multiplanar, multisequence MR imaging of the cervical spine was performed without intravenous contrast. Sagittal T1, sagittal T2, sagittal STIR, and axial T2-weighted gradient echo sequences were obtained." },
          { type: "heading", text: "FINDINGS" },
          { type: "paragraph", text: "Alignment: Reversal of the normal cervical lordosis, likely positional or secondary to muscle spasm." },
          { type: "paragraph", text: "C5-C6: Posterior disc herniation measuring approximately 4 mm, effacing the ventral thecal sac with resultant central canal stenosis and flattening of the ventral cord. Mild bilateral neural foraminal narrowing, left greater than right." },
          { type: "paragraph", text: "C6-C7: Broad-based disc protrusion with annular fissure, contributing to mild central canal narrowing and left neural foraminal compromise impinging the exiting C7 nerve root." },
          { type: "paragraph", text: "Remaining cervical levels: Disc heights and signal otherwise preserved. No fracture, marrow replacement, or prevertebral soft tissue abnormality." },
          { type: "heading", text: "IMPRESSION" },
          { type: "list", items: [
            "C5-C6 posterior disc herniation with central canal stenosis and ventral cord flattening.",
            "C6-C7 disc protrusion with left foraminal narrowing and C7 nerve root impingement.",
            "Findings are acute and consistent with the reported traumatic mechanism of injury.",
          ]},
          { type: "paragraph", text: "Electronically signed by M. Okafor, MD — Board Certified Radiologist." },
        ],
      };

    case "er":
      return {
        kind: "text",
        blocks: [
          { type: "heading", text: "ST. MARY'S MEDICAL CENTER — EMERGENCY DEPARTMENT" },
          { type: "fields", pairs: [
            ["Patient", PATIENT], ["DOB", DOB], ["MRN", MRN],
            ["Arrival", date], ["Mode", "Ambulance (EMS)"], ["Acuity", "ESI Level 2"],
          ]},
          { type: "heading", text: "CHIEF COMPLAINT" },
          { type: "paragraph", text: "Neck pain, headache, and left arm tingling following a motor vehicle collision approximately 45 minutes prior to arrival." },
          { type: "heading", text: "HISTORY OF PRESENT ILLNESS" },
          { type: "paragraph", text: "Restrained driver of a sedan struck on the driver side by a commercial vehicle at an intersection. Airbags deployed. Patient was ambulatory at the scene but reports immediate onset of cervical pain. Denies loss of consciousness. Reports radiating paresthesia into the left hand." },
          { type: "heading", text: "EXAMINATION" },
          { type: "list", items: [
            "Vitals: BP 138/86, HR 92, RR 18, SpO2 99% on room air.",
            "Neck: Midline cervical tenderness, paraspinal muscle spasm, reduced range of motion on rotation.",
            "Neuro: Diminished sensation along the left C7 dermatome; strength 5/5 in all extremities.",
            "C-spine immobilized on arrival; cleared clinically pending imaging.",
          ]},
          { type: "heading", text: "ASSESSMENT & PLAN" },
          { type: "paragraph", text: "Acute cervical strain with radiculopathy following MVC. Imaging ordered (MRI cervical spine). Prescribed cyclobenzaprine and naproxen. Referred to orthopedic spine and outpatient physical therapy. Return precautions reviewed." },
          { type: "paragraph", text: "Attending: J. Whitman, MD — Emergency Medicine." },
        ],
      };

    case "therapy":
      return {
        kind: "text",
        blocks: [
          { type: "heading", text: "MIDTOWN PHYSICAL THERAPY & REHABILITATION" },
          { type: "fields", pairs: [
            ["Patient", PATIENT], ["DOB", DOB], ["Claim", CLAIM],
            ["Plan of Care", "Cervical radiculopathy, post-MVC"], ["Period", date], ["Therapist", "L. Nguyen, DPT"],
          ]},
          { type: "heading", text: "SUBJECTIVE" },
          { type: "paragraph", text: "Patient reports ongoing neck stiffness rated 6/10, worse with prolonged sitting and overhead activity. Notes difficulty sleeping and reduced tolerance for desk work. Intermittent left-hand tingling persists." },
          { type: "heading", text: "OBJECTIVE" },
          { type: "list", items: [
            "Cervical AROM: Flexion 40°, Extension 35°, Rotation L 55° / R 60° — all limited with end-range pain.",
            "Palpable hypertonicity of bilateral upper trapezius and levator scapulae.",
            "Spurling's test positive on the left.",
            "Grip strength reduced on the left relative to the right.",
          ]},
          { type: "heading", text: "INTERVENTION" },
          { type: "paragraph", text: "Manual therapy, cervical traction, postural re-education, and a progressive deep neck flexor strengthening program. Modalities included moist heat and TENS for symptom management." },
          { type: "heading", text: "ASSESSMENT" },
          { type: "paragraph", text: "Patient demonstrates slow but measurable progress. Persistent range-of-motion deficits and chronic pain continue to limit daily function. Guarded prognosis for full recovery; permanent residual impairment anticipated." },
          { type: "heading", text: "PLAN" },
          { type: "paragraph", text: "Continue skilled therapy 2x/week for 6 weeks. Re-assess and consider neurology referral if radicular symptoms persist." },
        ],
      };

    case "treatment":
    case "medical":
      return {
        kind: "text",
        blocks: [
          { type: "heading", text: "ST. MARY'S MEDICAL CENTER — TREATMENT RECORD" },
          { type: "fields", pairs: [
            ["Patient", PATIENT], ["DOB", DOB], ["MRN", MRN],
            ["Date of Service", date], ["Provider", "Dr. A. Reyes, MD — Orthopedic Spine"], ["Claim", CLAIM],
          ]},
          { type: "heading", text: "INTERVAL HISTORY" },
          { type: "paragraph", text: "Patient presented within 24 hours of the collision with acute cervical pain and has maintained a continuous course of care since. Symptoms have followed an escalating pattern consistent with the documented injury." },
          { type: "heading", text: "ASSESSMENT" },
          { type: "list", items: [
            "Cervical disc herniation C5-C6 with radiculopathy.",
            "C6-C7 disc protrusion with left C7 nerve root involvement.",
            "Chronic cervicalgia with myofascial component.",
          ]},
          { type: "heading", text: "TREATMENT PROVIDED" },
          { type: "paragraph", text: "Multi-modal care including pharmacologic management, two cervical epidural steroid injections, and a structured outpatient physical therapy program across consecutive months. Patient referred to neurology and rehabilitation for continued management." },
          { type: "heading", text: "BILLING SUMMARY" },
          { type: "fields", pairs: [
            ["Imaging (MRI)", "$2,850.00"], ["Specialist visits", "$4,120.00"],
            ["Injections", "$6,300.00"], ["Physical therapy", "$5,180.00"], ["Total to date", "$18,450.00"],
          ]},
          { type: "heading", text: "PROGNOSIS" },
          { type: "paragraph", text: "Guarded. Permanent residual impairment is anticipated and is expected to affect long-term function and quality of life. Chronic pain reported affecting sleep, work, and daily activities." },
        ],
      };

    case "police":
      return {
        kind: "text",
        blocks: [
          { type: "heading", text: "CITY POLICE DEPARTMENT — TRAFFIC COLLISION REPORT" },
          { type: "fields", pairs: [
            ["Report No.", "2024-001"], ["Date / Time", `${date}, 08:42`], ["Location", "Intersection of 5th Ave & Market St"],
            ["Officer", "Ofc. D. Castillo, Badge 2287"], ["Conditions", "Clear / Dry / Daylight"],
          ]},
          { type: "heading", text: "PARTIES" },
          { type: "list", items: [
            "Unit 1 (Plaintiff): E. Miller — passenger sedan, traveling northbound.",
            "Unit 2 (Defendant): Commercial box truck operated on behalf of Logistics Co., traveling eastbound.",
          ]},
          { type: "heading", text: "NARRATIVE" },
          { type: "paragraph", text: "Based on physical evidence, signal timing data, and witness accounts, Unit 2 entered the intersection against a red traffic signal and struck Unit 1 on the driver side. Skid marks and the debris field are consistent with the point of impact described by the plaintiff and an independent witness." },
          { type: "paragraph", text: "An estimated travel speed for Unit 2 exceeded the posted limit prior to braking. The driver of the commercial vehicle was cited for failure to yield right-of-way." },
          { type: "heading", text: "WITNESS STATEMENT" },
          { type: "paragraph", text: "Witness (J. Alvarez) observed the truck proceeding into the intersection after the light had turned red and stated the sedan had the right-of-way." },
          { type: "heading", text: "FAULT DETERMINATION" },
          { type: "paragraph", text: "Primary fault attributed to Unit 2 (Logistics Co.) for entering against the signal and failure to yield. Citation issued: VC 21453(a)." },
        ],
      };

    case "insurance":
      return {
        kind: "text",
        blocks: [
          { type: "heading", text: "COMMERCIAL GENERAL LIABILITY — DECLARATIONS" },
          { type: "fields", pairs: [
            ["Named Insured", "Logistics Co."], ["Policy No.", "CGL-7741-22"], ["Policy Period", "Jan 1, 2026 – Jan 1, 2027"],
            ["Status on Date of Loss", "Active / In Force"], ["Carrier", "Sentinel Casualty Insurance"],
          ]},
          { type: "heading", text: "COVERAGE SUMMARY" },
          { type: "fields", pairs: [
            ["Each Occurrence Limit", "$1,000,000"], ["General Aggregate", "$2,000,000"],
            ["Bodily Injury / Property Damage", "Included"], ["Hired & Non-Owned Auto", "Included"], ["Deductible", "$10,000 per claim"],
          ]},
          { type: "heading", text: "APPLICABLE PROVISIONS" },
          { type: "paragraph", text: "Commercial general liability coverage was active on the date of loss. The per-occurrence limits exceed the projected value of the claim, and no coverage shortfall is expected to cap recovery for the documented damages." },
          { type: "heading", text: "ENDORSEMENTS" },
          { type: "list", items: [
            "Additional insured — contracted carriers.",
            "Primary and non-contributory wording applies.",
            "No applicable exclusion identified for the loss as reported.",
          ]},
        ],
      };

    case "wage":
      return {
        kind: "text",
        blocks: [
          { type: "heading", text: "EMPLOYMENT & WAGE VERIFICATION" },
          { type: "fields", pairs: [
            ["Employee", PATIENT], ["Employer", "Northgate Financial Group"], ["Position", "Senior Account Manager"],
            ["Hire Date", "06/02/2014"], ["Status", "Full-time, Exempt"], ["Verified On", date],
          ]},
          { type: "heading", text: "COMPENSATION" },
          { type: "fields", pairs: [
            ["Annual Base Salary", "$92,400.00"], ["Average Monthly Gross", "$7,700.00"],
            ["Standard Schedule", "40 hrs/week"], ["Last Full Pay Period", "May 2026"],
          ]},
          { type: "heading", text: "TIME MISSED" },
          { type: "paragraph", text: "Employee was absent from work due to injury and related medical treatment following the collision. Time away has been recorded as a combination of paid leave and unpaid leave once accruals were exhausted." },
          { type: "list", items: [
            "Documented days missed: 31 business days.",
            "Estimated lost wages to date: $11,615.00.",
            "Reduced capacity / modified duty noted on return.",
          ]},
          { type: "paragraph", text: "Verified by: HR Department, Northgate Financial Group." },
        ],
      };

    case "photo":
      return {
        kind: "image",
        blocks: [
          { type: "heading", text: "EVIDENCE PHOTOGRAPH" },
          { type: "fields", pairs: [
            ["Exhibit", String(doc?.name ?? "Photo")], ["Captured", date], ["Source", doc?.source ?? "Plaintiff"],
          ]},
          { type: "paragraph", text: "Scene photograph documenting vehicle positions, impact damage, and roadway evidence at the intersection. Skid marks and debris field are visible and consistent with the described point of impact." },
        ],
      };

    default:
      return {
        kind: "text",
        blocks: [
          { type: "heading", text: String(doc?.name ?? "Document") },
          { type: "fields", pairs: [
            ["Source", doc?.source ?? "—"], ["Date", date], ["Status", doc?.status ?? "—"], ["Claim", CLAIM],
          ]},
          { type: "paragraph", text: "This document is part of the case file for Estate of Miller vs Logistics Co. The full extracted text is displayed here for review. In production this reflects the actual contents of the uploaded file." },
          { type: "paragraph", text: "No structured template is associated with this document type. Reviewers can read the complete text inline and reference it from notes, insights, and the AI assistant without leaving the workspace." },
        ],
      };
  }
}

export function getDocumentContent(doc: any): DocumentContent {
  if (doc?.content?.blocks) return doc.content as DocumentContent;
  return buildContent(doc);
}
