import { useEffect, useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import { intakeRequestUrl } from "./intakeRequestStore";

// The request's client link on the sent request card: the path shown compact,
// the complete URL copied.

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API blocked — fall back to a selection copy.
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    el.remove();
    return ok;
  }
}

export function RequestLinkRow({ token, uploads, className = "px-5 py-3" }: { token: string; uploads: number; /** Padding, so the row can sit inside a smaller panel. */ className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copied = state === "copied";
  useEffect(() => {
    if (state === "idle") return;
    const t = window.setTimeout(() => setState("idle"), state === "copied" ? 2000 : 4000);
    return () => window.clearTimeout(t);
  }, [state]);

  const url = intakeRequestUrl(token);
  const path = `/intake-request/${token}`;

  return (
    <div className={`${className} flex items-center gap-3 flex-wrap`}>
      <div className="min-w-0 flex-1">
        <div className="eyebrow mb-1 flex items-center gap-1.5">
          <Link2 className="w-3.5 h-3.5 text-deep" strokeWidth={1.75} /> Request Link
        </div>
        <a href={url} target="_blank" rel="noreferrer" title={url} className="mono-ref text-deep hover:underline truncate block max-w-full">
          {path}
        </a>
      </div>
      {uploads > 0 && (
        <span className="pill pill-complete shrink-0">{uploads} {uploads === 1 ? "file" : "files"} received</span>
      )}
      <button
        onClick={async (e) => { e.stopPropagation(); setState((await copyText(url)) ? "copied" : "failed"); }}
        title={state === "failed" ? "Copying was blocked — select the link and copy it instead" : url}
        className={`flex items-center gap-1.5 px-3.5 py-1.5 border rounded-lg text-sm font-medium transition-all shrink-0 ${
          copied ? "bg-[#ECFDF3] border-[#D1FADF] text-[#15803D]"
            : state === "failed" ? "bg-[#FEF2F2] border-[#FBD5D5] text-[#B91C1C]"
            : "bg-white border-line text-ink hover:bg-wash"
        }`}
      >
        {copied ? <Check className="w-3.5 h-3.5" strokeWidth={2} /> : <Copy className="w-3.5 h-3.5" strokeWidth={1.75} />}
        {copied ? "Copied" : state === "failed" ? "Copy failed" : "Copy link"}
      </button>
    </div>
  );
}
