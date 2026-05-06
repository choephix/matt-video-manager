import type { CourseEditorEvent } from "@/services/course-editor-service";
import type { LoaderData, Lesson, Section } from "./course-view-types";

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
      return withPatchedLesson(loaderData, event.lessonId, () => ({
        icon: event.icon,
      }));
    case "update-lesson-title":
      return withPatchedLesson(loaderData, event.lessonId, () => ({
        title: event.title,
      }));
    case "update-lesson-name":
      return withPatchedLesson(loaderData, event.lessonId, (lesson) => ({
        path: replaceSlug(lesson.path, event.newSlug),
      }));
    case "update-lesson-description":
      return withPatchedLesson(loaderData, event.lessonId, () => ({
        description: event.description,
      }));
    case "update-lesson-priority":
      return withPatchedLesson(loaderData, event.lessonId, () => ({
        priority: event.priority,
      }));
    case "update-lesson-dependencies":
      return withPatchedLesson(loaderData, event.lessonId, () => ({
        dependencies: event.dependencies,
      }));
    case "set-lesson-authoring-status":
      return withPatchedLesson(loaderData, event.lessonId, () => ({
        authoringStatus: event.status,
      }));
    case "update-section-name":
      return withPatchedSection(loaderData, event.sectionId, (section) => ({
        path: replaceSlug(section.path, event.title),
      }));
    case "update-section-description":
      return withPatchedSection(loaderData, event.sectionId, () => ({
        description: event.description,
      }));
    case "delete-lesson":
      return applyDeleteLesson(loaderData, event);
    case "archive-section":
      return applyArchiveSection(loaderData, event);
    case "convert-to-ghost":
      return applyConvertToGhost(loaderData, event);
    case "reorder-sections":
      return applyReorderSections(loaderData, event);
    case "reorder-lessons":
      return applyReorderLessons(loaderData, event);
    case "move-lesson-to-section":
      return applyMoveLessonToSection(loaderData, event);
    default:
      return loaderData;
  }
}

function replaceSlug(path: string, newSlug: string): string {
  const match = path.match(/^(\d[\d.]*-)/);
  return match ? match[1] + newSlug : newSlug;
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

function applyReorderSections(
  loaderData: LoaderData,
  event: Extract<CourseEditorEvent, { type: "reorder-sections" }>
): LoaderData {
  const course = loaderData.selectedCourse;
  if (!course) return loaderData;

  const { sectionIds } = event;
  if (sectionIds.length === 0) return loaderData;

  const sectionMap = new Map(course.sections.map((s) => [s.id, s]));
  const ordered: typeof course.sections = [];

  for (const id of sectionIds) {
    const section = sectionMap.get(id);
    if (section) {
      ordered.push(section);
      sectionMap.delete(id);
    }
  }

  for (const section of sectionMap.values()) {
    ordered.push(section);
  }

  if (ordered.every((s, i) => s === course.sections[i])) return loaderData;

  return {
    ...loaderData,
    selectedCourse: { ...course, sections: ordered },
  };
}

function applyReorderLessons(
  loaderData: LoaderData,
  event: Extract<CourseEditorEvent, { type: "reorder-lessons" }>
): LoaderData {
  const course = loaderData.selectedCourse;
  if (!course) return loaderData;

  const sectionIndex = course.sections.findIndex(
    (s) => s.id === event.sectionId
  );
  if (sectionIndex === -1) return loaderData;

  const section = course.sections[sectionIndex]!;
  const { lessonIds } = event;

  const lessonMap = new Map(section.lessons.map((l) => [l.id, l]));
  const ordered: typeof section.lessons = [];

  for (const id of lessonIds) {
    const lesson = lessonMap.get(id);
    if (lesson) {
      ordered.push(lesson);
      lessonMap.delete(id);
    }
  }

  for (const lesson of lessonMap.values()) {
    ordered.push(lesson);
  }

  if (ordered.every((l, i) => l === section.lessons[i])) return loaderData;

  const sections = course.sections.map((s, i) =>
    i === sectionIndex ? { ...s, lessons: ordered } : s
  );

  return {
    ...loaderData,
    selectedCourse: { ...course, sections },
  };
}

function applyMoveLessonToSection(
  loaderData: LoaderData,
  event: Extract<CourseEditorEvent, { type: "move-lesson-to-section" }>
): LoaderData {
  const course = loaderData.selectedCourse;
  if (!course) return loaderData;

  const { lessonId, targetSectionId } = event;

  let movedLesson: (typeof course.sections)[number]["lessons"][number] | null =
    null;
  let sourceIndex = -1;

  for (let i = 0; i < course.sections.length; i++) {
    const found = course.sections[i]!.lessons.find((l) => l.id === lessonId);
    if (found) {
      movedLesson = found;
      sourceIndex = i;
      break;
    }
  }

  if (!movedLesson || sourceIndex === -1) return loaderData;

  const targetIndex = course.sections.findIndex(
    (s) => s.id === targetSectionId
  );
  if (targetIndex === -1) return loaderData;
  if (sourceIndex === targetIndex) return loaderData;

  const sections = course.sections.map((section, i) => {
    if (i === sourceIndex) {
      return {
        ...section,
        lessons: section.lessons.filter((l) => l.id !== lessonId),
      };
    }
    if (i === targetIndex) {
      return { ...section, lessons: [...section.lessons, movedLesson] };
    }
    return section;
  });

  return {
    ...loaderData,
    selectedCourse: { ...course, sections },
  };
}

function withPatchedLesson(
  loaderData: LoaderData,
  lessonId: string,
  patchFn: (lesson: Lesson) => Partial<Lesson>
): LoaderData {
  const course = loaderData.selectedCourse;
  if (!course) return loaderData;

  let found = false;
  const sections = course.sections.map((section) => {
    if (found) return section;
    let sectionChanged = false;
    const lessons = section.lessons.map((lesson) => {
      if (lesson.id === lessonId) {
        found = true;
        sectionChanged = true;
        return { ...lesson, ...patchFn(lesson) };
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

function withPatchedSection(
  loaderData: LoaderData,
  sectionId: string,
  patchFn: (section: Section) => Partial<Section>
): LoaderData {
  const course = loaderData.selectedCourse;
  if (!course) return loaderData;

  let found = false;
  const sections = course.sections.map((section) => {
    if (section.id === sectionId) {
      found = true;
      return { ...section, ...patchFn(section) };
    }
    return section;
  });

  if (!found) return loaderData;

  return {
    ...loaderData,
    selectedCourse: { ...course, sections },
  };
}
