import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Loader2Icon, RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Clip, FrontendInsertionPoint } from "../clip-state-reducer";

const partsToText = (parts: UIMessage["parts"]) => {
  return parts
    .map((part) => {
      if (part.type === "text") {
        return part.text;
      }
      return "";
    })
    .join("");
};

/**
 * Gets the database clip ID to truncate the transcript after.
 * Returns undefined if we should use the full transcript (insertion at end)
 * or if there's no clip before the insertion point (insertion at start).
 */
const getClipIdToTruncateAfter = (
  clips: Clip[],
  insertionPoint: FrontendInsertionPoint
): string | undefined => {
  if (insertionPoint.type === "start") {
    return undefined;
  }

  if (insertionPoint.type === "end") {
    // Full transcript - no truncation needed
    return undefined;
  }

  if (insertionPoint.type === "after-clip") {
    const clip = clips.find(
      (c) =>
        c.frontendId === insertionPoint.frontendClipId &&
        c.type === "on-database"
    );
    return clip?.type === "on-database" ? clip.databaseId : undefined;
  }

  if (insertionPoint.type === "after-clip-section") {
    // Find the last clip before this clip section
    // We need to iterate through clips and find the one just before the section
    // For now, return undefined to use full transcript (safe default)
    return undefined;
  }

  return undefined;
};

export type SuggestionsPanelProps = {
  videoId: string;
  lastTranscribedClipId: string | null;
  clips: Clip[];
  insertionPoint: FrontendInsertionPoint;
};

const SUGGESTIONS_ENABLED_KEY = "suggestions-enabled";

export function SuggestionsPanel(props: SuggestionsPanelProps) {
  const [enabled, setEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(SUGGESTIONS_ENABLED_KEY) === "true";
  });

  const { messages, sendMessage, status, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: `/videos/${props.videoId}/suggest-next-clip`,
    }),
  });

  const lastAssistantMessage = messages.find((m) => m.role === "assistant");
  const suggestionText = lastAssistantMessage
    ? partsToText(lastAssistantMessage.parts)
    : "";

  const isStreaming = status === "streaming";

  const triggerSuggestion = useCallback(() => {
    setMessages([]);
    // Get the clip ID to truncate after based on the current insertion point
    const truncateAfterClipId = getClipIdToTruncateAfter(
      props.clips,
      props.insertionPoint
    );
    sendMessage(
      { text: "Suggest what I should say next." },
      {
        body: {
          enabledFiles: [],
          truncateAfterClipId,
        },
      }
    );
  }, [sendMessage, setMessages, props.clips, props.insertionPoint]);

  // Track the previous lastTranscribedClipId to detect new transcriptions
  const lastTranscribedClipIdRef = useRef<string | null>(null);

  // Trigger suggestion when a new clip is transcribed and suggestions are enabled
  useEffect(() => {
    if (
      enabled &&
      props.lastTranscribedClipId &&
      props.lastTranscribedClipId !== lastTranscribedClipIdRef.current
    ) {
      triggerSuggestion();
    }
    lastTranscribedClipIdRef.current = props.lastTranscribedClipId;
  }, [enabled, props.lastTranscribedClipId, triggerSuggestion]);

  const handleEnabledChange = (checked: boolean) => {
    setEnabled(checked);
    localStorage.setItem(SUGGESTIONS_ENABLED_KEY, String(checked));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Checkbox
          id="suggestions-enabled"
          checked={enabled}
          onCheckedChange={handleEnabledChange}
        />
        <Label htmlFor="suggestions-enabled" className="cursor-pointer">
          Enable AI suggestions
        </Label>
      </div>

      {enabled && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-gray-300">
              Next clip suggestion
            </h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={triggerSuggestion}
              disabled={isStreaming}
              className="h-6 w-6 p-0"
            >
              <RefreshCwIcon
                className={`h-4 w-4 ${isStreaming ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
          <ScrollArea className="h-[150px] rounded border border-gray-700 bg-gray-800/50 p-3">
            {isStreaming && !suggestionText && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2Icon className="h-4 w-4 animate-spin" />
                Generating suggestion...
              </div>
            )}
            {suggestionText && (
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {suggestionText}
              </p>
            )}
            {!isStreaming && !suggestionText && (
              <p className="text-sm text-gray-500">
                Click refresh to generate a suggestion.
              </p>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
