import { DBFunctionsService } from "@/services/db-service.server";
import { runtimeLive } from "@/services/layer.server";
import {
  acquireTextWritingContext,
  createModelMessagesForTextWritingAgent,
} from "@/services/text-writing-agent";
import { createDocumentWritingAgent } from "@/services/document-writing-agent";
import type { DocumentWritingAgentMode } from "@/services/document-writing-agent";
import { type UIMessage } from "ai";
import { Console, Effect, Schema } from "effect";
import type { Route } from "./+types/videos.$videoId.document-completions";
import { anthropic } from "@ai-sdk/anthropic";
import { data } from "react-router";

const courseStructureSchema = Schema.Struct({
  repoName: Schema.String,
  currentSectionPath: Schema.String,
  currentLessonPath: Schema.String,
  sections: Schema.Array(
    Schema.Struct({
      path: Schema.String,
      lessons: Schema.Array(
        Schema.Struct({
          path: Schema.String,
          description: Schema.optional(Schema.String),
        })
      ),
    })
  ),
});

const documentModeSchema = Schema.Union(
  Schema.Literal("article"),
  Schema.Literal("skill-building"),
  Schema.Literal("newsletter")
);

const chatSchema = Schema.Struct({
  messages: Schema.Any,
  enabledFiles: Schema.Array(Schema.String),
  model: Schema.String,
  mode: Schema.optionalWith(documentModeSchema, {
    default: () => "article" as const,
  }),
  document: Schema.optional(Schema.String),
  includeTranscript: Schema.optionalWith(Schema.Boolean, {
    default: () => true,
  }),
  enabledSections: Schema.optionalWith(Schema.Array(Schema.String), {
    default: () => [],
  }),
  courseStructure: Schema.optional(courseStructureSchema),
  memory: Schema.optional(Schema.String),
});

const DOCUMENT_TOOL_TYPES = new Set([
  "tool-writeDocument",
  "tool-editDocument",
]);

/**
 * Remove writeDocument/editDocument tool call parts and their
 * corresponding tool-result parts from the message history so
 * the LLM only sees the current document via <current-document>.
 */
function filterDocumentToolCalls(messages: UIMessage[]): UIMessage[] {
  // Collect toolCallIds from document tool parts
  const documentToolCallIds = new Set<string>();
  for (const msg of messages) {
    for (const part of msg.parts) {
      if (
        "type" in part &&
        DOCUMENT_TOOL_TYPES.has(part.type) &&
        "toolCallId" in part
      ) {
        documentToolCallIds.add(part.toolCallId as string);
      }
    }
  }

  if (documentToolCallIds.size === 0) return messages;

  return messages
    .map((msg) => {
      const filteredParts = msg.parts.filter((part) => {
        // Remove document tool call parts from assistant messages
        if ("type" in part && DOCUMENT_TOOL_TYPES.has(part.type)) {
          return false;
        }
        // Remove tool-result parts that correspond to document tool calls
        if (
          "type" in part &&
          part.type === "tool-result" &&
          "toolCallId" in part &&
          documentToolCallIds.has(part.toolCallId as string)
        ) {
          return false;
        }
        return true;
      });

      if (filteredParts.length === msg.parts.length) return msg;
      return { ...msg, parts: filteredParts };
    })
    .filter((msg) => msg.parts.length > 0);
}

export const action = async (args: Route.ActionArgs) => {
  const body = await args.request.json();
  const videoId = args.params.videoId;

  return Effect.gen(function* () {
    const parsed = yield* Schema.decodeUnknown(chatSchema)(body);
    const messages: UIMessage[] = parsed.messages;
    const enabledFiles: string[] = [...parsed.enabledFiles];
    const model: string =
      parsed.model === "auto"
        ? parsed.document
          ? "claude-sonnet-4-5"
          : "claude-haiku-4-5"
        : parsed.model;
    const includeTranscript = parsed.includeTranscript;
    const enabledSections: string[] = [...parsed.enabledSections];

    const videoContext = yield* acquireTextWritingContext({
      videoId,
      enabledFiles,
      includeTranscript,
      enabledSections,
    });

    const db = yield* DBFunctionsService;
    const links = yield* db.getLinks();

    let courseStructureText: string | undefined;
    if (parsed.courseStructure) {
      const cs = parsed.courseStructure;
      const lines: string[] = [`Course: ${cs.repoName}`];
      for (const section of cs.sections) {
        const isCurrent = section.path === cs.currentSectionPath;
        lines.push(
          `  ${section.path}/${isCurrent ? "  <-- current section" : ""}`
        );
        for (const lesson of section.lessons) {
          const isCurrentLesson =
            isCurrent && lesson.path === cs.currentLessonPath;
          const marker = isCurrentLesson ? "  <-- current lesson" : "";
          const desc = lesson.description ? ` - ${lesson.description}` : "";
          lines.push(`    ${lesson.path}/${marker}${desc}`);
        }
      }
      courseStructureText = lines.join("\n");
    }

    // Filter out writeDocument/editDocument tool calls from messages
    // so the only source of truth for document content is the
    // <current-document> block appended below
    const filteredMessages = filterDocumentToolCalls(messages);

    const modelMessages = yield* Effect.tryPromise(() =>
      createModelMessagesForTextWritingAgent({
        messages: filteredMessages,
        imageFiles: videoContext.imageFiles,
      })
    );

    // Append document content to last user message for prompt caching
    if (parsed.document) {
      const documentText = `\n\n<current-document>\n${parsed.document}\n</current-document>`;
      modelMessages.push({
        role: "user",
        content: documentText,
      });
    }

    const agent = createDocumentWritingAgent({
      model: anthropic(model),
      mode: parsed.mode as DocumentWritingAgentMode,
      document: parsed.document,
      transcript: videoContext.transcript,
      code: videoContext.textFiles,
      imageFiles: videoContext.imageFiles,
      sectionNames: videoContext.sectionNames,
      links,
      courseStructure: courseStructureText,
      memory: parsed.memory,
    });

    const result = yield* Effect.promise(async () => {
      const stream = await (agent.stream({
        messages: modelMessages,
      }) as Promise<{ toUIMessageStreamResponse: () => Response }>);
      return stream;
    });

    return result.toUIMessageStreamResponse();
  }).pipe(
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchTag("ParseError", () => {
      return Effect.die(data("Invalid request", { status: 400 }));
    }),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};
