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
  AmbiguousRepoUpdateError,
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

export const createRepoOperations = (db: DrizzleDB) => {
  const getRepoById = Effect.fn("getRepoById")(function* (id: string) {
    const repo = yield* makeDbCall(() =>
      db.query.repos.findFirst({
        where: eq(repos.id, id),
      })
    );

    if (!repo) {
      return yield* new NotFoundError({
        type: "getRepo",
        params: { id },
      });
    }

    return repo;
  });

  const getRepoByFilePath = Effect.fn("getRepoByFilePath")(function* (
    filePath: string
  ) {
    const repo = yield* makeDbCall(() =>
      db.query.repos.findFirst({
        where: eq(repos.filePath, filePath),
      })
    );

    if (!repo) {
      return yield* new NotFoundError({
        type: "getRepoByFilePath",
        params: { filePath },
      });
    }

    return repo;
  });

  const getRepoWithSectionsById = Effect.fn("getRepoWithSectionsById")(
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
          type: "getRepoWithSections",
          params: { id },
        });
      }

      return repo;
    }
  );

  const getRepoWithSectionsByFilePath = Effect.fn(
    "getRepoWithSectionsByFilePath"
  )(function* (filePath: string) {
    const repo = yield* getRepoByFilePath(filePath);
    return yield* getRepoWithSectionsById(repo.id);
  });

  const getRepos = Effect.fn("getRepos")(function* () {
    const reposResult = yield* makeDbCall(() =>
      db.query.repos.findMany({
        where: eq(repos.archived, false),
      })
    );
    return reposResult;
  });

  const getArchivedRepos = Effect.fn("getArchivedRepos")(function* () {
    const reposResult = yield* makeDbCall(() =>
      db.query.repos.findMany({
        where: eq(repos.archived, true),
      })
    );
    return reposResult;
  });

  const createRepo = Effect.fn("createRepo")(function* (input: {
    filePath: string;
    name: string;
  }) {
    const reposResult = yield* makeDbCall(() =>
      db.insert(repos).values(input).returning()
    );

    const repo = reposResult[0];

    if (!repo) {
      return yield* new UnknownDBServiceError({
        cause: "No repo was returned from the database",
      });
    }

    return repo;
  });

  const updateRepoName = Effect.fn("updateRepoName")(function* (opts: {
    repoId: string;
    name: string;
  }) {
    const { repoId, name } = opts;
    const [updated] = yield* makeDbCall(() =>
      db.update(repos).set({ name }).where(eq(repos.id, repoId)).returning()
    );

    if (!updated) {
      return yield* new NotFoundError({
        type: "updateRepoName",
        params: { repoId },
      });
    }

    return updated;
  });

  const updateRepoMemory = Effect.fn("updateRepoMemory")(function* (opts: {
    repoId: string;
    memory: string;
  }) {
    const { repoId, memory } = opts;
    const [updated] = yield* makeDbCall(() =>
      db.update(repos).set({ memory }).where(eq(repos.id, repoId)).returning()
    );

    if (!updated) {
      return yield* new NotFoundError({
        type: "updateRepoMemory",
        params: { repoId },
      });
    }

    return updated;
  });

  const updateRepoArchiveStatus = Effect.fn("updateRepoArchiveStatus")(
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
          type: "updateRepoArchiveStatus",
          params: { repoId },
        });
      }

      return updated;
    }
  );

  const updateRepoFilePath = Effect.fn("updateRepoFilePath")(function* (opts: {
    repoId: string;
    filePath: string;
  }) {
    const { repoId, filePath } = opts;

    const currentRepo = yield* makeDbCall(() =>
      db.query.repos.findFirst({
        where: eq(repos.id, repoId),
      })
    );

    if (!currentRepo) {
      return yield* new NotFoundError({
        type: "updateRepoFilePath",
        params: { repoId },
      });
    }

    const reposWithSamePath = yield* makeDbCall(() =>
      db.query.repos.findMany({
        where: eq(repos.filePath, currentRepo.filePath),
      })
    );

    if (reposWithSamePath.length > 1) {
      return yield* new AmbiguousRepoUpdateError({
        filePath: currentRepo.filePath,
        repoCount: reposWithSamePath.length,
      });
    }

    const [updated] = yield* makeDbCall(() =>
      db.update(repos).set({ filePath }).where(eq(repos.id, repoId)).returning()
    );

    if (!updated) {
      return yield* new NotFoundError({
        type: "updateRepoFilePath",
        params: { repoId },
      });
    }

    return updated;
  });

  const deleteRepo = Effect.fn("deleteRepo")(function* (repoId: string) {
    yield* makeDbCall(() => db.delete(repos).where(eq(repos.id, repoId)));
  });

  return {
    getRepoById,
    getRepoByFilePath,
    getRepoWithSectionsById,
    getRepoWithSectionsByFilePath,
    getRepos,
    getArchivedRepos,
    createRepo,
    updateRepoName,
    updateRepoMemory,
    updateRepoArchiveStatus,
    updateRepoFilePath,
    deleteRepo,
  };
};
