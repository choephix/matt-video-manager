import { Console, Effect } from "effect";
import type { Route } from "./+types/api.lessons.$lessonId.create-on-disk";
import { CourseWriteService } from "@/services/course-write-service";
import { runtimeLive } from "@/services/layer.server";
import { withDatabaseDump } from "@/services/dump-service";
import { data } from "react-router";

export const action = async (args: Route.ActionArgs) => {
  const formData = await args.request.formData();
  const repoPath = formData.get("repoPath") as string | null;

  return Effect.gen(function* () {
    const courseWrite = yield* CourseWriteService;
    return yield* courseWrite.materializeGhost(
      args.params.lessonId,
      repoPath ? { repoPath } : undefined
    );
  }).pipe(
    withDatabaseDump,
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchTag("CourseRepoSyncError", (e) => {
      return Effect.succeed(data({ error: e.message }, { status: 409 }));
    }),
    Effect.catchTag("NotFoundError", () => {
      return Effect.succeed(
        data({ error: "Lesson not found" }, { status: 404 })
      );
    }),
    Effect.catchTag("CourseWriteError", (e) => {
      return Effect.succeed(data({ error: e.message }, { status: 400 }));
    }),
    Effect.catchAll(() => {
      return Effect.succeed(
        data({ error: "Internal server error" }, { status: 500 })
      );
    }),
    runtimeLive.runPromise
  );
};
