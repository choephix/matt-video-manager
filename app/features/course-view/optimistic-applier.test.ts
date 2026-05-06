import { describe, it, expect } from "vitest";
import {
  applyOptimisticEvent,
  courseEditorFetcherKey,
  courseEditorFetcherKeyForEvent,
} from "./optimistic-applier";
import type { LoaderData } from "./course-view-types";
import type { CourseEditorEvent } from "@/services/course-editor-service";

function makeLesson(
  overrides: Partial<
    LoaderData["selectedCourse"] extends infer C
      ? C extends { sections: Array<{ lessons: Array<infer L> }> }
        ? L
        : never
      : never
  > = {}
) {
  return {
    id: "lesson-1",
    path: "01-intro",
    title: "Introduction",
    description: null,
    icon: "watch" as const,
    priority: 2,
    dependencies: [],
    fsStatus: "real" as const,
    authoringStatus: "todo" as const,
    order: 0,
    videos: [],
    ...overrides,
  };
}

function makeSection(
  overrides: Record<string, unknown> = {},
  lessons = [makeLesson()]
) {
  return {
    id: "section-1",
    path: "01-fundamentals",
    title: "Fundamentals",
    description: null,
    order: 0,
    lessons,
    ...overrides,
  };
}

function makeLoaderData(sections = [makeSection()]): LoaderData {
  return {
    courses: [],
    standaloneVideos: [],
    selectedCourse: {
      id: "course-1",
      name: "Test Course",
      filePath: "/tmp/test-course",
      sections,
    },
    versions: [],
    selectedVersion: undefined,
    isLatestVersion: true,
    hasExportedVideoMap: Promise.resolve({}),
    lessonFsMaps: Promise.resolve({
      hasExplainerFolderMap: {},
      lessonHasFilesMap: {},
    }),
    videoTranscripts: Promise.resolve({}),
    gitStatus: Promise.resolve(null),
    showMediaFilesList: false,
  } as unknown as LoaderData;
}

