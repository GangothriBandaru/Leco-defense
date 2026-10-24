import { useSyncExternalStore } from "react";
import type { RequestedMedia } from "./intakeMessage";

// ── Intake requests ──────────────────────────────────────────────────────────
// Case → Intake Request → secure token → client URL → uploaded documents.
//
// Every request the attorney sends is a record here, keyed by case, with its
// own token and client-facing URL (/intake-request/{token}). The records are
// saved to the browser, so the client page opened from a copied link — in a
// new tab — reads the same request, and the attorney's tab sees the client's
// uploads as they arrive.

export type IntakeStatus =
  | "Draft" | "Sent" | "Opened" | "In Progress" | "Partially Completed" | "Completed" | "Expired" | "Cancelled";

export interface UploadedDocument {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: string;
  /** Where the original file is kept (mediaFileStore). Absent on uploads made
   *  before files were stored — those cannot be opened or checked. */
  storageKey?: string;
}

/** One submission by the client: the files it covered, their notes and the
 *  confirmation they accepted. */
export interface IntakeSubmission {
  submittedAt: string;
  documentIds: string[];
  /** Video & photos sent with this submission — media evidence records. */
  media?: { videoIds: string[]; setIds: string[] };
  notes: string;
  confirmationAccepted: true;
}

export interface IntakeRequest {
  /** Per case: REQ-001, REQ-002 … */
  id: string;
  /** Secure, unguessable token in the client URL. */
  token: string;
  caseId: string;
  caseName: string;
  plaintiff: string;
  sender: { name: string; firm: string };
  deliveryMethod: "email" | "sms";
  recipientEmail?: string;
  recipientPhone?: string;
  requestedDocs: string[];
  /** The video & photos asked for. Absent on older requests — none asked. */
  requestedMedia?: RequestedMedia;
  instructions: string;
  status: IntakeStatus;
  version: number;
  createdAt: string;
  lastSentAt: string;
  lastModifiedAt?: string;
  openedAt?: string;
  uploads: UploadedDocument[];
  /** The client's submissions, oldest first. Absent until the first one. */
  submissions?: IntakeSubmission[];
  /** Kept from the existing completed-request view. */
  docsReceived?: number;
  missingDocs?: number;
  /** The request this one follows up, when it asks again for what was missing. */
  followUpOf?: string;
  /** Uploads the attorney deleted from the case documents — not added again. */
  removedUploadIds?: string[];
  /** Removed from the dashboard. The record is kept — its ID, history,
   *  submissions and documents stay — and the client link is not revoked. */
  removedAt?: string;
  removedBy?: string;
}

const STORAGE_KEY = "leco.intake.requests.v1";

function load(): IntakeRequest[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let requests: IntakeRequest[] = typeof window === "undefined" ? [] : load();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function save() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(requests));
  } catch {
    // Storage unavailable — the request still works in this tab.
  }
}

// A change saved in another tab (the client uploading, the attorney sending).
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) { requests = load(); emit(); }
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const snapshot = () => requests;

/** Every request for one case, oldest first. */
export function useIntakeRequests(caseId: string): IntakeRequest[] {
  const all = useSyncExternalStore(subscribe, snapshot, snapshot);
  return all.filter((r) => r.caseId === caseId);
}

/** The one request a client URL points at. */
export function useIntakeRequestByToken(token: string): IntakeRequest | undefined {
  const all = useSyncExternalStore(subscribe, snapshot, snapshot);
  return all.find((r) => r.token === token);
}

function randomToken(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return "req_" + Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 20);
}

function uniqueToken(): string {
  let t = randomToken();
  while (requests.some((r) => r.token === t)) t = randomToken();
  return t;
}

export type NewIntakeRequest = Omit<IntakeRequest, "id" | "token" | "status" | "version" | "createdAt" | "lastSentAt" | "uploads">;

/** Creates and sends a request: a per-case ID, a fresh token, status Sent. */
export function createIntakeRequest(input: NewIntakeRequest): IntakeRequest {
  const forCase = requests.filter((r) => r.caseId === input.caseId);
  const now = new Date().toISOString();
  const record: IntakeRequest = {
    ...input,
    id: `REQ-${String(forCase.length + 1).padStart(3, "0")}`,
    token: uniqueToken(),
    status: "Sent",
    version: 1,
    createdAt: now,
    lastSentAt: now,
    uploads: [],
  };
  requests = [...requests, record];
  save();
  emit();
  return record;
}

