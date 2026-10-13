import { Video, Camera, ScanLine, Image as ImageIcon, Plus } from "lucide-react";
import {
  DropZone, FileRow, Banner, StudyFields, problemWith, toDrafts, keyOf, EMPTY_STUDY, storeDraft,
  type Draft, type DraftSet, type Places,
} from "./mediaUploadParts";
import { addVideoEvidence, addPhotoSetEvidence, type SetKind } from "./mediaEvidenceStore";
import { analyseVideo, analyseSet } from "./mediaAnalysis";
import { MEDIA_OPTIONS, type RequestedMedia } from "./intakeMessage";

// ── Client-side video & photos ───────────────────────────────────────────────
// The upload areas a request link shows for the media the attorney asked for —
// each kind its own section, so an incident video, a scene photo and a medical
// image stay distinct. Same files rules as the attorney's upload; the client
// sends them with Submit, one upload per video and per set.

export interface ClientMediaDraft {
  videos: Draft[];
  scene: DraftSet[];
  medical: DraftSet[];
}

const newSet = (kind: SetKind): DraftSet => ({ key: keyOf(), kind, files: [], study: EMPTY_STUDY });
export const emptyClientMedia = (): ClientMediaDraft => ({ videos: [], scene: [newSet("scene")], medical: [newSet("medical")] });

/** Where a misplaced file belongs, naming only the sections this request has. */
function placesFor(requested: RequestedMedia): Places {
  const images = [requested.scenePhotos && "Photos of the scene", requested.medicalImages && "Medical images"].filter(Boolean) as string[];
  return {
    video: requested.videos ? "Videos of the incident" : undefined,
    image: images.length ? images.join(" or ") : undefined,
  };
}

export function clientMediaStats(d: ClientMediaDraft, requested: RequestedMedia) {
  const places = placesFor(requested);
  const videos = requested.videos ? d.videos : [];
  const sets = [...(requested.scenePhotos ? d.scene : []), ...(requested.medicalImages ? d.medical : [])];
  const invalid =
    videos.filter((v) => problemWith(v, "video", places)).length +
    sets.reduce((n, s) => n + s.files.filter((f) => problemWith(f, s.kind, places)).length, 0);
  const files = videos.length + sets.reduce((n, s) => n + s.files.length, 0);
  return { files, invalid };
}

/** Uploads every video and every non-empty set on its own. Items that fail stay
 *  in the draft for another try; the rest are recorded against the request. */
export async function uploadClientMedia(
  d: ClientMediaDraft, requested: RequestedMedia, caseId: string, requestId: string, uploadedBy: string,
): Promise<{ videoIds: string[]; setIds: string[]; remaining: ClientMediaDraft }> {
  const origin = { source: "Client" as const, requestId };
  const videoIds: string[] = [];
  const setIds: string[] = [];
  const keepVideos: Draft[] = [];
  for (const v of requested.videos ? d.videos : []) {
    try {
      const video = addVideoEvidence(caseId, await storeDraft(v), uploadedBy, origin);
      videoIds.push(video.id);
      void analyseVideo(video);
    }
    catch { keepVideos.push(v); }
  }
  const sendSets = async (sets: DraftSet[], on: boolean) => {
    const keep: DraftSet[] = [];
    for (const s of on ? sets : []) {
      if (s.files.length === 0) continue;
      try {
        const set = addPhotoSetEvidence(caseId, s.kind, await Promise.all(s.files.map(storeDraft)), uploadedBy, s.kind === "medical" ? s.study : undefined, origin);
        setIds.push(set.id);
        void analyseSet(set);
      } catch { keep.push(s); }
    }
    return keep;
  };
  const keepScene = await sendSets(d.scene, requested.scenePhotos);
  const keepMedical = await sendSets(d.medical, requested.medicalImages);
  return {
    videoIds,
    setIds,
    remaining: {
      videos: keepVideos,
      scene: keepScene.length ? keepScene : [newSet("scene")],
      medical: keepMedical.length ? keepMedical : [newSet("medical")],
    },
  };
}

const option = (key: (typeof MEDIA_OPTIONS)[number]["key"]) => MEDIA_OPTIONS.find((o) => o.key === key)!;

function SectionHeader({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="w-9 h-9 rounded-lg bg-tint flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-deep" strokeWidth={1.75} />
      </div>
      <div className="min-w-0">
        <h2 className="section-header">{title}</h2>
        <p className="secondary-text mt-0.5">{description}</p>
      </div>
    </div>
  );
}