describe("applyOptimisticEvent", () => {
  describe("update-lesson-icon", () => {
    it("patches the icon for the matching lesson", () => {
      const loaderData = makeLoaderData();
      const event: CourseEditorEvent = {
        type: "update-lesson-icon",
        lessonId: "lesson-1",
        icon: "code",
      };

      const result = applyOptimisticEvent(loaderData, event);

      expect(result.selectedCourse!.sections[0]!.lessons[0]!.icon).toBe("code");
    });

    it("does not mutate the original loaderData", () => {
      const loaderData = makeLoaderData();
      const event: CourseEditorEvent = {
        type: "update-lesson-icon",
        lessonId: "lesson-1",
        icon: "discussion",
      };

      const result = applyOptimisticEvent(loaderData, event);

      expect(result).not.toBe(loaderData);
      expect(result.selectedCourse).not.toBe(loaderData.selectedCourse);
      expect(loaderData.selectedCourse!.sections[0]!.lessons[0]!.icon).toBe(
        "watch"
      );
    });

    it("returns loaderData unchanged when lesson is not found", () => {
      const loaderData = makeLoaderData();
      const event: CourseEditorEvent = {
        type: "update-lesson-icon",
        lessonId: "nonexistent",
        icon: "code",
      };

      const result = applyOptimisticEvent(loaderData, event);

      expect(result).toBe(loaderData);
    });

    it("finds the lesson across multiple sections", () => {
      const lesson2 = makeLesson({ id: "lesson-2", icon: "watch" });
      const section2 = makeSection({ id: "section-2" }, [lesson2]);
      const loaderData = makeLoaderData([makeSection(), section2]);

      const event: CourseEditorEvent = {
        type: "update-lesson-icon",
        lessonId: "lesson-2",
        icon: "discussion",
      };

      const result = applyOptimisticEvent(loaderData, event);

      expect(result.selectedCourse!.sections[1]!.lessons[0]!.icon).toBe(
        "discussion"
      );
      // first section unchanged
      expect(result.selectedCourse!.sections[0]!.lessons[0]!.icon).toBe(
        "watch"
      );
    });
  });

  describe("delete-lesson", () => {
    it("removes the lesson from its containing section", () => {
      const loaderData = makeLoaderData([
        makeSection({}, [
          makeLesson({ id: "lesson-1" }),
          makeLesson({ id: "lesson-2" }),
        ]),
      ]);
      const event: CourseEditorEvent = {
        type: "delete-lesson",
        lessonId: "lesson-1",
      };

      const result = applyOptimisticEvent(loaderData, event);

      expect(result.selectedCourse!.sections[0]!.lessons).toHaveLength(1);
      expect(result.selectedCourse!.sections[0]!.lessons[0]!.id).toBe(
        "lesson-2"
      );
    });

    it("does not mutate the original loaderData", () => {
      const loaderData = makeLoaderData();
      const event: CourseEditorEvent = {
        type: "delete-lesson",
        lessonId: "lesson-1",
      };

      const result = applyOptimisticEvent(loaderData, event);

      expect(result).not.toBe(loaderData);
      expect(loaderData.selectedCourse!.sections[0]!.lessons).toHaveLength(1);
    });

    it("returns loaderData unchanged when lesson is not found", () => {
      const loaderData = makeLoaderData();
      const event: CourseEditorEvent = {
        type: "delete-lesson",
        lessonId: "nonexistent",
      };

      const result = applyOptimisticEvent(loaderData, event);

      expect(result).toBe(loaderData);
    });

    it("finds and removes lesson across multiple sections", () => {
      const section1 = makeSection({ id: "section-1" }, [
        makeLesson({ id: "lesson-1" }),
      ]);
      const section2 = makeSection({ id: "section-2" }, [
        makeLesson({ id: "lesson-2" }),
        makeLesson({ id: "lesson-3" }),
      ]);
      const loaderData = makeLoaderData([section1, section2]);

      const event: CourseEditorEvent = {
        type: "delete-lesson",
        lessonId: "lesson-2",
      };

      const result = applyOptimisticEvent(loaderData, event);

      expect(result.selectedCourse!.sections[0]).toBe(section1);
      expect(result.selectedCourse!.sections[1]!.lessons).toHaveLength(1);
      expect(result.selectedCourse!.sections[1]!.lessons[0]!.id).toBe(
        "lesson-3"
      );
    });
  });

  describe("archive-section", () => {
    it("removes the section from the course", () => {
      const section1 = makeSection({ id: "section-1" });
      const section2 = makeSection({ id: "section-2" }, [
        makeLesson({ id: "lesson-2" }),
      ]);
      const loaderData = makeLoaderData([section1, section2]);

      const event: CourseEditorEvent = {
        type: "archive-section",
        sectionId: "section-1",
      };

      const result = applyOptimisticEvent(loaderData, event);

      expect(result.selectedCourse!.sections).toHaveLength(1);
      expect(result.selectedCourse!.sections[0]!.id).toBe("section-2");
    });

    it("does not mutate the original loaderData", () => {
      const loaderData = makeLoaderData([
        makeSection({ id: "section-1" }),
        makeSection({ id: "section-2" }, [makeLesson({ id: "lesson-2" })]),
      ]);
      const event: CourseEditorEvent = {
        type: "archive-section",
        sectionId: "section-1",
      };

      const result = applyOptimisticEvent(loaderData, event);

      expect(result).not.toBe(loaderData);
      expect(loaderData.selectedCourse!.sections).toHaveLength(2);
    });

    it("returns loaderData unchanged when section is not found", () => {
      const loaderData = makeLoaderData();
      const event: CourseEditorEvent = {
        type: "archive-section",
        sectionId: "nonexistent",
      };

      const result = applyOptimisticEvent(loaderData, event);

      expect(result).toBe(loaderData);
    });

    it("preserves reference equality for remaining sections", () => {
      const section1 = makeSection({ id: "section-1" });
      const section2 = makeSection({ id: "section-2" }, [
        makeLesson({ id: "lesson-2" }),
      ]);
      const loaderData = makeLoaderData([section1, section2]);

      const event: CourseEditorEvent = {
        type: "archive-section",
        sectionId: "section-1",
      };

      const result = applyOptimisticEvent(loaderData, event);

      expect(result.selectedCourse!.sections[0]).toBe(section2);
    });
  });

  describe("convert-to-ghost", () => {
    it("flips fsStatus from real to ghost for the matching lesson", () => {
      const loaderData = makeLoaderData([
        makeSection({}, [makeLesson({ id: "lesson-1", fsStatus: "real" })]),
      ]);
      const event: CourseEditorEvent = {
        type: "convert-to-ghost",
        lessonId: "lesson-1",
      };

      const result = applyOptimisticEvent(loaderData, event);

      expect(result.selectedCourse!.sections[0]!.lessons[0]!.fsStatus).toBe(
        "ghost"
      );
    });

    it("does not mutate the original loaderData", () => {
      const loaderData = makeLoaderData([
        makeSection({}, [makeLesson({ id: "lesson-1", fsStatus: "real" })]),
      ]);
      const event: CourseEditorEvent = {
        type: "convert-to-ghost",
        lessonId: "lesson-1",
      };

      const result = applyOptimisticEvent(loaderData, event);

      expect(result).not.toBe(loaderData);
      expect(loaderData.selectedCourse!.sections[0]!.lessons[0]!.fsStatus).toBe(
        "real"
      );
    });

    it("returns loaderData unchanged when lesson is not found", () => {
      const loaderData = makeLoaderData();
      const event: CourseEditorEvent = {
        type: "convert-to-ghost",
        lessonId: "nonexistent",
      };

      const result = applyOptimisticEvent(loaderData, event);

      expect(result).toBe(loaderData);
    });

    it("finds lesson across multiple sections", () => {
      const section1 = makeSection({ id: "section-1" }, [
        makeLesson({ id: "lesson-1", fsStatus: "real" }),
      ]);
      const section2 = makeSection({ id: "section-2" }, [
        makeLesson({ id: "lesson-2", fsStatus: "real" }),
      ]);
      const loaderData = makeLoaderData([section1, section2]);

      const event: CourseEditorEvent = {
        type: "convert-to-ghost",
        lessonId: "lesson-2",
      };

      const result = applyOptimisticEvent(loaderData, event);

      expect(result.selectedCourse!.sections[0]).toBe(section1);
      expect(result.selectedCourse!.sections[1]!.lessons[0]!.fsStatus).toBe(
        "ghost"
      );
    });
  });

  describe("delete-lesson edge cases", () => {
    it("leaves section with empty lessons when removing the only lesson", () => {
      const loaderData = makeLoaderData([
        makeSection({ id: "section-1" }, [makeLesson({ id: "lesson-1" })]),
      ]);
      const event: CourseEditorEvent = {
        type: "delete-lesson",
        lessonId: "lesson-1",
      };

      const result = applyOptimisticEvent(loaderData, event);

      expect(result.selectedCourse!.sections).toHaveLength(1);
      expect(result.selectedCourse!.sections[0]!.lessons).toHaveLength(0);
    });

    it("preserves reference equality for sections after the match", () => {
      const section1 = makeSection({ id: "section-1" }, [
        makeLesson({ id: "lesson-1" }),
      ]);
      const section2 = makeSection({ id: "section-2" }, [
        makeLesson({ id: "lesson-2" }),
      ]);
      const section3 = makeSection({ id: "section-3" }, [
        makeLesson({ id: "lesson-3" }),
      ]);
      const loaderData = makeLoaderData([section1, section2, section3]);

      const event: CourseEditorEvent = {
        type: "delete-lesson",
        lessonId: "lesson-1",
      };

      const result = applyOptimisticEvent(loaderData, event);

      expect(result.selectedCourse!.sections[0]).not.toBe(section1);
      expect(result.selectedCourse!.sections[1]).toBe(section2);
      expect(result.selectedCourse!.sections[2]).toBe(section3);
    });
  });

  describe("archive-section edge cases", () => {
    it("results in empty sections array when archiving the only section", () => {
      const loaderData = makeLoaderData([makeSection({ id: "section-1" })]);
      const event: CourseEditorEvent = {
        type: "archive-section",
        sectionId: "section-1",
      };

      const result = applyOptimisticEvent(loaderData, event);

      expect(result.selectedCourse!.sections).toHaveLength(0);
    });
  });

  describe("convert-to-ghost edge cases", () => {
    it("is idempotent on an already-ghost lesson", () => {
      const loaderData = makeLoaderData([
        makeSection({}, [makeLesson({ id: "lesson-1", fsStatus: "ghost" })]),
      ]);
      const event: CourseEditorEvent = {
        type: "convert-to-ghost",
        lessonId: "lesson-1",
      };

      const result = applyOptimisticEvent(loaderData, event);

      expect(result.selectedCourse!.sections[0]!.lessons[0]!.fsStatus).toBe(
        "ghost"
      );
    });
  });

  describe("cross-event sequential composition", () => {
    it("convert-to-ghost then delete-lesson on same lesson", () => {
      const loaderData = makeLoaderData([
        makeSection({}, [
          makeLesson({ id: "lesson-1", fsStatus: "real" }),
          makeLesson({ id: "lesson-2" }),
        ]),
      ]);

      const ghost: CourseEditorEvent = {
        type: "convert-to-ghost",
        lessonId: "lesson-1",
      };
      const del: CourseEditorEvent = {
        type: "delete-lesson",
        lessonId: "lesson-1",
      };

      const afterGhost = applyOptimisticEvent(loaderData, ghost);
      const result = applyOptimisticEvent(afterGhost, del);

      expect(result.selectedCourse!.sections[0]!.lessons).toHaveLength(1);
      expect(result.selectedCourse!.sections[0]!.lessons[0]!.id).toBe(
        "lesson-2"
      );
    });

    it("delete-lesson then convert-to-ghost on deleted lesson is a no-op", () => {
      const loaderData = makeLoaderData([
        makeSection({}, [
          makeLesson({ id: "lesson-1", fsStatus: "real" }),
          makeLesson({ id: "lesson-2", fsStatus: "real" }),
        ]),
      ]);

      const del: CourseEditorEvent = {
        type: "delete-lesson",
        lessonId: "lesson-1",
      };
      const ghost: CourseEditorEvent = {
        type: "convert-to-ghost",
        lessonId: "lesson-1",
      };

      const afterDelete = applyOptimisticEvent(loaderData, del);
      const result = applyOptimisticEvent(afterDelete, ghost);

      expect(result).toBe(afterDelete);
    });

    it("delete-lesson then archive-section on the emptied section", () => {
      const loaderData = makeLoaderData([
        makeSection({ id: "section-1" }, [makeLesson({ id: "lesson-1" })]),
        makeSection({ id: "section-2" }, [makeLesson({ id: "lesson-2" })]),
      ]);

      const del: CourseEditorEvent = {
        type: "delete-lesson",
        lessonId: "lesson-1",
      };
      const archive: CourseEditorEvent = {
        type: "archive-section",
        sectionId: "section-1",
      };

      const afterDelete = applyOptimisticEvent(loaderData, del);
      const result = applyOptimisticEvent(afterDelete, archive);

      expect(result.selectedCourse!.sections).toHaveLength(1);
      expect(result.selectedCourse!.sections[0]!.id).toBe("section-2");
    });
  });

  describe("passthrough for unhandled events", () => {
    it("returns loaderData unchanged for create-section", () => {
      const loaderData = makeLoaderData();
      const event: CourseEditorEvent = {
        type: "create-section",
        repoVersionId: "v1",
        title: "New Section",
        maxOrder: 1,
      };

      const result = applyOptimisticEvent(loaderData, event);

      expect(result).toBe(loaderData);
    });

    it("returns loaderData unchanged for update-lesson-title", () => {
      const loaderData = makeLoaderData();
      const event: CourseEditorEvent = {
        type: "update-lesson-title",
        lessonId: "lesson-1",
        title: "New Title",
      };

      const result = applyOptimisticEvent(loaderData, event);

      expect(result).toBe(loaderData);
    });
  });

  describe("undefined selectedCourse", () => {
    it("returns loaderData unchanged", () => {
      const loaderData = makeLoaderData();
      (loaderData as any).selectedCourse = undefined;

      const event: CourseEditorEvent = {
        type: "update-lesson-icon",
        lessonId: "lesson-1",
        icon: "code",
      };

      const result = applyOptimisticEvent(loaderData, event);

      expect(result).toBe(loaderData);
    });
  });

  describe("empty and edge-case structures", () => {
    it("returns loaderData unchanged when sections array is empty", () => {
      const loaderData = makeLoaderData([]);
      const event: CourseEditorEvent = {
        type: "update-lesson-icon",
        lessonId: "lesson-1",
        icon: "code",
      };

      const result = applyOptimisticEvent(loaderData, event);

      expect(result).toBe(loaderData);
    });

    it("returns loaderData unchanged when section has no lessons", () => {
      const loaderData = makeLoaderData([makeSection({}, [])]);
      const event: CourseEditorEvent = {
        type: "update-lesson-icon",
        lessonId: "lesson-1",
        icon: "code",
      };

      const result = applyOptimisticEvent(loaderData, event);

      expect(result).toBe(loaderData);
    });

    it("preserves reference equality for unchanged sections", () => {
      const section1 = makeSection({ id: "section-1" });
      const section2 = makeSection({ id: "section-2" }, [
        makeLesson({ id: "lesson-2" }),
      ]);
      const loaderData = makeLoaderData([section1, section2]);

      const event: CourseEditorEvent = {
        type: "update-lesson-icon",
        lessonId: "lesson-2",
        icon: "code",
      };

      const result = applyOptimisticEvent(loaderData, event);

      expect(result.selectedCourse!.sections[0]).toBe(section1);
      expect(result.selectedCourse!.sections[1]).not.toBe(section2);
    });
  });

  describe("sequential event composition", () => {
    it("applies two update-lesson-icon events on different lessons", () => {
      const section = makeSection({}, [
        makeLesson({ id: "lesson-1", icon: "watch" }),
        makeLesson({ id: "lesson-2", icon: "watch" }),
      ]);
      const loaderData = makeLoaderData([section]);

      const event1: CourseEditorEvent = {
        type: "update-lesson-icon",
        lessonId: "lesson-1",
        icon: "code",
      };
      const event2: CourseEditorEvent = {
        type: "update-lesson-icon",
        lessonId: "lesson-2",
        icon: "discussion",
      };

      const intermediate = applyOptimisticEvent(loaderData, event1);
      const result = applyOptimisticEvent(intermediate, event2);

      expect(result.selectedCourse!.sections[0]!.lessons[0]!.icon).toBe("code");
      expect(result.selectedCourse!.sections[0]!.lessons[1]!.icon).toBe(
        "discussion"
      );
    });

    it("last write wins when two events target the same lesson", () => {
      const loaderData = makeLoaderData();
      const event1: CourseEditorEvent = {
        type: "update-lesson-icon",
        lessonId: "lesson-1",
        icon: "code",
      };
      const event2: CourseEditorEvent = {
        type: "update-lesson-icon",
        lessonId: "lesson-1",
        icon: "discussion",
      };

      const intermediate = applyOptimisticEvent(loaderData, event1);
      const result = applyOptimisticEvent(intermediate, event2);

      expect(result.selectedCourse!.sections[0]!.lessons[0]!.icon).toBe(
        "discussion"
      );
    });
  });
});

