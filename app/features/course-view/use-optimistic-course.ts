import { useEffect, useMemo, useRef } from "react";
import { useFetchers } from "react-router";
import { toast } from "sonner";
import type { CourseEditorEvent } from "@/services/course-editor-service";
import type { LoaderData } from "./course-view-types";
import {
  applyOptimisticEvent,
  COURSE_EDITOR_KEY_PREFIX,
} from "./optimistic-applier";

function parseCourseEditorEvent(
  fetcher: ReturnType<typeof useFetchers>[number]
): CourseEditorEvent | null {
  if (fetcher.json != null && typeof fetcher.json === "object") {
    return fetcher.json as CourseEditorEvent;
  }
  return null;
}

export function useOptimisticCourse(loaderData: LoaderData): LoaderData {
  const fetchers = useFetchers();

  return useMemo(() => {
    let result = loaderData;
    for (const fetcher of fetchers) {
      if (!fetcher.key.startsWith(COURSE_EDITOR_KEY_PREFIX)) continue;
      if (fetcher.state === "idle") continue;

      const event = parseCourseEditorEvent(fetcher);
      if (!event) continue;

      result = applyOptimisticEvent(result, event);
    }
    return result;
  }, [loaderData, fetchers]);
}

export function useCourseEditorFailureToast() {
  const fetchers = useFetchers();
  const prevStatesRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const prevStates = prevStatesRef.current;
    const nextStates = new Map<string, string>();

    for (const fetcher of fetchers) {
      if (!fetcher.key.startsWith(COURSE_EDITOR_KEY_PREFIX)) continue;

      nextStates.set(fetcher.key, fetcher.state);

      const prevState = prevStates.get(fetcher.key);
      if (
        prevState &&
        prevState !== "idle" &&
        fetcher.state === "idle" &&
        fetcher.data instanceof Response &&
        !fetcher.data.ok
      ) {
        toast.error("Action failed — your change was reverted.");
      }
    }

    prevStatesRef.current = nextStates;
  }, [fetchers]);
}
