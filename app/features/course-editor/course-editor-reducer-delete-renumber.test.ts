import { describe, expect, it } from "vitest";
import {
  courseEditorReducer,
  createInitialCourseEditorState,
} from "./course-editor-reducer";
import { ReducerTester } from "@/test-utils/reducer-tester";
import type {
  FrontendId,
  DatabaseId,
  EditorSection,
  EditorLesson,
} from "./course-editor-types";

const createTester = (sections: EditorSection[] = []) =>
  new ReducerTester(
    courseEditorReducer,
    createInitialCourseEditorState(sections)
  );

const fid = (id: string) => id as FrontendId;
const did = (id: string) => id as DatabaseId;

const createLesson = (overrides: Partial<EditorLesson> = {}): EditorLesson => ({
  frontendId: fid(crypto.randomUUID()),
  databaseId: did(crypto.randomUUID()),
  sectionId: "section-1",
  path: "test-lesson",
  title: "Test Lesson",
  fsStatus: "real",
  description: "",
  icon: null,
  priority: 2,
  dependencies: null,
  order: 1,
  videos: [],
  ...overrides,
});

const createSection = (
  overrides: Partial<EditorSection> = {}
): EditorSection => ({
  frontendId: fid(crypto.randomUUID()),
  databaseId: did(crypto.randomUUID()),
  repoVersionId: "version-1",
  path: "test-section",
  description: "",
  order: 1,
  lessons: [],
  ...overrides,
});

describe("courseEditorReducer — reorder-lessons renumbering", () => {
  it("should reorder and update order values", () => {
    const l1 = createLesson({ order: 1, path: "first" });
    const l2 = createLesson({ order: 2, path: "second" });
    const l3 = createLesson({ order: 3, path: "third" });
    const section = createSection({ lessons: [l1, l2, l3] });
    const state = createTester([section])
      .send({
        type: "reorder-lessons",
        sectionFrontendId: section.frontendId,
        lessonFrontendIds: [l3.frontendId, l1.frontendId, l2.frontendId],
      })
      .getState();
    expect(state.sections[0]!.lessons.map((l) => l.path)).toEqual([
      "third",
      "first",
      "second",
    ]);
    expect(state.sections[0]!.lessons.map((l) => l.order)).toEqual([1, 2, 3]);
  });

  it("should renumber real lesson paths after reorder", () => {
    const l1 = createLesson({ order: 1, path: "01.01-first" });
    const l2 = createLesson({ order: 2, path: "01.02-second" });
    const l3 = createLesson({ order: 3, path: "01.03-third" });
    const section = createSection({ lessons: [l1, l2, l3] });
    const state = createTester([section])
      .send({
        type: "reorder-lessons",
        sectionFrontendId: section.frontendId,
        lessonFrontendIds: [l3.frontendId, l1.frontendId, l2.frontendId],
      })
      .getState();
    expect(state.sections[0]!.lessons.map((l) => l.path)).toEqual([
      "01.01-third",
      "01.02-first",
      "01.03-second",
    ]);
  });

  it("should skip ghost lessons when renumbering paths", () => {
    const l1 = createLesson({ order: 1, path: "01.01-first" });
    const ghost = createLesson({
      order: 2,
      path: "My Ghost Lesson",
      fsStatus: "ghost",
    });
    const l2 = createLesson({ order: 3, path: "01.02-second" });
    const section = createSection({ lessons: [l1, ghost, l2] });
    const state = createTester([section])
      .send({
        type: "reorder-lessons",
        sectionFrontendId: section.frontendId,
        lessonFrontendIds: [l2.frontendId, ghost.frontendId, l1.frontendId],
      })
      .getState();
    expect(state.sections[0]!.lessons.map((l) => l.path)).toEqual([
      "01.01-second",
      "My Ghost Lesson",
      "01.02-first",
    ]);
  });

  it("should preserve section number when renumbering after reorder", () => {
    const l1 = createLesson({ order: 1, path: "03.01-alpha" });
    const l2 = createLesson({ order: 2, path: "03.02-beta" });
    const section = createSection({ lessons: [l1, l2] });
    const state = createTester([section])
      .send({
        type: "reorder-lessons",
        sectionFrontendId: section.frontendId,
        lessonFrontendIds: [l2.frontendId, l1.frontendId],
      })
      .getState();
    expect(state.sections[0]!.lessons.map((l) => l.path)).toEqual([
      "03.01-beta",
      "03.02-alpha",
    ]);
  });

  it("should not change paths for non-parseable lesson paths", () => {
    const l1 = createLesson({ order: 1, path: "plain-lesson" });
    const l2 = createLesson({ order: 2, path: "another-lesson" });
    const section = createSection({ lessons: [l1, l2] });
    const state = createTester([section])
      .send({
        type: "reorder-lessons",
        sectionFrontendId: section.frontendId,
        lessonFrontendIds: [l2.frontendId, l1.frontendId],
      })
      .getState();
    expect(state.sections[0]!.lessons.map((l) => l.path)).toEqual([
      "another-lesson",
      "plain-lesson",
    ]);
  });
});

