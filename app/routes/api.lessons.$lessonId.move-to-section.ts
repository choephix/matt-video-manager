import { Console, Effect, Schema } from "effect";
import type { Route } from "./+types/api.lessons.$lessonId.move-to-section";
import { DBFunctionsService } from "@/services/db-service.server";
import { runtimeLive } from "@/services/layer.server";
import { withDatabaseDump } from "@/services/dump-service";
import { data } from "react-router";

const moveLessonSchema = Schema.Struct({
  sectionId: Schema.String.pipe(
    Schema.minLength(1, { message: () => "Section ID is required" })
  ),
});

export const action = async (args: Route.ActionArgs) => {
  const formData = await args.request.formData();
  const formDataObject = Object.fromEntries(formData);

  return Effect.gen(function* () {
    const { sectionId } =
      yield* Schema.decodeUnknown(moveLessonSchema)(formDataObject);

    const db = yield* DBFunctionsService;

    // Verify lesson exists
    yield* db.getLessonWithHierarchyById(args.params.lessonId);

    // Get lessons in target section to determine order
    const targetLessons = yield* db.getLessonsBySectionId(sectionId);
    const maxOrder =
      targetLessons.length > 0
        ? Math.max(...targetLessons.map((l) => l.order))
        : -1;

    // Move lesson to target section at the bottom
    yield* db.updateLesson(args.params.lessonId, {
      sectionId,
      lessonNumber: maxOrder + 1,
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
