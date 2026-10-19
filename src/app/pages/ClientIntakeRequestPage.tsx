import { useEffect, useRef, useState } from "react";
import { FileUp, UploadCloud, CheckCircle, AlertCircle, X, PenLine, Mic, MicOff, ShieldCheck, Lock, Send } from "lucide-react";
import { FileTypeIcon } from "../components/fileType";
import { putMediaFile } from "../intake/mediaFileStore";
import {
  useIntakeRequestByToken, markIntakeRequestOpened, addIntakeUpload, submitIntakeRequest,
  unsubmittedUploads, formatShortDate, type IntakeSubmission,
} from "../intake/intakeRequestStore";
import { mediaRequest, NO_MEDIA } from "../intake/intakeMessage";
import {
  ClientMediaSections, emptyClientMedia, clientMediaStats, uploadClientMedia, type ClientMediaDraft,
} from "../intake/ClientMediaSections";

// Dictation for the notes field, where the browser provides speech recognition
// (Chrome, Edge). Elsewhere the microphone is simply not shown.
const SpeechRecognitionImpl: any =
  typeof window !== "undefined" ? (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition : undefined;

// ── Client-side intake request ───────────────────────────────────────────────
// The page a client reaches from their request link, /intake-request/{token}.
// It stands apart from the attorney dashboard (no sidebar, no navigation) and
// renders only the request the token resolves to: its case, client, sender,
// requested documents and instructions. Uploads are recorded against that
// request, and so against its case.

const ACCEPTED = ["pdf", "doc", "docx", "jpg", "jpeg", "png", "heic"];
const ACCEPT_ATTR = ".pdf,.doc,.docx,.jpg,.jpeg,.png,.heic";
const MAX_BYTES = 25 * 1024 * 1024;

interface PendingFile {
  key: string;
  name: string;
  size: number;
  status: "uploading" | "rejected";
  error?: string;
  progress: number;
}

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const extensionOf = (name: string) => (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? "").toLowerCase();

export function ClientIntakeRequestPage({ token }: { token: string }) {
  const request = useIntakeRequestByToken(token);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [notes, setNotes] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitted, setSubmitted] = useState<IntakeSubmission | null>(null);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  // Video & photos, only for the kinds this request asked for.
  const [mediaDraft, setMediaDraft] = useState<ClientMediaDraft>(emptyClientMedia);
  const [mediaFailed, setMediaFailed] = useState(false);
  const [submittedFiles, setSubmittedFiles] = useState(0);
  const [sending, setSending] = useState(false);

  const toggleDictation = () => {
    if (!SpeechRecognitionImpl) return;
    if (listening) { recognitionRef.current?.stop(); return; }
    const rec = new SpeechRecognitionImpl();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = (e: any) => {
      const text = Array.from(e.results as ArrayLike<any>)
        .slice(e.resultIndex)
        .map((r: any) => r[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (text) setNotes((n) => (n ? `${n.replace(/\s+$/, "")} ${text}` : text));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  };
  useEffect(() => () => recognitionRef.current?.stop(), []);

  useEffect(() => {
    document.title = request ? `Document Upload — ${request.caseId}` : "Document Upload";
    if (request) markIntakeRequestOpened(token);
  }, [token, !!request]);

  const handleFiles = (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      const key = `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const ext = extensionOf(file.name);
      let error: string | undefined;
      if (!ACCEPTED.includes(ext)) error = "Unsupported file type. Use PDF, DOC, DOCX, JPG, PNG or HEIC.";
      else if (file.size > MAX_BYTES) error = `This file is ${formatSize(file.size)} — the limit is 25 MB.`;

      if (error) {
        setPending((p) => [...p, { key, name: file.name, size: file.size, status: "rejected", error, progress: 0 }]);
        continue;
      }
      setPending((p) => [...p, { key, name: file.name, size: file.size, status: "uploading", progress: 0 }]);
      // The original is stored, then the file is recorded against this request
      // — only once it is actually saved.
      putMediaFile(file)
        .then((storageKey) => {
          addIntakeUpload(token, {
            id: key,
            name: file.name,
            size: file.size,
            type: file.type || ext,
            uploadedAt: new Date().toISOString(),
            storageKey,
          });
          setPending((p) => p.filter((f) => f.key !== key));
        })
        .catch(() => {
          setPending((p) => p.map((f) => (f.key === key ? { ...f, status: "rejected", error: "This file could not be saved. Please try again." } : f)));
        });
    }
  };

  if (!request) {
    return (
      <div className="min-h-screen bg-wash flex items-center justify-center p-6">
        <div className="lg-card p-8 max-w-md w-full text-center">
          <AlertCircle className="w-8 h-8 text-deep mx-auto mb-3" strokeWidth={1.75} />
          <h1 className="section-header mb-1">This request link isn't valid</h1>
          <p className="secondary-text">The link may be incomplete or the request may have been withdrawn. Please contact the office that sent it.</p>
        </div>
      </div>
    );
  }

  const uploaded = request.uploads;
  const submittedIds = new Set((request.submissions ?? []).flatMap((s) => s.documentIds));
  // Files ready to submit: uploaded, and not part of an earlier submission.
  const ready = unsubmittedUploads(request);
  const uploading = pending.some((p) => p.status === "uploading");
  const requestedMedia = request.requestedMedia ?? NO_MEDIA;
  const mediaStats = clientMediaStats(mediaDraft, requestedMedia);
  const fileCount = ready.length + mediaStats.files;
  const canSubmit = fileCount > 0 && confirmed && !uploading && mediaStats.invalid === 0;
  const media = mediaRequest(requestedMedia);
  const submit = async () => {
    if (!canSubmit || sending) return;
    setSending(true);
    // Each video and each set uploads on its own; any that fail stay for retry.
    const sent = mediaStats.files > 0
      ? await uploadClientMedia(mediaDraft, requestedMedia, request.caseId, request.id, request.plaintiff)
      : { videoIds: [], setIds: [], remaining: mediaDraft };
    setSending(false);
    const notSent = clientMediaStats(sent.remaining, requestedMedia).files;
    setSubmittedFiles(fileCount - notSent);
    setMediaDraft(sent.remaining);
    setMediaFailed(clientMediaStats(sent.remaining, requestedMedia).files > 0);
    const s = submitIntakeRequest(token, notes, { videoIds: sent.videoIds, setIds: sent.setIds });
    if (s) {
      setSubmitted(s);
      setNotes("");
      setConfirmed(false);
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    }
  };

  return (
    <div className="min-h-screen bg-wash">
      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-10 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-tint border border-[#D6F2F7] flex items-center justify-center shrink-0">
            <FileUp className="w-6 h-6 text-deep" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <h1 className="page-title">Document Upload</h1>
            <p className="secondary-text mt-0.5">Case: {request.caseId} - {request.plaintiff}</p>
          </div>
        </div>

        {/* Message from the firm */}
        <div className="lg-card p-6">
          <div className="text-sm font-semibold text-ink mb-3">Message from {request.sender.name}:</div>
          <div className="lg-zone lg-zone-grey p-5 space-y-3 body-text leading-relaxed">
            <p>Hello {request.plaintiff},</p>
            <p>To begin evaluating your case, we need you to provide the following documents.</p>
            <div>
              <p className="font-semibold text-ink">Requested Documents:</p>
              <ul className="mt-1 space-y-0.5">
                {request.requestedDocs.map((d) => <li key={d}>• {d}</li>)}
              </ul>
            </div>
            {media.sentence && <p>{media.sentence}</p>}
            {media.list && (
              <div>
                <p className="font-semibold text-ink">Please also upload:</p>
                <ul className="mt-1 space-y-0.5">
                  {media.list.map((t) => <li key={t}>• {t}</li>)}
                </ul>
              </div>
            )}
            {request.instructions && <p className="whitespace-pre-line">{request.instructions}</p>}
            <p>If you have any questions or are unable to obtain a document, please contact our office.</p>
            <p>
              Thank you,<br />
              {request.sender.name}
              {request.sender.firm && <><br />{request.sender.firm}</>}
            </p>
          </div>
        </div>

        {/* Upload documents */}
        <div className="lg-card p-6">
          <h2 className="section-header">Upload Documents</h2>
          <p className="secondary-text mt-1 mb-4">Upload the requested documents for your case</p>

          <label
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
            className={`flex flex-col items-center justify-center text-center rounded-xl border-2 border-dashed px-6 py-12 cursor-pointer transition-colors ${
              dragging ? "border-brand bg-tint" : "border-line bg-offwhite hover:border-soft hover:bg-wash"
            }`}
          >
            <div className="w-12 h-12 rounded-full bg-white border border-line flex items-center justify-center mb-3">
              <UploadCloud className="w-6 h-6 text-deep" strokeWidth={1.75} />
            </div>
            <span className="text-sm font-semibold text-ink">Click to upload or drag and drop</span>
            <span className="secondary-text mt-1">PDF, DOC, DOCX, JPG, PNG, HEIC (max 25MB each)</span>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT_ATTR}
              className="hidden"
              onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; }}
            />
          </label>

          {(pending.length > 0 || uploaded.length > 0) && (
            <div className="mt-5 space-y-2">
              <div className="eyebrow">Your files</div>
              {pending.map((f) => (
                <div key={f.key} className={`rounded-xl border px-4 py-3 ${f.status === "rejected" ? "border-[#FBD5D5] bg-[#FEF2F2]" : "border-line bg-white"}`}>
                  <div className="flex items-center gap-3">
                    <FileTypeIcon name={f.name} className="w-4 h-4 text-deep shrink-0" />
                    <span className="text-sm font-medium text-ink truncate flex-1">{f.name}</span>
                    <span className="text-xs text-[#5B6B78] shrink-0">{formatSize(f.size)}</span>
                    {f.status === "rejected" && (
                      <button onClick={() => setPending((p) => p.filter((x) => x.key !== f.key))} aria-label="Dismiss" className="p-1 rounded hover:bg-white transition-colors">
                        <X className="w-3.5 h-3.5 text-[#5B6B78]" strokeWidth={1.75} />
                      </button>
                    )}
                  </div>
                  {f.status === "uploading" ? (
                    <div className="mt-2 flex items-center gap-3">
                      <div className="lg-progress flex-1"><span className="animate-pulse" style={{ width: "100%" }} /></div>
                      <span className="text-xs text-[#5B6B78] tabular-nums w-16 text-right">Uploading…</span>
                    </div>
                  ) : (
                    <p className="text-xs font-medium text-[#B91C1C] mt-1.5 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} /> {f.error}
                    </p>
                  )}
                </div>
              ))}
              {[...uploaded].reverse().map((u) => (
                <div key={u.id} className="rounded-xl border border-line bg-white px-4 py-3 flex items-center gap-3">
                  <FileTypeIcon name={u.name} className="w-4 h-4 text-deep shrink-0" />
                  <span className="text-sm font-medium text-ink truncate flex-1">{u.name}</span>
                  <span className="text-xs text-[#5B6B78] shrink-0">{formatSize(u.size)}</span>
                  {submittedIds.has(u.id)
                    ? <span className="pill pill-complete shrink-0"><CheckCircle className="w-3.5 h-3.5" strokeWidth={1.75} /> Submitted</span>
                    : <span className="pill pill-neutral shrink-0"><CheckCircle className="w-3.5 h-3.5" strokeWidth={1.75} /> Uploaded</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Video & photos — only the kinds the attorney asked for */}
        <ClientMediaSections requested={requestedMedia} value={mediaDraft} onChange={setMediaDraft} />

        {/* Additional notes — optional */}
        <div className="lg-card p-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-tint flex items-center justify-center shrink-0">
                <PenLine className="w-4 h-4 text-deep" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <h2 className="section-header">Additional Notes</h2>
                <p className="secondary-text mt-0.5">Optional: Add any additional information about the documents</p>
              </div>
            </div>
            {SpeechRecognitionImpl && (
              <button
                type="button"
                onClick={toggleDictation}
                aria-pressed={listening}
                title={listening ? "Stop dictation" : "Dictate notes"}
                className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                  listening ? "bg-tint border-brand text-deep" : "bg-white border-line text-[#5B6B78] hover:bg-wash hover:text-ink"
                }`}
              >
                {listening ? <MicOff className="w-4 h-4" strokeWidth={1.75} /> : <Mic className="w-4 h-4" strokeWidth={1.75} />}
              </button>
            )}
          </div>
          <textarea
            rows={5}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Enter any additional notes..."
            className="w-full bg-white border border-line rounded-lg px-4 py-3 text-sm text-ink placeholder:text-[#8A98A3] focus:outline-none focus:border-brand resize-y transition-colors"
          />
          {listening && <p className="text-xs text-deep mt-1.5">Listening… speak and your words will be added to the notes.</p>}
        </div>

        {/* Confirmation */}
        <div className="lg-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-tint flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4 text-deep" strokeWidth={1.75} />
            </div>
            <h2 className="section-header">Confirmation</h2>
          </div>
          <label className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-colors ${confirmed ? "border-brand bg-tint" : "border-line bg-white hover:border-soft"}`}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-[#3FB5D7] cursor-pointer"
            />
            <span className="body-text leading-relaxed">I confirm that the documents I am uploading are accurate and relevant to my case.</span>
          </label>
        </div>

        {/* Submit */}
        <div className="space-y-3">
          {submitted && (
            <div className="rounded-xl border border-[#D1FADF] bg-[#ECFDF3] p-4" role="status">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-[#15803D]">
                <CheckCircle className="w-4 h-4" strokeWidth={2} /> Documents submitted
              </div>
              <p className="text-sm text-ink mt-1">
                {submittedFiles} {submittedFiles === 1 ? "file was" : "files were"} sent to {request.sender.firm || request.sender.name} on {formatShortDate(submitted.submittedAt)}
                {submitted.notes ? ", with your notes." : "."}
              </p>
              <p className="text-xs text-[#5B6B78] mt-1">You can upload more documents with this link at any time.</p>
            </div>
          )}
          <button
            onClick={submit}
            disabled={!canSubmit || sending}
            className="btn btn-primary w-full gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" strokeWidth={1.75} />
            Submit Documents ({fileCount} {fileCount === 1 ? "file" : "files"})
          </button>
          {!canSubmit && (fileCount === 0 || !confirmed || mediaStats.invalid > 0) && (
            <p className="text-xs text-[#5B6B78] text-center">
              {mediaStats.invalid > 0
                ? `Remove ${mediaStats.invalid} ${mediaStats.invalid === 1 ? "file" : "files"} that cannot be uploaded to submit.`
                : fileCount === 0 && !confirmed
                  ? "Upload at least one document and confirm above to submit."
                  : fileCount === 0
                    ? "Upload at least one document to submit."
                    : "Check the confirmation above to submit."}
            </p>
          )}
          {mediaFailed && (
            <p className="text-xs text-[#B91C1C] text-center">Some video or photos could not be sent. They are still above — submit again to retry them.</p>
          )}
          <p className="secondary-text text-center flex items-center justify-center gap-1.5">
            <Lock className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
            Your documents are encrypted and securely transmitted to your attorney.
          </p>
        </div>
      </div>
    </div>
  );
}
