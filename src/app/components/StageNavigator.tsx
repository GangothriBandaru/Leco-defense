import { Fragment } from "react";
import { Inbox, ShieldCheck, ScanSearch, DollarSign, CheckCircle, Check } from "lucide-react";

interface StageNavigatorProps {
  currentStage: string;
  onStageClick?: (stageName: string) => void;
}

const stages = [
  { name: "Client Intake", label: "Case Discovery", icon: Inbox, description: "Documents Collected" },
  { name: "Conflict Check", label: "Conflict Check & Case Details", icon: ShieldCheck, description: "Conflicts Cleared" },
  { name: "Analysis", label: "Analysis", icon: ScanSearch, description: "Evidence Analyzed" },
  { name: "Valuation", label: "Valuation", icon: DollarSign, description: "Damages Computed" },
  { name: "Case Ready", label: "Case Ready", icon: CheckCircle, description: "Ready For Review" },
];

export function StageNavigator({ currentStage, onStageClick }: StageNavigatorProps) {
  const currentIndex = stages.findIndex((s) => s.name === currentStage);

  return (
    <div className="sticky top-[53px] z-30 bg-white border-b border-line shadow-sm">
      <div className="max-w-[1400px] mx-auto px-8 pt-0 pb-4">
        {/* A refined stepper: equal-width stage cards aligned to the content grid,
            with progress connectors stretching between them. */}
        <div className="flex items-stretch">
          {stages.map((stage, index) => {
            const isActive = stage.name === currentStage;
            const isCompleted = currentIndex > index;
            const Icon = stage.icon;
            const isLast = index === stages.length - 1;

            return (
              <Fragment key={stage.name}>
                <button
                  onClick={() => onStageClick?.(stage.name)}
                  title={`Stage ${index + 1} · ${stage.label}`}
                  aria-current={isActive ? "step" : undefined}
                  className={`group flex-1 min-w-0 text-left rounded-xl border px-4 py-3 flex items-center gap-3 min-h-[80px] transition-all duration-200 ${
                    isActive
                      ? "border-brand bg-[#F6FDFF]"
                      : "border-line bg-white hover:border-[#CBD7DE] hover:shadow-sm"
                  }`}
                >
                  {/* Icon — circular, defined outline; brand check once completed */}
                  <span
                    className={`shrink-0 flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors ${
                      isActive
                        ? "bg-tint border-brand text-deep"
                        : isCompleted
                        ? "bg-tint border-[#9BDAEC] text-deep"
                        : "bg-white border-[#D5E0E7] text-[#5B6B78] group-hover:border-[#CBD7DE]"
                    }`}
                  >
                    {isCompleted ? (
                      <Check className="w-5 h-5" strokeWidth={2.5} />
                    ) : (
                      <Icon className="w-5 h-5" strokeWidth={2} />
                    )}
                  </span>

                  {/* Text — stage label · title · supporting description */}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 mb-0.5">
                      <span
                        className={`text-xs font-semibold uppercase tracking-wide leading-none whitespace-nowrap ${
                          isActive ? "text-deep" : "text-[#8A98A3]"
                        }`}
                      >
                        Stage {index + 1}
                      </span>
                      {isCompleted && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-deep bg-tint border border-[#9BDAEC] rounded-full px-1.5 py-0.5 leading-none">
                          Completed
                        </span>
                      )}
                    </span>
                    <span
                      className={`font-display text-lg font-semibold leading-tight line-clamp-2 ${
                        isActive || isCompleted ? "text-ink" : "text-[#8A98A3]"
                      }`}
                    >
                      {stage.label}
                    </span>
                  </span>
                </button>

                {/* Connector — thin neutral line; brand fill for completed progress */}
                {!isLast && (
                  <div className="shrink-0 self-center w-6 h-[2px] rounded-full bg-line overflow-hidden">
                    <div
                      className="h-full rounded-full bg-soft transition-all duration-300"
                      style={{ width: isCompleted ? "100%" : "0%" }}
                    />
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
