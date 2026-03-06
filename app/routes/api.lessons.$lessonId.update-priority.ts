import { Console, Effect, Schema } from "effect";
import type { Route } from "./+types/api.lessons.$lessonId.update-priority";
import { DBFunctionsService } from "@/services/db-service.server";
import { runtimeLive } from "@/services/layer.server";
import { withDatabaseDump } from "@/services/dump-service";
import { data } from "react-router";

const updatePrioritySchema = Schema.Struct({
  priority: Schema.NumberFromString.pipe(
    Schema.filter((n) => n === 1 || n === 2 || n === 3, {
      message: () => "Priority must be 1, 2, or 3",
    })
  ),
});

export const action = async (args: Route.ActionArgs) => {
  const formData = await args.request.formData();
  const formDataObject = Object.fromEntries(formData);

  return Effect.gen(function* () {
    const { priority } =
      yield* Schema.decodeUnknown(updatePrioritySchema)(formDataObject);

    const db = yield* DBFunctionsService;

    yield* db.getLessonWithHierarchyById(args.params.lessonId);

    yield* db.updateLesson(args.params.lessonId, {
      priority,
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
