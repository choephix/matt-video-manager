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
    case "delete-lesson":
      return applyDeleteLesson(loaderData, event);
    case "archive-section":
      return applyArchiveSection(loaderData, event);
    case "convert-to-ghost":
      return applyConvertToGhost(loaderData, event);
    default:
      return loaderData;
  }
}

function applyArchiveSection(
  loaderData: LoaderData,
  event: Extract<CourseEditorEvent, { type: "archive-section" }>
): LoaderData {
  const course = loaderData.selectedCourse;
  if (!course) return loaderData;

  const filtered = course.sections.filter(
    (section) => section.id !== event.sectionId
  );

  if (filtered.length === course.sections.length) return loaderData;

  return {
    ...loaderData,
    selectedCourse: { ...course, sections: filtered },
  };
}

function applyConvertToGhost(
  loaderData: LoaderData,
  event: Extract<CourseEditorEvent, { type: "convert-to-ghost" }>
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
        return { ...lesson, fsStatus: "ghost" as const };
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

function applyDeleteLesson(
  loaderData: LoaderData,
  event: Extract<CourseEditorEvent, { type: "delete-lesson" }>
): LoaderData {
  const course = loaderData.selectedCourse;
  if (!course) return loaderData;

  let found = false;
  const sections = course.sections.map((section) => {
    if (found) return section;
    const filtered = section.lessons.filter((lesson) => {
      if (lesson.id === event.lessonId) {
        found = true;
        return false;
      }
      return true;
    });
    return filtered.length !== section.lessons.length
      ? { ...section, lessons: filtered }
      : section;
  });

  if (!found) return loaderData;

  return {
    ...loaderData,
    selectedCourse: { ...course, sections },
  };
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