/** A case that was already sent its intake request before requests were
 *  stored (the sample cases) gets that request recorded once — the same
 *  REQ-001, with a token of its own — so it has a link like any other. Does
 *  nothing when the case already has a stored request, so it never duplicates
 *  one and the link stays the same across reloads. */
export function adoptExistingIntakeRequest(
  input: NewIntakeRequest & Pick<IntakeRequest, "status" | "createdAt"> & Partial<Pick<IntakeRequest, "docsReceived" | "missingDocs">>,
): void {
  // Pick up anything another tab saved first, so two tabs never both adopt.
  const saved = load();
  if (saved.length > 0) requests = saved;
  if (requests.some((r) => r.caseId === input.caseId)) return;
  const record: IntakeRequest = {
    ...input,
    id: "REQ-001",
    token: uniqueToken(),
    version: 1,
    lastSentAt: input.createdAt,
    uploads: [],
  };
  requests = [...requests, record];
  save();
  emit();
}

export function updateIntakeRequest(token: string, patch: Partial<IntakeRequest> | ((r: IntakeRequest) => Partial<IntakeRequest>)) {
  requests = requests.map((r) => (r.token === token ? { ...r, ...(typeof patch === "function" ? patch(r) : patch) } : r));
  save();
  emit();
}

/** Removes a request from the dashboard without deleting it: the record, its
 *  submissions and the documents it brought stay, and IDs stay unique. Nothing
 *  is recalled or revoked — the client keeps the message and the link. */
export function removeIntakeRequestFromDashboard(token: string, by: string) {
  updateIntakeRequest(token, { removedAt: new Date().toISOString(), removedBy: by });
}

/** A client's submitted file the attorney deleted from the case: not added
 *  to the case documents again. */
export function releaseIntakeUpload(caseId: string, requestId: string, uploadId: string) {
  const r = requests.find((x) => x.caseId === caseId && x.id === requestId);
  if (r) updateIntakeRequest(r.token, (x) => ({ removedUploadIds: [...(x.removedUploadIds ?? []), uploadId] }));
}

/** The client opened the link: Sent → Opened, once. */
export function markIntakeRequestOpened(token: string) {
  const r = requests.find((x) => x.token === token);
  if (r && r.status === "Sent") updateIntakeRequest(token, { status: "Opened", openedAt: new Date().toISOString() });
}

/** A client upload, recorded against this request (and so its case). */
export function addIntakeUpload(token: string, doc: UploadedDocument) {
  updateIntakeRequest(token, (r) => ({
    uploads: [...r.uploads, doc],
    status: r.status === "Completed" ? r.status : "In Progress",
  }));
}

/** Uploaded files not yet part of a submission. */
export function unsubmittedUploads(r: IntakeRequest): UploadedDocument[] {
  const sent = new Set((r.submissions ?? []).flatMap((s) => s.documentIds));
  return r.uploads.filter((u) => !sent.has(u.id));
}

/** The client submits their uploaded files with their notes and confirmation.
 *  The request is then Completed, with the files received counted. */
export function submitIntakeRequest(
  token: string, notes: string, media?: { videoIds: string[]; setIds: string[] },
): IntakeSubmission | undefined {
  const r = requests.find((x) => x.token === token);
  if (!r) return undefined;
  const pending = unsubmittedUploads(r);
  const mediaCount = (media?.videoIds.length ?? 0) + (media?.setIds.length ?? 0);
  if (pending.length === 0 && mediaCount === 0) return undefined;
  const submission: IntakeSubmission = {
    submittedAt: new Date().toISOString(),
    documentIds: pending.map((u) => u.id),
    ...(mediaCount > 0 ? { media } : {}),
    notes: notes.trim(),
    confirmationAccepted: true,
  };
  updateIntakeRequest(token, (x) => ({
    submissions: [...(x.submissions ?? []), submission],
    status: "Completed",
    docsReceived: x.uploads.length,
  }));
  return submission;
}

/** The full client-facing URL for a request, built from wherever the app is
 *  served (its origin and configured base path) — never a fixed domain. */
export function intakeRequestUrl(token: string): string {
  const base = (import.meta as any).env?.BASE_URL ?? "/";
  return new URL(`${base.replace(/\/?$/, "/")}intake-request/${token}`, window.location.origin).href;
}

/** Matches /intake-request/{token}, under any base path. */
export const INTAKE_REQUEST_PATH = /\/intake-request\/([A-Za-z0-9_-]+)\/?$/;

export const formatShortDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
