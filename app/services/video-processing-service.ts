import { Command, FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Config, Data, Effect, Option, Schema } from "effect";
import crypto from "node:crypto";
import path from "node:path";
import { tmpdir } from "os";
import { FFmpegCommandsService } from "./ffmpeg-commands";
import { findSilenceInVideo } from "./silence-detection";

export type BeatType = "none" | "long";

const transcribeClipsSchema = Schema.Array(
  Schema.Struct({
    id: Schema.String,
    words: Schema.Array(
      Schema.Struct({
        start: Schema.Number,
        end: Schema.Number,
        text: Schema.String,
      })
    ),
    segments: Schema.Array(
      Schema.Struct({
        start: Schema.Number,
        end: Schema.Number,
        text: Schema.String,
      })
    ),
  })
);

class CouldNotParseJsonError extends Data.TaggedError(
  "CouldNotParseJsonError"
)<{
  cause: unknown;
  message: string;
}> {}

export class VideoProcessingService extends Effect.Service<VideoProcessingService>()(
  "VideoProcessingService",
  {
    effect: Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const ffmpegCommands = yield* FFmpegCommandsService;

      const getLatestOBSVideoClips = Effect.fn("getLatestOBSVideoClips")(
        function* (opts: {
          filePath: string | undefined;
          startTime: number | undefined;
        }) {
          if (!opts.filePath) {
            // Without a file path, fall back to the most recent OBS recording.
            const obsDir = yield* Config.string("OBS_RECORDING_DIR").pipe(
              Effect.orElseSucceed(() =>
                path.join(require("os").homedir(), "Videos")
              )
            );

            // Find the most recent .mp4 file
            const files = yield* fs.readDirectory(obsDir);
            const mp4Files = files.filter((f) => f.endsWith(".mp4"));
            if (mp4Files.length === 0) {
              return {
                clips: [] as {
                  inputVideo: string;
                  startTime: number;
                  endTime: number;
                }[],
              };
            }

            // Sort by modification time (most recent first)
            const filesWithStats = yield* Effect.forEach(mp4Files, (file) =>
              Effect.gen(function* () {
                const fullPath = path.join(obsDir, file);
                const stat = yield* fs.stat(fullPath);
                const mtimeMs = Option.match(stat.mtime, {
                  onNone: () => 0,
                  onSome: (d) => d.getTime(),
                });
                return { file: fullPath, mtimeMs };
              })
            );
            filesWithStats.sort((a, b) => b.mtimeMs - a.mtimeMs);

            const latestFile = filesWithStats[0]!.file;
            return yield* findSilenceInVideo(ffmpegCommands, latestFile, {
              startTime: opts.startTime,
            });
          }

          return yield* findSilenceInVideo(ffmpegCommands, opts.filePath, {
            startTime: opts.startTime,
          });
        }
      );

      const exportVideoClips = Effect.fn("exportVideoClips")(function* (opts: {
        videoId: string;
        clips: {
          inputVideo: string;
          startTime: number;
          duration: number;
          beatType: BeatType;
        }[];
        shortsDirectoryOutputName: string | undefined;
      }) {
        const FINISHED_VIDEOS_DIRECTORY = yield* Config.string(
          "FINISHED_VIDEOS_DIRECTORY"
        );

        // Create concatenated video using native FFmpeg
        const concatenatedPath =
          yield* ffmpegCommands.createAndConcatenateVideoClipsSinglePass(
            opts.clips
          );

        // Normalize audio
        const normalizedPath =
          yield* ffmpegCommands.normalizeAudio(concatenatedPath);

        // Move to final location
        const outputPath = path.join(
          FINISHED_VIDEOS_DIRECTORY,
          `${opts.videoId}.mp4`
        );

        yield* fs.makeDirectory(path.dirname(outputPath), { recursive: true });
        yield* fs.rename(normalizedPath, outputPath);

        // Clean up intermediate file
        yield* fs
          .remove(concatenatedPath)
          .pipe(Effect.catchAll(() => Effect.void));

        return outputPath;
      });

      const transcribeClips = Effect.fn("transcribeClips")(function* (
        clips: {
          id: string;
          inputVideo: string;
          startTime: number;
          duration: number;
        }[]
      ) {
        const command = Command.make(
          "tt",
          "clips",
          "transcribe",
          JSON.stringify(clips)
        );
        const result = yield* Command.string(command);
        const parsed = yield* Effect.try({
          try: () => JSON.parse(result.trim()),
          catch: (e) =>
            new CouldNotParseJsonError({
              cause: e,
              message: `Could not parse JSON from transcribe-clips: ${result}`,
            }),
        });
        return yield* Schema.decodeUnknown(transcribeClipsSchema)(parsed);
      });

      const getLastFrame = Effect.fn("getLastFrame")(function* (
        inputVideo: string,
        seekTo: number
      ) {
        const inputHash = crypto
          .createHash("sha256")
          .update(inputVideo + seekTo.toFixed(2))
          .digest("hex")
          .slice(0, 10);

        const folder = path.join(tmpdir(), "tt-cli-images");
        yield* fs.makeDirectory(folder, { recursive: true });

        const outputFile = path.join(folder, `${inputHash}.png`);

        const outputFileExists = yield* fs.exists(outputFile);

        if (outputFileExists) {
          return outputFile;
        }

        const command = Command.make(
          "ffmpeg",
          "-ss",
          seekTo.toFixed(2),
          "-i",
          inputVideo,
          "-frames:v",
          "1",
          outputFile
        );
        yield* Command.exitCode(command);

        return outputFile;
      });

      const getFirstFrame = Effect.fn("getFirstFrame")(function* (
        inputVideo: string,
        seekTo: number
      ) {
        const inputHash = crypto
          .createHash("sha256")
          .update("first-" + inputVideo + seekTo.toFixed(2))
          .digest("hex")
          .slice(0, 10);

        const folder = path.join(tmpdir(), "tt-cli-images");
        yield* fs.makeDirectory(folder, { recursive: true });

        const outputFile = path.join(folder, `${inputHash}.png`);

        const outputFileExists = yield* fs.exists(outputFile);

        if (outputFileExists) {
          return outputFile;
        }

        const command = Command.make(
          "ffmpeg",
          "-ss",
          seekTo.toFixed(2),
          "-i",
          inputVideo,
          "-frames:v",
          "1",
          outputFile
        );
        yield* Command.exitCode(command);

        return outputFile;
      });

      const sendClipsToDavinciResolve = Effect.fn("sendClipsToDavinciResolve")(
        function* (opts: {
          timelineName: string;
          clips: {
            inputVideo: string;
            startTime: number;
            duration: number;
          }[];
        }) {
          const command = Command.make(
            "tt",
            "resolve",
            "send-clips",
            JSON.stringify(opts.clips),
            opts.timelineName
          );
          const result = yield* Command.string(command);
          return result;
        }
      );

      return {
        getLatestOBSVideoClips,
        exportVideoClips,
        transcribeClips,
        getLastFrame,
        getFirstFrame,
        sendClipsToDavinciResolve,
      };
    }),
    dependencies: [NodeContext.layer, FFmpegCommandsService.Default],
  }
) {}
