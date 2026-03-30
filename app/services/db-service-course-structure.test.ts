import { describe, it, expect } from "@effect/vitest";
import { beforeAll, beforeEach } from "vitest";
import { Effect, Layer } from "effect";
import { DBFunctionsService } from "@/services/db-service.server";
import { DrizzleService } from "@/services/drizzle-service.server";
import {
  createTestDb,
  truncateAllTables,
  type TestDb,
} from "@/test-utils/pglite";
import * as schema from "@/db/schema";

let testDb: TestDb;
let testLayer: Layer.Layer<DBFunctionsService>;

beforeAll(async () => {
  const result = await createTestDb();
  testDb = result.testDb;

  testLayer = DBFunctionsService.Default.pipe(
    Layer.provide(Layer.succeed(DrizzleService, testDb as any))
  );
});

beforeEach(async () => {
  await truncateAllTables(testDb);
});

const buildCourseWithVideos = async () => {
  const [course] = await testDb
    .insert(schema.courses)
    .values({ name: "Test Course", filePath: "/tmp/test-repo" })
    .returning();

  const [version] = await testDb
    .insert(schema.courseVersions)
    .values({ repoId: course!.id, name: "v1" })
    .returning();

  const [section] = await testDb
    .insert(schema.sections)
    .values({ repoVersionId: version!.id, path: "01-intro", order: 1 })
    .returning();

  const [lessonReal] = await testDb
    .insert(schema.lessons)
    .values({
      sectionId: section!.id,
      path: "01-welcome",
      title: "Welcome",
      order: 1,
      fsStatus: "real",
      description: "A welcome lesson",
    })
    .returning();

  const [lessonGhost] = await testDb
    .insert(schema.lessons)
    .values({
      sectionId: section!.id,
      path: "02-ghost",
      title: "Ghost Lesson",
      order: 2,
      fsStatus: "ghost",
    })
    .returning();

  // Insert a video with a clip to confirm they are NOT loaded by getCourseStructureById
  const [video] = await testDb
    .insert(schema.videos)
    .values({
      lessonId: lessonReal!.id,
      path: "video.mp4",
      originalFootagePath: "footage.mp4",
    })
    .returning();

  await testDb.insert(schema.clips).values({
    videoId: video!.id,
    videoFilename: "clip.mp4",
    sourceStartTime: 0,
    sourceEndTime: 10,
    order: "0001",
    text: "hello world",
  });

  return {
    courseId: course!.id,
    versionId: version!.id,
    sectionId: section!.id,
    lessonRealId: lessonReal!.id,
    lessonGhostId: lessonGhost!.id,
    videoId: video!.id,
  };
};

describe("getCourseStructureById", () => {
  it.effect("returns course with versions, sections, and lessons", () =>
    Effect.gen(function* () {
      const { courseId, versionId, sectionId, lessonRealId, lessonGhostId } =
        yield* Effect.promise(() => buildCourseWithVideos());

      const db = yield* DBFunctionsService;
      const result = yield* db.getCourseStructureById(courseId);

      expect(result.id).toBe(courseId);
      expect(result.name).toBe("Test Course");
      expect(result.versions).toHaveLength(1);

      const version = result.versions[0]!;
      expect(version.id).toBe(versionId);
      expect(version.sections).toHaveLength(1);

      const section = version.sections[0]!;
      expect(section.id).toBe(sectionId);
      expect(section.path).toBe("01-intro");
      expect(section.lessons).toHaveLength(2);

      const realLesson = section.lessons.find((l) => l.id === lessonRealId)!;
      expect(realLesson.path).toBe("01-welcome");
      expect(realLesson.description).toBe("A welcome lesson");
      expect(realLesson.fsStatus).toBe("real");

      const ghostLesson = section.lessons.find((l) => l.id === lessonGhostId)!;
      expect(ghostLesson.fsStatus).toBe("ghost");
    }).pipe(Effect.provide(testLayer))
  );

  it.effect("does not include videos or clips on lessons", () =>
    Effect.gen(function* () {
      const { courseId } = yield* Effect.promise(() => buildCourseWithVideos());

      const db = yield* DBFunctionsService;
      const result = yield* db.getCourseStructureById(courseId);

      const lesson = result.versions[0]!.sections[0]!.lessons[0]!;
      expect((lesson as any).videos).toBeUndefined();
    }).pipe(Effect.provide(testLayer))
  );

  it.effect("throws NotFoundError for unknown course id", () =>
    Effect.gen(function* () {
      const db = yield* DBFunctionsService;
      const result = yield* db
        .getCourseStructureById("nonexistent-id")
        .pipe(Effect.flip);
      expect(result._tag).toBe("NotFoundError");
    }).pipe(Effect.provide(testLayer))
  );
});