describe("courseEditorFetcherKey", () => {
  it("formats the key as course-editor:<type>:<id>", () => {
    expect(courseEditorFetcherKey("update-lesson-icon", "lesson-1")).toBe(
      "course-editor:update-lesson-icon:lesson-1"
    );
  });
});

describe("courseEditorFetcherKeyForEvent", () => {
  it("uses lessonId for lesson events", () => {
    expect(
      courseEditorFetcherKeyForEvent({
        type: "update-lesson-icon",
        lessonId: "L1",
        icon: "code",
      })
    ).toBe("course-editor:update-lesson-icon:L1");
  });

  it("uses sectionId for section events", () => {
    expect(
      courseEditorFetcherKeyForEvent({
        type: "update-section-name",
        sectionId: "S1",
        title: "New",
      })
    ).toBe("course-editor:update-section-name:S1");
  });

  it("uses repoVersionId for create-section", () => {
    expect(
      courseEditorFetcherKeyForEvent({
        type: "create-section",
        repoVersionId: "V1",
        title: "New",
        maxOrder: 0,
      })
    ).toBe("course-editor:create-section:V1");
  });

  it('uses "batch" for reorder-sections', () => {
    expect(
      courseEditorFetcherKeyForEvent({
        type: "reorder-sections",
        sectionIds: ["S1", "S2"],
      })
    ).toBe("course-editor:reorder-sections:batch");
  });

  it("uses sectionId for reorder-lessons", () => {
    expect(
      courseEditorFetcherKeyForEvent({
        type: "reorder-lessons",
        sectionId: "S1",
        lessonIds: ["L1", "L2"],
      })
    ).toBe("course-editor:reorder-lessons:S1");
  });
});
