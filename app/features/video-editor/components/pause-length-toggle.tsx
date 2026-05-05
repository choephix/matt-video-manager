import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PauseLength } from "@/silence-detection-constants";
import { useContextSelector } from "use-context-selector";
import { VideoEditorContext } from "../video-editor-context";

const OPTIONS: { value: PauseLength; label: string }[] = [
  { value: "short", label: "Short" },
  { value: "long", label: "Long" },
];

export const PauseLengthToggle = () => {
  const pauseLength = useContextSelector(
    VideoEditorContext,
    (ctx) => ctx.pauseLength
  );
  const setPauseLength = useContextSelector(
    VideoEditorContext,
    (ctx) => ctx.setPauseLength
  );
  const isRecordingActive = useContextSelector(
    VideoEditorContext,
    (ctx) => ctx.isRecordingActive
  );

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Pause length:</span>
      <div className="inline-flex rounded-md border bg-card p-0.5">
        {OPTIONS.map((option) => {
          const isActive = pauseLength === option.value;
          return (
            <Button
              key={option.value}
              type="button"
              variant={isActive ? "secondary" : "ghost"}
              size="sm"
              disabled={isRecordingActive}
              onClick={() => setPauseLength(option.value)}
              className={cn(
                "h-7 px-3 text-xs",
                !isActive && "text-muted-foreground"
              )}
            >
              {option.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
};
