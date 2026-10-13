import { useEffect, useRef, useState } from "react";
import {
  X, Video, Image as ImageIcon, ScanLine, Camera, Info, AlertCircle, AlertTriangle, CheckCircle,
  Plus, UploadCloud, ArrowRight, Loader2, RotateCcw,
} from "lucide-react";
import {
  addVideoEvidence, addPhotoSetEvidence, type StudyDetails, type MediaFile,
} from "./mediaEvidenceStore";
import {
  DropZone, FileRow, Banner, StudyFields, problemWith, toDrafts, keyOf, EMPTY_STUDY, storeDraft,
  type Draft, type DraftSet,
} from "./mediaUploadParts";
import { analyseVideo, analyseSet } from "./mediaAnalysis";

/** What one finished upload put on the case — reported to the page so it can
 *  say exactly what arrived. */
export type MediaUploadItem = { type: "video"; name: string } | { type: "set"; kind: "scene" | "medical"; count: number };
export interface MediaUploadResult { uploaded: MediaUploadItem[]; failed: number }

interface Job { key: string; label: string; detail: string; status: "waiting" | "uploading" | "done" | "failed"; result: MediaUploadItem; run: () => void }

// ── Upload Video & Photos ────────────────────────────────────────────────────
// The one media upload, opened from the header Upload ▾ menu and from every
// Upload Video & Photos card. Videos are independent; photos come in sets —
// scene photos, or the images of one medical study. Files are checked as they
// are added (type, tab, size) and nothing uploads while any is invalid. Each
// video and each set is then uploaded on its own, so one failure never loses
// the rest, and only the failed item needs retrying.


