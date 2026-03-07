import { DrizzleService } from "@/services/drizzle-service.server";
import { createClipOperations } from "@/services/db-clip-operations.server";
import { createVideoOperations } from "@/services/db-video-operations.server";
import { createPlanOperations } from "@/services/db-plan-operations.server";
import { createRepoOperations } from "@/services/db-repo-operations.server";
import { createVersionOperations } from "@/services/db-version-operations.server";
import {
  lessons,
  links,
  sections,
  thumbnails,
  videos,
  aiHeroAuth,
  youtubeAuth,
} from "@/db/schema";
import {
  NotFoundError,
  UnknownDBServiceError,
} from "@/services/db-service-errors";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { Effect } from "effect";

const makeDbCall = <T>(fn: () => Promise<T>) => {
  return Effect.tryPromise({
    try: fn,
    catch: (e) => new UnknownDBServiceError({ cause: e }),
  });
};

export class DBFunctionsService extends Effect.Service<DBFunctionsService>()(
  "DBFunctionsService",
  {
    effect: Effect.gen(function* () {
      const db = yield* DrizzleService;

      const {
        getClipById,
        getClipsByIds,
        updateClip,
        archiveClip,
        reorderClip,
        createClipSection,
        createClipSectionAtInsertionPoint,
        createClipSectionAtPosition,
        getClipSectionById,
        updateClipSection,
        archiveClipSection,
        reorderClipSection,
        appendClips,
      } = createClipOperations(db);

      const {
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
      } = createRepoOperations(db);

      const {
        getVideoDeepById,
        getStandaloneVideos,
        getAllStandaloneVideos,
        getArchivedStandaloneVideos,
        getVideoWithClipsById,
        createVideo,
        createStandaloneVideo,
        hasOriginalFootagePathAlreadyBeenUsed,
        updateVideo,
        deleteVideo,
        updateVideoPath,
        updateVideoLesson,
        updateVideoArchiveStatus,
        getNextVideoId,
        getPreviousVideoId,
        getNextLessonWithoutVideo,
        getVideosForFewShotExamples,
      } = createVideoOperations(db, { getRepoWithSectionsById });

      const {
        getPlans,
        syncPlan,
        deletePlan,
        renamePlan,
        getArchivedPlans,
        updatePlanArchiveStatus,
      } = createPlanOperations(db);

      const {
        getRepoVersions,
        getLatestRepoVersion,
        getRepoVersionById,
        getRepoWithSectionsByVersion,
        getVersionWithSections,
        createRepoVersion,
        updateRepoVersion,
        deleteRepoVersion,
        copyVersionStructure,
        getVideoIdsForVersion,
        getAllVersionsWithStructure,
      } = createVersionOperations(db);

      const getLessonById = Effect.fn("getLessonById")(function* (id: string) {
        const lesson = yield* makeDbCall(() =>
          db.query.lessons.findFirst({
            where: eq(lessons.id, id),
            with: {
              videos: {
                orderBy: asc(videos.path),
              },
            },
          })
        );

        if (!lesson) {
          return yield* new NotFoundError({
            type: "getLessonById",
            params: { id },
          });
        }

        return lesson;
      });

      const getLessonsBySectionId = Effect.fn("getLessonsBySectionId")(
        function* (sectionId: string) {
          return yield* makeDbCall(() =>
            db.query.lessons.findMany({
              where: eq(lessons.sectionId, sectionId),
              orderBy: asc(lessons.order),
            })
          );
        }
      );

      const getLessonWithHierarchyById = Effect.fn(
        "getLessonWithHierarchyById"
      )(function* (id: string) {
        const lesson = yield* makeDbCall(() =>
          db.query.lessons.findFirst({
            where: eq(lessons.id, id),
            with: {
              section: {
                with: {
                  repoVersion: {
                    with: {
                      repo: true,
                    },
                  },
                },
              },
            },
          })
        );

        if (!lesson) {
          return yield* new NotFoundError({
            type: "getLessonWithHierarchyById",
            params: { id },
          });
        }

        return lesson;
      });

      const getSectionWithHierarchyById = Effect.fn(
        "getSectionWithHierarchyById"
      )(function* (id: string) {
        const section = yield* makeDbCall(() =>
          db.query.sections.findFirst({
            where: eq(sections.id, id),
            with: {
              repoVersion: {
                with: {
                  repo: true,
                },
              },
            },
          })
        );

        if (!section) {
          return yield* new NotFoundError({
            type: "getSectionWithHierarchyById",
            params: { id },
          });
        }

        return section;
      });

      return {
        getClipById,
        getClipsByIds,
        updateClip,
        archiveClip,
        reorderClip,
        createClipSection,
        createClipSectionAtInsertionPoint,
        createClipSectionAtPosition,
        getClipSectionById,
        updateClipSection,
        archiveClipSection,
        reorderClipSection,
        appendClips,
        getLessonById,
        getLessonWithHierarchyById,
        getLessonsBySectionId,
        getSectionWithHierarchyById,
        createVideo,
        createStandaloneVideo,
        hasOriginalFootagePathAlreadyBeenUsed,
        updateVideo,
        deleteVideo,
        updateVideoPath,
        updateVideoLesson,
        getRepoById,
        getRepoByFilePath,
        getRepoWithSectionsById,
        getRepoWithSectionsByFilePath,
        getRepos,
        getArchivedRepos,
        getVideoById: getVideoDeepById,
        getVideoWithClipsById: getVideoWithClipsById,
        getStandaloneVideos,
        getAllStandaloneVideos,
        getArchivedStandaloneVideos,
        createRepo,
        createSections: Effect.fn("createSections")(function* ({
          sections: newSections,
          repoVersionId,
        }: {
          sections: {
            sectionPathWithNumber: string;
            sectionNumber: number;
          }[];
          repoVersionId: string;
        }) {
          const sectionResult = yield* makeDbCall(() =>
            db
              .insert(sections)
              .values(
                newSections.map((section) => ({
                  repoVersionId,
                  path: section.sectionPathWithNumber,
                  order: section.sectionNumber,
                }))
              )
              .returning()
          );

          return sectionResult;
        }),

        createLessons: Effect.fn("createLessons")(function* (
          sectionId: string,
          newLessons: {
            lessonPathWithNumber: string;
            lessonNumber: number;
          }[]
        ) {
          const lessonResult = yield* makeDbCall(() =>
            db
              .insert(lessons)
              .values(
                newLessons.map((lesson) => ({
                  sectionId,
                  path: lesson.lessonPathWithNumber,
                  order: lesson.lessonNumber,
                }))
              )
              .returning()
          );

          return lessonResult;
        }),
        createGhostLesson: Effect.fn("createGhostLesson")(function* (
          sectionId: string,
          opts: {
            title: string;
            path: string;
            order: number;
          }
        ) {
          const lessonResult = yield* makeDbCall(() =>
            db
              .insert(lessons)
              .values({
                sectionId,
                title: opts.title,
                path: opts.path,
                order: opts.order,
                fsStatus: "ghost",
              })
              .returning()
          );

          return lessonResult;
        }),
        updateLesson: Effect.fn("updateLesson")(function* (
          lessonId: string,
          lesson: {
            path?: string;
            sectionId?: string;
            lessonNumber?: number;
            title?: string;
            fsStatus?: string;
            description?: string;
            dependencies?: string[];
            icon?: string | null;
            priority?: number;
          }
        ) {
          const lessonResult = yield* makeDbCall(() =>
            db
              .update(lessons)
              .set({
                path: lesson.path,
                sectionId: lesson.sectionId,
                order: lesson.lessonNumber,
                title: lesson.title,
                fsStatus: lesson.fsStatus,
                description: lesson.description,
                dependencies: lesson.dependencies,
                icon: lesson.icon,
                priority: lesson.priority,
              })
              .where(eq(lessons.id, lessonId))
          );

          return lessonResult;
        }),
        deleteLesson: Effect.fn("deleteLesson")(function* (lessonId: string) {
          const lessonResult = yield* makeDbCall(() =>
            db.delete(lessons).where(eq(lessons.id, lessonId))
          );

          return lessonResult;
        }),
        deleteSection: Effect.fn("deleteSection")(function* (
          sectionId: string
        ) {
          const sectionResult = yield* makeDbCall(() =>
            db.delete(sections).where(eq(sections.id, sectionId))
          );

          return sectionResult;
        }),
        updateSectionOrder: Effect.fn("updateSectionOrder")(function* (
          sectionId: string,
          order: number
        ) {
          return yield* makeDbCall(() =>
            db.update(sections).set({ order }).where(eq(sections.id, sectionId))
          );
        }),
        updateSectionPath: Effect.fn("updateSectionPath")(function* (
          sectionId: string,
          path: string
        ) {
          return yield* makeDbCall(() =>
            db.update(sections).set({ path }).where(eq(sections.id, sectionId))
          );
        }),
        getSectionsByIds: Effect.fn("getSectionsByIds")(function* (
          ids: readonly string[]
        ) {
          if (ids.length === 0) return [];
          return yield* makeDbCall(() =>
            db.query.sections.findMany({
              where: inArray(sections.id, ids as string[]),
            })
          );
        }),
        getSectionsByRepoVersionId: Effect.fn("getSectionsByRepoVersionId")(
          function* (repoVersionId: string) {
            return yield* makeDbCall(() =>
              db.query.sections.findMany({
                where: eq(sections.repoVersionId, repoVersionId),
                orderBy: asc(sections.order),
              })
            );
          }
        ),
        updateLessonOrder: Effect.fn("updateLessonOrder")(function* (
          lessonId: string,
          order: number
        ) {
          return yield* makeDbCall(() =>
            db.update(lessons).set({ order }).where(eq(lessons.id, lessonId))
          );
        }),
        getNextVideoId,
        getPreviousVideoId,
        getNextLessonWithoutVideo,
        getRepoVersions,
        getLatestRepoVersion,
        getRepoVersionById,
        getRepoWithSectionsByVersion,
        getVersionWithSections,
        createRepoVersion,
        updateRepoVersion,
        updateRepoName,
        updateRepoMemory,
        updateRepoArchiveStatus,
        updateVideoArchiveStatus,
        updateRepoFilePath,
        deleteRepo,
        deleteRepoVersion,
        copyVersionStructure,
        getVideoIdsForVersion,
        getAllVersionsWithStructure,
        getPlans,
        syncPlan,
        deletePlan,
        renamePlan,
        getArchivedPlans,
        updatePlanArchiveStatus,
        getLinks: Effect.fn("getLinks")(function* () {
          const allLinks = yield* makeDbCall(() =>
            db.query.links.findMany({
              orderBy: desc(links.createdAt),
            })
          );
          return allLinks;
        }),
        createLink: Effect.fn("createLink")(function* (link: {
          title: string;
          url: string;
          description?: string | null;
        }) {
          const [newLink] = yield* makeDbCall(() =>
            db
              .insert(links)
              .values({
                title: link.title,
                url: link.url,
                description: link.description ?? null,
              })
              .returning()
          );

          if (!newLink) {
            return yield* new UnknownDBServiceError({
              cause: "No link was returned from the database",
            });
          }

          return newLink;
        }),
        deleteLink: Effect.fn("deleteLink")(function* (linkId: string) {
          yield* makeDbCall(() => db.delete(links).where(eq(links.id, linkId)));
          return { success: true };
        }),
        getVideosForFewShotExamples,
        getYoutubeAuth: Effect.fn("getYoutubeAuth")(function* () {
          const auth = yield* makeDbCall(() =>
            db.query.youtubeAuth.findFirst()
          );
          return auth ?? null;
        }),
        upsertYoutubeAuth: Effect.fn("upsertYoutubeAuth")(function* (tokens: {
          accessToken: string;
          refreshToken: string;
          expiresAt: Date;
        }) {
          yield* makeDbCall(() => db.delete(youtubeAuth));

          const [newAuth] = yield* makeDbCall(() =>
            db
              .insert(youtubeAuth)
              .values({
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                expiresAt: tokens.expiresAt,
              })
              .returning()
          );

          if (!newAuth) {
            return yield* new UnknownDBServiceError({
              cause: "No YouTube auth was returned from the database",
            });
          }

          return newAuth;
        }),
        updateYoutubeAccessToken: Effect.fn("updateYoutubeAccessToken")(
          function* (tokens: { accessToken: string; expiresAt: Date }) {
            const existing = yield* makeDbCall(() =>
              db.query.youtubeAuth.findFirst()
            );

            if (!existing) {
              return yield* new NotFoundError({
                type: "updateYoutubeAccessToken",
                params: {},
                message: "No YouTube auth found to update",
              });
            }

            const [updated] = yield* makeDbCall(() =>
              db
                .update(youtubeAuth)
                .set({
                  accessToken: tokens.accessToken,
                  expiresAt: tokens.expiresAt,
                  updatedAt: new Date(),
                })
                .where(eq(youtubeAuth.id, existing.id))
                .returning()
            );

            if (!updated) {
              return yield* new NotFoundError({
                type: "updateYoutubeAccessToken",
                params: {},
              });
            }

            return updated;
          }
        ),
        deleteYoutubeAuth: Effect.fn("deleteYoutubeAuth")(function* () {
          yield* makeDbCall(() => db.delete(youtubeAuth));
          return { success: true };
        }),
        getAiHeroAuth: Effect.fn("getAiHeroAuth")(function* () {
          const auth = yield* makeDbCall(() => db.query.aiHeroAuth.findFirst());
          return auth ?? null;
        }),
        upsertAiHeroAuth: Effect.fn("upsertAiHeroAuth")(function* (params: {
          accessToken: string;
          userId: string;
        }) {
          yield* makeDbCall(() => db.delete(aiHeroAuth));

          const [newAuth] = yield* makeDbCall(() =>
            db
              .insert(aiHeroAuth)
              .values({
                accessToken: params.accessToken,
                userId: params.userId,
              })
              .returning()
          );

          if (!newAuth) {
            return yield* new UnknownDBServiceError({
              cause: "No AI Hero auth was returned from the database",
            });
          }

          return newAuth;
        }),
        deleteAiHeroAuth: Effect.fn("deleteAiHeroAuth")(function* () {
          yield* makeDbCall(() => db.delete(aiHeroAuth));
          return { success: true };
        }),
        getThumbnailsByVideoId: Effect.fn("getThumbnailsByVideoId")(function* (
          videoId: string
        ) {
          return yield* makeDbCall(() =>
            db.query.thumbnails.findMany({
              where: eq(thumbnails.videoId, videoId),
              orderBy: desc(thumbnails.createdAt),
            })
          );
        }),
        createThumbnail: Effect.fn("createThumbnail")(function* (params: {
          videoId: string;
          layers: unknown;
          filePath: string | null;
        }) {
          const [record] = yield* makeDbCall(() =>
            db
              .insert(thumbnails)
              .values({
                videoId: params.videoId,
                layers: params.layers,
                filePath: params.filePath,
              })
              .returning()
          );
          if (!record) {
            return yield* Effect.die("Failed to create thumbnail");
          }
          return record;
        }),
        getThumbnailById: Effect.fn("getThumbnailById")(function* (
          thumbnailId: string
        ) {
          const thumbnail = yield* makeDbCall(() =>
            db.query.thumbnails.findFirst({
              where: eq(thumbnails.id, thumbnailId),
            })
          );

          if (!thumbnail) {
            return yield* new NotFoundError({
              type: "getThumbnailById",
              params: { thumbnailId },
            });
          }

          return thumbnail;
        }),
        updateThumbnail: Effect.fn("updateThumbnail")(function* (
          thumbnailId: string,
          params: {
            layers: unknown;
            filePath: string | null;
          }
        ) {
          const [updated] = yield* makeDbCall(() =>
            db
              .update(thumbnails)
              .set({
                layers: params.layers,
                filePath: params.filePath,
              })
              .where(eq(thumbnails.id, thumbnailId))
              .returning()
          );

          if (!updated) {
            return yield* new NotFoundError({
              type: "updateThumbnail",
              params: { thumbnailId },
            });
          }

          return updated;
        }),
        selectThumbnailForUpload: Effect.fn("selectThumbnailForUpload")(
          function* (thumbnailId: string, videoId: string) {
            yield* makeDbCall(() =>
              db
                .update(thumbnails)
                .set({ selectedForUpload: false })
                .where(eq(thumbnails.videoId, videoId))
            );
            const [updated] = yield* makeDbCall(() =>
              db
                .update(thumbnails)
                .set({ selectedForUpload: true })
                .where(eq(thumbnails.id, thumbnailId))
                .returning()
            );
            if (!updated) {
              return yield* new NotFoundError({
                type: "selectThumbnailForUpload",
                params: { thumbnailId },
              });
            }
            return updated;
          }
        ),
        deselectAllThumbnails: Effect.fn("deselectAllThumbnails")(function* (
          videoId: string
        ) {
          yield* makeDbCall(() =>
            db
              .update(thumbnails)
              .set({ selectedForUpload: false })
              .where(eq(thumbnails.videoId, videoId))
          );
        }),
        deleteThumbnail: Effect.fn("deleteThumbnail")(function* (
          thumbnailId: string
        ) {
          const [deleted] = yield* makeDbCall(() =>
            db
              .delete(thumbnails)
              .where(eq(thumbnails.id, thumbnailId))
              .returning()
          );

          if (!deleted) {
            return yield* new NotFoundError({
              type: "deleteThumbnail",
              params: { thumbnailId },
            });
          }

          return deleted;
        }),
      };
    }),
  }
) {}