function SetsEditor({
  kind, sets, places, onChange,
}: { kind: SetKind; sets: DraftSet[]; places: Places; onChange: (sets: DraftSet[]) => void }) {
  const update = (key: string, patch: Partial<DraftSet>) => onChange(sets.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  return (
    <div className="space-y-3">
      {sets.map((s, i) => {
        const problems = s.files.filter((f) => problemWith(f, kind, places)).length;
        return (
          <div key={s.key} className={`rounded-xl border p-4 space-y-3 ${problems > 0 ? "border-[#FBD5D5]" : "border-line"}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="card-title">Set {i + 1}</span>
                <span className="text-xs text-[#5B6B78]">{s.files.length} {s.files.length === 1 ? "image" : "images"}</span>
                {problems > 0 && <span className="pill pill-risk">{problems} {problems === 1 ? "file" : "files"} to fix</span>}
              </div>
              {sets.length > 1 && (
                <button onClick={() => onChange(sets.filter((x) => x.key !== s.key))} className="text-xs font-medium text-[#5B6B78] hover:text-ink transition-colors">
                  Remove set
                </button>
              )}
            </div>
            {s.files.length > 0 && (
              <div className="space-y-2">
                {s.files.map((f) => (
                  <FileRow
                    key={f.key}
                    file={f}
                    icon={kind === "medical" ? ScanLine : ImageIcon}
                    problem={problemWith(f, kind, places)}
                    onRemove={() => update(s.key, { files: s.files.filter((x) => x.key !== f.key) })}
                  />
                ))}
              </div>
            )}
            <DropZone
              accept={kind === "scene" ? ".jpg,.jpeg,.png,.heic,.webp" : ".dcm,.dicom,.jpg,.jpeg,.png"}
              hint={kind === "scene" ? "JPEG, PNG, HEIC, WebP · up to 50 MB each" : "DICOM, JPEG, PNG · up to 50 MB each"}
              onFiles={(f) => update(s.key, { files: [...s.files, ...toDrafts(f)] })}
            />
            {kind === "medical" && <StudyFields study={s.study} onChange={(study) => update(s.key, { study })} />}
          </div>
        );
      })}
      <button
        onClick={() => onChange([...sets, newSet(kind)])}
        className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-line px-4 py-3 text-sm font-semibold text-deep hover:bg-wash hover:border-soft transition-colors"
      >
        <Plus className="w-4 h-4" strokeWidth={1.75} /> Add another set
      </button>
    </div>
  );
}

export function ClientMediaSections({
  requested, value, onChange,
}: { requested: RequestedMedia; value: ClientMediaDraft; onChange: (d: ClientMediaDraft) => void }) {
  const places = placesFor(requested);
  return (
    <>
      {requested.videos && (
        <div className="lg-card p-6 space-y-4">
          <SectionHeader icon={Video} title={option("videos").title} description={option("videos").description} />
          <Banner>Each video is looked at on its own, so there is nothing to group. Add as many as you have.</Banner>
          {value.videos.length > 0 && (
            <div className="space-y-2">
              {value.videos.map((v) => (
                <FileRow key={v.key} file={v} icon={Video} problem={problemWith(v, "video", places)} onRemove={() => onChange({ ...value, videos: value.videos.filter((x) => x.key !== v.key) })} />
              ))}
            </div>
          )}
          <DropZone accept=".mp4,.mov,video/mp4,video/quicktime" hint="MP4, MOV · up to 50 MB each" onFiles={(f) => onChange({ ...value, videos: [...value.videos, ...toDrafts(f)] })} />
        </div>
      )}
      {requested.scenePhotos && (
        <div className="lg-card p-6 space-y-4">
          <SectionHeader icon={Camera} title={option("scenePhotos").title} description={option("scenePhotos").description} />
          <Banner>Group the photos of one scene into a set. If you have photos of more than one place or moment, add another set.</Banner>
          <SetsEditor kind="scene" sets={value.scene} places={places} onChange={(scene) => onChange({ ...value, scene })} />
        </div>
      )}
      {requested.medicalImages && (
        <div className="lg-card p-6 space-y-4">
          <SectionHeader icon={ScanLine} title={option("medicalImages").title} description={option("medicalImages").description} />
          <Banner>Each set is the images of one scan or study — for example, one MRI. If you have more than one scan, add another set.</Banner>
          <SetsEditor kind="medical" sets={value.medical} places={places} onChange={(medical) => onChange({ ...value, medical })} />
        </div>
      )}
    </>
  );
}
