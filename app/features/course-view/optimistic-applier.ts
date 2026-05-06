import type { CourseEditorEvent } from "@/services/course-editor-service";
import type { LoaderData } from "./course-view-types";

/**
 * Fetcher key convention: `course-editor:<event-type>:<entity-id>`.
 *
 * Two mutations on the same entity + event type share a key (only the
 * latest intent is visible); different entities get separate fetcher slots.
 */
export function courseEditorFetcherKey(
  eventType: string,
  entityId: string
): string {
  return `course-editor:${eventType}:${entityId}`;
}

export const COURSE_EDITOR_KEY_PREFIX = "course-editor:";

export function courseEditorFetcherKeyForEvent(
  event: CourseEditorEvent
): string {
  const id = entityIdForEvent(event);
  return courseEditorFetcherKey(event.type, id);
}

function entityIdForEvent(event: CourseEditorEvent): string {
  switch (event.type) {
    case "create-section":
      return event.repoVersionId;
    case "update-section-name":
    case "update-section-description":
    case "archive-section":
      return event.sectionId;
    case "reorder-sections":
      return "batch";
    case "reorder-lessons":
      return event.sectionId;
    case "add-ghost-lesson":
    case "create-real-lesson":
      return event.sectionId;
    case "update-lesson-name":
    case "update-lesson-title":
    case "update-lesson-description":
    case "update-lesson-icon":
    case "update-lesson-priority":
    case "update-lesson-dependencies":
    case "delete-lesson":
    case "move-lesson-to-section":
    case "convert-to-ghost":
    case "create-on-disk":
    case "set-lesson-authoring-status":
      return event.lessonId;
  }
}

export function applyOptimisticEvent(
  loaderData: LoaderData,
  event: CourseEditorEvent
): LoaderData {
  switch (event.type) {
    case "update-lesson-icon":
      return applyUpdateLessonIcon(loaderData, event);
    default:
      return loaderData;
  }
}

function applyUpdateLessonIcon(
  loaderData: LoaderData,
  event: Extract<CourseEditorEvent, { type: "update-lesson-icon" }>
): LoaderData {
  const course = loaderData.selectedCourse;
  if (!course) return loaderData;

  let found = false;
  const sections = course.sections.map((section) => {
    if (found) return section;
    let sectionChanged = false;
    const lessons = section.lessons.map((lesson) => {
      if (lesson.id === event.lessonId) {
        found = true;
        sectionChanged = true;
        return { ...lesson, icon: event.icon };
      }
      return lesson;
    });
    return sectionChanged ? { ...section, lessons } : section;
  });

  if (!found) return loaderData;

  return {
    ...loaderData,
    selectedCourse: { ...course, sections },
  };
}