describe("courseEditorReducer — delete-lesson renumbering", () => {
  it("should renumber real lesson paths after deletion", () => {
    const l1 = createLesson({ order: 1, path: "01.01-first" });
    const l2 = createLesson({ order: 2, path: "01.02-second" });
    const l3 = createLesson({ order: 3, path: "01.03-third" });
    const section = createSection({ lessons: [l1, l2, l3] });
    const state = createTester([section])
      .send({ type: "delete-lesson", frontendId: l2.frontendId })
      .getState();
    expect(state.sections[0]!.lessons.map((l) => l.path)).toEqual([
      "01.01-first",
      "01.02-third",
    ]);
  });

  it("should skip ghost lessons when renumbering after deletion", () => {
    const l1 = createLesson({ order: 1, path: "01.01-first" });
    const ghost = createLesson({
      order: 2,
      path: "My Ghost",
      fsStatus: "ghost",
    });
    const l2 = createLesson({ order: 3, path: "01.02-second" });
    const l3 = createLesson({ order: 4, path: "01.03-third" });
    const section = createSection({ lessons: [l1, ghost, l2, l3] });
    const state = createTester([section])
      .send({ type: "delete-lesson", frontendId: l2.frontendId })
      .getState();
    expect(state.sections[0]!.lessons.map((l) => l.path)).toEqual([
      "01.01-first",
      "My Ghost",
      "01.02-third",
    ]);
  });

  it("should leave an empty section when deleting the only lesson", () => {
    const l1 = createLesson({ order: 1, path: "01.01-only" });
    const section = createSection({ lessons: [l1] });
    const state = createTester([section])
      .send({ type: "delete-lesson", frontendId: l1.frontendId })
      .getState();
    expect(state.sections[0]!.lessons).toEqual([]);
  });

  it("should renumber when deleting the first lesson", () => {
    const l1 = createLesson({ order: 1, path: "01.01-first" });
    const l2 = createLesson({ order: 2, path: "01.02-second" });
    const l3 = createLesson({ order: 3, path: "01.03-third" });
    const section = createSection({ lessons: [l1, l2, l3] });
    const state = createTester([section])
      .send({ type: "delete-lesson", frontendId: l1.frontendId })
      .getState();
    expect(state.sections[0]!.lessons.map((l) => l.path)).toEqual([
      "01.01-second",
      "01.02-third",
    ]);
  });

  it("should not change paths when deleting the last lesson", () => {
    const l1 = createLesson({ order: 1, path: "01.01-first" });
    const l2 = createLesson({ order: 2, path: "01.02-second" });
    const l3 = createLesson({ order: 3, path: "01.03-third" });
    const section = createSection({ lessons: [l1, l2, l3] });
    const state = createTester([section])
      .send({ type: "delete-lesson", frontendId: l3.frontendId })
      .getState();
    expect(state.sections[0]!.lessons.map((l) => l.path)).toEqual([
      "01.01-first",
      "01.02-second",
    ]);
  });

  it("should not alter real lesson paths when deleting a ghost", () => {
    const l1 = createLesson({ order: 1, path: "01.01-first" });
    const ghost = createLesson({
      order: 2,
      path: "My Ghost",
      fsStatus: "ghost",
    });
    const l2 = createLesson({ order: 3, path: "01.02-second" });
    const section = createSection({ lessons: [l1, ghost, l2] });
    const state = createTester([section])
      .send({ type: "delete-lesson", frontendId: ghost.frontendId })
      .getState();
    expect(state.sections[0]!.lessons.map((l) => l.path)).toEqual([
      "01.01-first",
      "01.02-second",
    ]);
  });

  it("should preserve section number from existing lessons", () => {
    const l1 = createLesson({ order: 1, path: "03.01-alpha" });
    const l2 = createLesson({ order: 2, path: "03.02-beta" });
    const l3 = createLesson({ order: 3, path: "03.03-gamma" });
    const section = createSection({ lessons: [l1, l2, l3] });
    const state = createTester([section])
      .send({ type: "delete-lesson", frontendId: l1.frontendId })
      .getState();
    expect(state.sections[0]!.lessons.map((l) => l.path)).toEqual([
      "03.01-beta",
      "03.02-gamma",
    ]);
  });
});
