import type { DrizzleDB } from "@/services/drizzle-service.server";
import {
  clips,
  repos,
  repoVersions,
  sections,
  lessons,
  videos,
} from "@/db/schema";
import {
  AmbiguousCourseUpdateError,
  NotFoundError,
  UnknownDBServiceError,
} from "@/services/db-service-errors";
import { asc, desc, eq } from "drizzle-orm";
import { Effect } from "effect";

const makeDbCall = <T>(fn: () => Promise<T>) => {
  return Effect.tryPromise({
    try: fn,
    catch: (e) => new UnknownDBServiceError({ cause: e }),
  });
};

export const createCourseOperations = (db: DrizzleDB) => {
  const getCourseById = Effect.fn("getCourseById")(function* (id: string) {
    const repo = yield* makeDbCall(() =>
      db.query.repos.findFirst({
        where: eq(repos.id, id),
      })
    );

    if (!repo) {
      return yield* new NotFoundError({
        type: "getCourse",
        params: { id },
      });
    }

    return repo;
  });

  const getCourseByFilePath = Effect.fn("getCourseByFilePath")(function* (
    filePath: string
  ) {
    const repo = yield* makeDbCall(() =>
      db.query.repos.findFirst({
        where: eq(repos.filePath, filePath),
      })
    );

    if (!repo) {
      return yield* new NotFoundError({
        type: "getCourseByFilePath",
        params: { filePath },
      });
    }

    return repo;
  });

  const getCourseWithSectionsById = Effect.fn("getCourseWithSectionsById")(
    function* (id: string) {
      const repo = yield* makeDbCall(() =>
        db.query.repos.findFirst({
          where: eq(repos.id, id),
          with: {
            versions: {
              orderBy: desc(repoVersions.createdAt),
              with: {
                sections: {
                  with: {
                    lessons: {
                      with: {
                        videos: {
                          orderBy: asc(videos.path),
                          where: eq(videos.archived, false),
                          with: {
                            clips: {
                              orderBy: asc(clips.order),
                              where: eq(clips.archived, false),
                            },
                          },
                        },
                      },
                      orderBy: asc(lessons.order),
                    },
                  },
                  orderBy: asc(sections.order),
                },
              },
            },
          },
        })
      );

      if (!repo) {
        return yield* new NotFoundError({
          type: "getCourseWithSections",
          params: { id },
        });
      }

      return repo;
    }
  );

  const getCourseWithSectionsByFilePath = Effect.fn(
    "getCourseWithSectionsByFilePath"
  )(function* (filePath: string) {
    const repo = yield* getCourseByFilePath(filePath);
    return yield* getCourseWithSectionsById(repo.id);
  });

  const getCourses = Effect.fn("getCourses")(function* () {
    const reposResult = yield* makeDbCall(() =>
      db.query.repos.findMany({
        where: eq(repos.archived, false),
      })
    );
    return reposResult;
  });

  const getArchivedCourses = Effect.fn("getArchivedCourses")(function* () {
    const reposResult = yield* makeDbCall(() =>
      db.query.repos.findMany({
        where: eq(repos.archived, true),
      })
    );
    return reposResult;
  });

  const createCourse = Effect.fn("createCourse")(function* (input: {
    filePath: string;
    name: string;
  }) {
    const reposResult = yield* makeDbCall(() =>
      db.insert(repos).values(input).returning()
    );

    const repo = reposResult[0];

    if (!repo) {
      return yield* new UnknownDBServiceError({
        cause: "No course was returned from the database",
      });
    }

    return repo;
  });

  const updateCourseName = Effect.fn("updateCourseName")(function* (opts: {
    repoId: string;
    name: string;
  }) {
    const { repoId, name } = opts;
    const [updated] = yield* makeDbCall(() =>
      db.update(repos).set({ name }).where(eq(repos.id, repoId)).returning()
    );

    if (!updated) {
      return yield* new NotFoundError({
        type: "updateCourseName",
        params: { repoId },
      });
    }

    return updated;
  });

  const updateCourseMemory = Effect.fn("updateCourseMemory")(function* (opts: {
    repoId: string;
    memory: string;
  }) {
    const { repoId, memory } = opts;
    const [updated] = yield* makeDbCall(() =>
      db.update(repos).set({ memory }).where(eq(repos.id, repoId)).returning()
    );

    if (!updated) {
      return yield* new NotFoundError({
        type: "updateCourseMemory",
        params: { repoId },
      });
    }

    return updated;
  });

  const updateCourseArchiveStatus = Effect.fn("updateCourseArchiveStatus")(
    function* (opts: { repoId: string; archived: boolean }) {
      const { repoId, archived } = opts;
      const [updated] = yield* makeDbCall(() =>
        db
          .update(repos)
          .set({ archived })
          .where(eq(repos.id, repoId))
          .returning()
      );

      if (!updated) {
        return yield* new NotFoundError({
          type: "updateCourseArchiveStatus",
          params: { repoId },
        });
      }

      return updated;
    }
  );

  const updateCourseFilePath = Effect.fn("updateCourseFilePath")(
    function* (opts: { repoId: string; filePath: string }) {
      const { repoId, filePath } = opts;

      const currentRepo = yield* makeDbCall(() =>
        db.query.repos.findFirst({
          where: eq(repos.id, repoId),
        })
      );

      if (!currentRepo) {
        return yield* new NotFoundError({
          type: "updateCourseFilePath",
          params: { repoId },
        });
      }

      const reposWithSamePath = yield* makeDbCall(() =>
        db.query.repos.findMany({
          where: eq(repos.filePath, currentRepo.filePath),
        })
      );

      if (reposWithSamePath.length > 1) {
        return yield* new AmbiguousCourseUpdateError({
          filePath: currentRepo.filePath,
          repoCount: reposWithSamePath.length,
        });
      }

      const [updated] = yield* makeDbCall(() =>
        db
          .update(repos)
          .set({ filePath })
          .where(eq(repos.id, repoId))
          .returning()
      );

      if (!updated) {
        return yield* new NotFoundError({
          type: "updateCourseFilePath",
          params: { repoId },
        });
      }

      return updated;
    }
  );

  const deleteCourse = Effect.fn("deleteCourse")(function* (repoId: string) {
    yield* makeDbCall(() => db.delete(repos).where(eq(repos.id, repoId)));
  });

  return {
    getCourseById,
    getCourseByFilePath,
    getCourseWithSectionsById,
    getCourseWithSectionsByFilePath,
    getCourses,
    getArchivedCourses,
    createCourse,
    updateCourseName,
    updateCourseMemory,
    updateCourseArchiveStatus,
    updateCourseFilePath,
    deleteCourse,
  };
};
