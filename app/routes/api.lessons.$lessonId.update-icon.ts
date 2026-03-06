import { Console, Effect, Schema } from "effect";
import type { Route } from "./+types/api.lessons.$lessonId.update-icon";
import { DBFunctionsService } from "@/services/db-service.server";
import { runtimeLive } from "@/services/layer.server";
import { withDatabaseDump } from "@/services/dump-service";
import { data } from "react-router";

const updateIconSchema = Schema.Struct({
  icon: Schema.Literal("watch", "code", "discussion"),
});

export const action = async (args: Route.ActionArgs) => {
  const formData = await args.request.formData();
  const formDataObject = Object.fromEntries(formData);

  return Effect.gen(function* () {
    const { icon } =
      yield* Schema.decodeUnknown(updateIconSchema)(formDataObject);

    const db = yield* DBFunctionsService;

    yield* db.getLessonWithHierarchyById(args.params.lessonId);

    yield* db.updateLesson(args.params.lessonId, {
      icon,
    });

    return { success: true };
  }).pipe(
    withDatabaseDump,
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchTag("ParseError", () => {
      return Effect.die(data("Invalid request", { status: 400 }));
    }),
    Effect.catchTag("NotFoundError", () => {
      return Effect.die(data("Lesson not found", { status: 404 }));
    }),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};
