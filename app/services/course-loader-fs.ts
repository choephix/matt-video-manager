import { FileSystem } from "@effect/platform";
import { Effect } from "effect";
import { CoursePublishService } from "./course-publish-service";

const listFilesRecursive = (
  dir: string,
  prefix: string
): Effect.Effect<
  { path: string; size: number }[],
  never,
  FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const entries = yield* fs
      .readDirectory(dir)
      .pipe(Effect.catchAll(() => Effect.succeed([] as string[])));
    const entryResults = yield* Effect.forEach(
      entries,
      (entry) =>
        Effect.gen(function* () {
          const fullPath = `${dir}/${entry}`;
          const relativePath = prefix ? `${prefix}/${entry}` : entry;
          const stat = yield* fs
            .stat(fullPath)
            .pipe(Effect.catchAll(() => Effect.succeed(undefined)));
          if (!stat) return [] as { path: string; size: number }[];
          if (stat.type === "Directory") {
            return yield* listFilesRecursive(fullPath, relativePath);
          } else {
            return [{ path: relativePath, size: Number(stat.size) }];
          }
        }),
      { concurrency: "unbounded" }
    );
    return entryResults.flat();
  });

export const loadCourseFileMaps = (opts: {
  videos: { id: string }[];
  lessons: { id: string; fullPath: string }[];
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const publishService = yield* CoursePublishService;

    const hasExportedVideoMap: Record<string, boolean> = {};
    const hasExplainerFolderMap: Record<string, boolean> = {};
    const lessonHasFilesMap: Record<string, { path: string; size: number }[]> =
      {};

    yield* Effect.all(
      [
        Effect.forEach(
          opts.videos,
          (video) =>
            Effect.gen(function* () {
              hasExportedVideoMap[video.id] = yield* publishService.isExported(
                video.id
              );
            }),
          { concurrency: "unbounded" }
        ),
        Effect.forEach(
          opts.lessons,
          (lesson) =>
            Effect.gen(function* () {
              hasExplainerFolderMap[lesson.id] = yield* fs.exists(
                `${lesson.fullPath}/explainer`
              );
              lessonHasFilesMap[lesson.id] = yield* listFilesRecursive(
                lesson.fullPath,
                ""
              );
            }),
          { concurrency: "unbounded" }
        ),
      ],
      { concurrency: "unbounded" }
    );

    return { hasExportedVideoMap, hasExplainerFolderMap, lessonHasFilesMap };
  });