export function VideoPhotoUploadModal({
  open, caseId, uploadedBy, onClose, onViewMedia, onUploaded,
}: {
  open: boolean;
  caseId: string;
  uploadedBy: string;
  onClose: () => void;
  /** Opens the case's Media evidence tab. */
  onViewMedia?: () => void;
  /** Called when every upload has finished (again after a retry), with what
   *  actually succeeded and how many failed. */
  onUploaded?: (result: MediaUploadResult) => void;
}) {
  const [tab, setTab] = useState<"video" | "photos">("video");
  const [videos, setVideos] = useState<Draft[]>([]);
  const [sets, setSets] = useState<DraftSet[]>([{ key: keyOf(), kind: "scene", files: [], study: EMPTY_STUDY }]);
  const [jobs, setJobs] = useState<Job[] | null>(null);

  // Report real results once all uploads have settled — never before, and
  // once per settled state (a retry settles it again).
  const reported = useRef("");
  useEffect(() => {
    if (!jobs || !jobs.every((j) => j.status === "done" || j.status === "failed")) return;
    const signature = jobs.map((j) => `${j.key}:${j.status}`).join("|");
    if (reported.current === signature) return;
    reported.current = signature;
    onUploaded?.({
      uploaded: jobs.filter((j) => j.status === "done").map((j) => j.result),
      failed: jobs.filter((j) => j.status === "failed").length,
    });
  }, [jobs]);

  if (!open) return null;

  const reset = () => {
    setTab("video");
    setVideos([]);
    setSets([{ key: keyOf(), kind: "scene", files: [], study: EMPTY_STUDY }]);
    setJobs(null);
  };
  const close = () => { reset(); onClose(); };

  // ── Validation, from the files as they are now ──
  const videoProblems = videos.filter((v) => problemWith(v, "video")).length;
  const setProblems = sets.map((s) => s.files.filter((f) => problemWith(f, s.kind)).length);
  const photoProblems = setProblems.reduce((a, b) => a + b, 0);
  const invalid = videoProblems + photoProblems;
  const filledSets = sets.filter((s) => s.files.length > 0);
  const photoFiles = filledSets.reduce((n, s) => n + s.files.length, 0);
  const total = videos.length + photoFiles;
  const canUpload = total > 0 && invalid === 0;

  const updateSet = (key: string, patch: Partial<DraftSet>) => setSets((all) => all.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

  // ── Upload: one job per video, one per photo set ──
  const startUpload = () => {
    if (!canUpload) return;
    // Each job really stores its files and records them; its status is the
    // outcome of that work, not a timer.
    const make = (key: string, labelText: string, detail: string, result: MediaUploadItem, save: () => unknown): Job => ({
      key, label: labelText, detail, status: "waiting", result,
      run: () => {
        setJobs((js) => js!.map((j) => (j.key === key ? { ...j, status: "uploading" } : j)));
        let ok = true;
        Promise.resolve()
          .then(save)
          .catch(() => { ok = false; })
          .then(() => setJobs((js) => js!.map((j) => (j.key === key ? { ...j, status: ok ? "done" : "failed" } : j))));
      },
    });
    // Each upload stores its original files, then records them.
    const list: Job[] = [
      ...videos.map((v, i) => make(v.key, `Video ${i + 1}`, v.name, { type: "video", name: v.name }, async () => { void analyseVideo(addVideoEvidence(caseId, await storeDraft(v), uploadedBy, { source: "Attorney" })); })),
      ...filledSets.map((s, i) => make(
        s.key,
        `Set ${i + 1} · ${s.kind === "scene" ? "Scene photos" : "Medical images"}`,
        plural(s.files.length, "image"),
        { type: "set", kind: s.kind, count: s.files.length },
        async () => { void analyseSet(addPhotoSetEvidence(caseId, s.kind, await Promise.all(s.files.map(storeDraft)), uploadedBy, s.kind === "medical" ? s.study : undefined, { source: "Attorney" })); },
      )),
    ];
    setJobs(list);
    list.forEach((j, i) => window.setTimeout(j.run, i * 150));
  };

  const finished = jobs && jobs.every((j) => j.status === "done" || j.status === "failed");
  const uploadedCount = jobs?.filter((j) => j.status === "done").length ?? 0;
  const failedJobs = jobs?.filter((j) => j.status === "failed") ?? [];

  return (
    <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-sm overflow-hidden">
        {/* Header + tabs */}
        <div className="border-b border-line px-6 pt-4 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-header">Upload Video &amp; Photos</h2>
            <button onClick={close} disabled={!!jobs && !finished} className="p-2 hover:bg-tint rounded-lg transition-colors disabled:opacity-40" aria-label="Close">
              <X className="w-5 h-5 text-[#5B6B78]" strokeWidth={1.75} />
            </button>
          </div>
          {!jobs && (
            <div className="flex items-center gap-1" role="tablist">
              {([
                { id: "video", text: "Video", count: String(videos.length), problems: videoProblems },
                { id: "photos", text: "Photos", count: plural(filledSets.length, "set"), problems: photoProblems },
              ] as const).map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`relative inline-flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium transition-colors ${
                    tab === t.id ? "text-deep" : "text-[#5B6B78] hover:text-ink"
                  }`}
                >
                  {t.text}
                  <span className="text-xs text-[#5B6B78]">{t.count}</span>
                  {t.problems > 0 && <span className="w-1.5 h-1.5 rounded-full bg-[#DC2626]" title="Has files to fix" />}
                  {tab === t.id && <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-brand" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {jobs ? (
            <>
              <p className="body-text">
                {finished
                  ? failedJobs.length === 0
                    ? `Uploaded ${plural(uploadedCount, "item")}. They are under Documents → Media evidence.`
                    : `${plural(uploadedCount, "item")} uploaded. ${plural(failedJobs.length, "item")} failed — retry just those below.`
                  : "Uploading — each video and each set uploads on its own."}
              </p>
              <div className="space-y-2">
                {jobs.map((j) => (
                  <div key={j.key} className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 ${j.status === "failed" ? "border-[#FBD5D5] bg-[#FEF2F2]" : "border-line bg-white"}`}>
                    {j.label.startsWith("Video") ? <Video className="w-4 h-4 text-deep shrink-0" strokeWidth={1.75} /> : <ImageIcon className="w-4 h-4 text-deep shrink-0" strokeWidth={1.75} />}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-ink">{j.label}</div>
                      <div className="text-xs text-[#5B6B78] truncate">{j.detail}</div>
                    </div>
                    {j.status === "waiting" && <span className="text-xs text-[#5B6B78]">Waiting</span>}
                    {j.status === "uploading" && <Loader2 className="w-4 h-4 text-brand animate-spin" strokeWidth={1.75} />}
                    {j.status === "done" && <span className="pill pill-complete"><CheckCircle className="w-3.5 h-3.5" strokeWidth={1.75} /> Uploaded</span>}
                    {j.status === "failed" && (
                      <button onClick={j.run} className="inline-flex items-center gap-1 text-xs font-semibold text-[#B91C1C] hover:underline">
                        <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.75} /> Retry
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : tab === "video" ? (
            <>
              <Banner>Each video is analysed and shown on its own, so there is nothing to group. Add as many as you have; they appear as Video 1, Video 2 and so on.</Banner>
              {videos.length > 0 && (
                <div className="space-y-2">
                  {videos.map((v) => (
                    <FileRow key={v.key} file={v} icon={Video} problem={problemWith(v, "video")} onRemove={() => setVideos((vs) => vs.filter((x) => x.key !== v.key))} />
                  ))}
                </div>
              )}
              <DropZone accept=".mp4,.mov,video/mp4,video/quicktime" hint="MP4, MOV · up to 50 MB each" onFiles={(f) => setVideos((vs) => [...vs, ...toDrafts(f)])} />
            </>
          ) : (
            <>
              <Banner>A set is a group of images that belong together: the photos of one scene, or the images of one medical study. Each set is analysed together, so a photo is never credited to the wrong set.</Banner>
              {sets.map((s, i) => {
                const problems = setProblems[i];
                return (
                  <div key={s.key} className={`rounded-xl border p-4 space-y-3 ${problems > 0 ? "border-[#FBD5D5]" : "border-line"}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="card-title">Set {i + 1}</span>
                        <span className="text-xs text-[#5B6B78]">{plural(s.files.length, "image")}</span>
                        {problems > 0 && <span className="pill pill-risk">{plural(problems, "file")} to fix</span>}
                      </div>
                      {sets.length > 1 && (
                        <button onClick={() => setSets((all) => all.filter((x) => x.key !== s.key))} className="text-xs font-medium text-[#5B6B78] hover:text-ink transition-colors">
                          Remove set
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {([["scene", "Scene photos", Camera], ["medical", "Medical images", ScanLine]] as const).map(([kind, text, Icon]) => (
                        <button
                          key={kind}
                          onClick={() => updateSet(s.key, { kind })}
                          aria-pressed={s.kind === kind}
                          className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                            s.kind === kind ? "bg-tint border-brand text-deep" : "bg-white border-line text-[#5B6B78] hover:border-soft hover:text-ink"
                          }`}
                        >
                          <Icon className="w-4 h-4" strokeWidth={1.75} /> {text}
                        </button>
                      ))}
                    </div>
                    {s.files.length > 0 && (
                      <div className="space-y-2">
                        {s.files.map((f) => (
                          <FileRow
                            key={f.key}
                            file={f}
                            icon={s.kind === "medical" ? ScanLine : ImageIcon}
                            problem={problemWith(f, s.kind)}
                            onRemove={() => updateSet(s.key, { files: s.files.filter((x) => x.key !== f.key) })}
                          />
                        ))}
                      </div>
                    )}
                    <DropZone
                      accept={s.kind === "scene" ? ".jpg,.jpeg,.png,.heic,.webp" : ".dcm,.dicom,.jpg,.jpeg,.png"}
                      hint={s.kind === "scene" ? "JPEG, PNG, HEIC, WebP · up to 50 MB each" : "DICOM, JPEG, PNG · up to 50 MB each"}
                      onFiles={(f) => updateSet(s.key, { files: [...s.files, ...toDrafts(f)] })}
                    />
                    {s.kind === "medical" && (
                      <StudyFields study={s.study} onChange={(study) => updateSet(s.key, { study })} />
                    )}
                  </div>
                );
              })}
              <button
                onClick={() => setSets((all) => [...all, { key: keyOf(), kind: "scene", files: [], study: EMPTY_STUDY }])}
                className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-line px-4 py-3 text-sm font-semibold text-deep hover:bg-wash hover:border-soft transition-colors"
              >
                <Plus className="w-4 h-4" strokeWidth={1.75} /> Add another set
              </button>
            </>
          )}

          {!jobs && invalid > 0 && (
            <div className="flex items-start gap-2.5 rounded-xl border border-[#FDE6C8] bg-[#FFF7ED] px-4 py-3" role="alert">
              <AlertTriangle className="w-4 h-4 text-[#B45309] shrink-0 mt-0.5" strokeWidth={1.75} />
              <p className="text-sm text-ink">
                {[
                  videoProblems > 0 && `Video tab: remove ${plural(videoProblems, "file")} that cannot be uploaded.`,
                  photoProblems > 0 && `Photos tab: remove ${plural(photoProblems, "file")} that cannot be uploaded in the set ${photoProblems === 1 ? "it is" : "they are"} in, or change that set's kind.`,
                ].filter(Boolean).join(" ")}
              </p>
            </div>
          )}

          {!jobs && (
            <p className="text-xs text-[#5B6B78] leading-relaxed flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0 mt-px" strokeWidth={1.75} />
              Files are analysed on their own and are not read as documents. They appear under the Media evidence tab as Video 1, 2 and Scene Image 1, 2, 3 and Medical Image 1, 2, in the order they were uploaded.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-line px-6 py-4 flex items-center justify-between gap-4 shrink-0">
          {jobs ? (
            <>
              <span className="secondary-text">{uploadedCount} of {jobs.length} uploaded</span>
              <div className="flex items-center gap-3">
                {finished && onViewMedia && (
                  <button onClick={() => { close(); onViewMedia(); }} className="px-4 py-2 text-ink hover:bg-tint rounded-lg text-sm font-medium transition-colors">
                    View media evidence
                  </button>
                )}
                <button onClick={close} disabled={!finished} className="btn btn-primary gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
                  Done
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="secondary-text">
                {plural(videos.length, "video")} · {plural(filledSets.length, "set")} ({plural(photoFiles, "file")})
              </span>
              <div className="flex items-center gap-3">
                <button onClick={close} className="px-4 py-2 text-ink hover:bg-tint rounded-lg text-sm font-medium transition-colors">Cancel</button>
                <button onClick={startUpload} disabled={!canUpload} className="btn btn-primary gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
                  Upload {plural(total, "file")} <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
