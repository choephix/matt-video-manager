# Research: Extracting Functionality from total-typescript-monorepo

## Goal

Identify the exact functions and types needed to bring two capabilities into course-video-manager as first-class code (instead of shelling out to the `tt` CLI):

1. **Transcript clips logic** - detecting speaking clips from silence analysis
2. **Creating a file from clips** - concatenating video/audio clips via ffmpeg

## Current Architecture

### How course-video-manager uses the TT monorepo today

`TotalTypeScriptCLIService` (`app/services/tt-cli-service.ts`) shells out to the globally-installed `tt` binary via `@effect/platform` `Command.make()`. It calls these commands:

| Command                                | Purpose                                    |
| -------------------------------------- | ------------------------------------------ |
| `tt clips detect [filePath]`           | Detect speaking clip boundaries in a video |
| `tt clips transcribe <json>`           | Transcribe clips via OpenAI Whisper        |
| `tt queue from-clips <clips> <name>`   | Queue video creation from clip array       |
| `tt resolve send-clips <clips> <name>` | Send clips to DaVinci Resolve              |

The `tt` CLI lives at `~/repos/ts/total-typescript-monorepo/apps/internal-cli`. It delegates to the `@total-typescript/ffmpeg` package (`packages/ffmpeg/`) which contains all the real logic.

### Dependency chain

```
course-video-manager
  └── TotalTypeScriptCLIService (shells out to `tt`)
        └── tt CLI (apps/internal-cli)
              └── @total-typescript/ffmpeg (packages/ffmpeg)
                    └── @total-typescript/shared (packages/shared)
```

---

## Capability 1: Transcript Clips Logic

### What it does

Takes a video file, runs ffmpeg silence detection, and returns an array of speaking clip boundaries (start time + duration).

### Key files in TT monorepo

| File                     | Path                                             | Purpose                                                              |
| ------------------------ | ------------------------------------------------ | -------------------------------------------------------------------- |
| **silence-detection.ts** | `packages/ffmpeg/src/silence-detection.ts`       | Core logic - parses ffmpeg silencedetect output into clip boundaries |
| **constants.ts**         | `packages/ffmpeg/src/constants.ts`               | Tuning parameters for silence detection                              |
| **video-clip-types.ts**  | `packages/ffmpeg/src/video-clip-types.ts`        | Type definitions for clips                                           |
| **workflows.ts**         | `packages/ffmpeg/src/workflows.ts`               | `findClips()` method - orchestrates silence detection                |
| **ffmpeg-commands.ts**   | `packages/ffmpeg/src/ffmpeg-commands.ts`         | `detectSilence()` and `getFPS()` methods                             |
| **detect.ts**            | `apps/internal-cli/src/commands/clips/detect.ts` | CLI entry point that calls `findClips()`                             |

### Core function: `getClipsOfSpeakingFromFFmpeg()`

Location: `packages/ffmpeg/src/silence-detection.ts:14`

Pure function (no side effects). Takes raw ffmpeg silencedetect stdout and returns clip boundaries.

**Input:** Raw ffmpeg stdout string + `{ startPadding, endPadding, fps }`

**Output:** Array of `{ startFrame, endFrame, startTime, endTime, silenceEnd, durationInFrames }`

**Algorithm:**

1. Parses `[silencedetect @` lines from ffmpeg output
2. Extracts silence_start/silence_end timestamps and durations
3. Derives speaking clips as the gaps between silence periods
4. Applies frame-based start/end padding
5. Returns clips with both time-based and frame-based coordinates

### Core function: `findSilenceInVideo()`

Location: `packages/ffmpeg/src/silence-detection.ts:104`

Effect-based wrapper that runs ffmpeg and calls `getClipsOfSpeakingFromFFmpeg()`.

**Dependencies:**

- `FFmpegCommandsService.detectSilence()` - runs the actual ffmpeg command
- Constants from `constants.ts`

**Signature:**

```typescript
findSilenceInVideo(
  inputVideo: AbsolutePath,
  opts: {
    threshold: number | string;      // dB threshold (default: -38)
    silenceDuration: number | string; // min silence seconds (default: 0.8)
    startPadding: number;             // frames to add before clip (default: 0)
    endPadding: number;               // frames to add after clip (default: 0.08)
    fps: number;
    ffmpeg: FFmpegCommandsService;
    startTime?: number;               // optional offset into video
  }
) => Effect<{ speakingClips: Clip[], rawStdout: string }>
```

### Orchestrator: `WorkflowsService.findClips()`

Location: `packages/ffmpeg/src/workflows.ts:333`

Combines `getFPS()` + `findSilenceInVideo()` + post-processing:

1. Gets video FPS via ffprobe
2. Calls `findSilenceInVideo()` with configured constants
3. Converts frame-based durations back to seconds (rounded to 2dp)
4. For "entire-video" mode: adds `AUTO_EDITED_VIDEO_FINAL_END_PADDING` to last clip
5. Returns `{ startTime, duration }[]`

### Constants (tuning parameters)

From `packages/ffmpeg/src/constants.ts`:

```typescript
THRESHOLD = -38; // dB - lower = more speaking detected
SILENCE_DURATION = 0.8; // minimum silence gap in seconds
AUTO_EDITED_START_PADDING = 0; // padding before each clip
AUTO_EDITED_END_PADDING = 0.08; // padding after each clip
AUTO_EDITED_VIDEO_FINAL_END_PADDING = 0.5; // extra padding for final clip
LONG_BEAT_DURATION = 0.18; // duration of a "long beat" between clips
MINIMUM_CLIP_LENGTH_IN_SECONDS = 1; // clips shorter than this are discarded
```

### FFmpeg command used for silence detection

From `FFmpegCommandsService.detectSilence()` (`packages/ffmpeg/src/ffmpeg-commands.ts:503`):

```bash
ffmpeg -hide_banner -vn [-ss "<startTime>"] -i "<inputVideo>" \
  -af "silencedetect=n=<threshold>dB:d=<silenceDuration>" \
  -f null - 2>&1
```

### FFmpeg command used for FPS detection

From `FFmpegCommandsService.getFPS()` (`packages/ffmpeg/src/ffmpeg-commands.ts:181`):

```bash
ffprobe -v error -select_streams v:0 \
  -show_entries stream=r_frame_rate \
  -of default=noprint_wrappers=1:nokey=1 "<inputVideo>"
```

### What the `tt clips detect` CLI command returns

From `apps/internal-cli/src/commands/clips/detect.ts:59`:

```json
{
  "clips": [
    {
      "startTime": 1.23,
      "endTime": 4.56,
      "inputVideo": "/path/to/video.mp4"
    }
  ]
}
```

Note: The CLI converts `{ startTime, duration }` to `{ startTime, endTime }` before returning.

### What to extract for testing

To unit test the transcript clips logic, you primarily need `getClipsOfSpeakingFromFFmpeg()` - it's a pure function that takes a string and returns clip boundaries. The only dependency is the `MINIMUM_CLIP_LENGTH_IN_SECONDS` constant (used in the caller `findSilenceInVideo()`, not in the function itself).

**Testable without ffmpeg:**

- `getClipsOfSpeakingFromFFmpeg()` - pass it sample ffmpeg output strings

**Requires ffmpeg (integration test):**

- `findSilenceInVideo()` - needs `FFmpegCommandsService.detectSilence()`
- `findClips()` - needs both `detectSilence()` and `getFPS()`

---

## Capability 2: Creating a File from Clips

### What it does

Takes an array of clips (each with inputVideo, startTime, duration, beatType) and creates a single concatenated video file using ffmpeg.

### Key files in TT monorepo

| File                    | Path                                                 | Purpose                                      |
| ----------------------- | ---------------------------------------------------- | -------------------------------------------- |
| **ffmpeg-commands.ts**  | `packages/ffmpeg/src/ffmpeg-commands.ts`             | All ffmpeg operations                        |
| **workflows.ts**        | `packages/ffmpeg/src/workflows.ts`                   | `createVideoFromClipsWorkflow()` and helpers |
| **video-clip-types.ts** | `packages/ffmpeg/src/video-clip-types.ts`            | `ClipWithMetadata` and `BeatType` types      |
| **from-clips.ts**       | `apps/internal-cli/src/commands/queue/from-clips.ts` | CLI entry point                              |

### Core function: `createAndConcatenateVideoClipsSinglePass()`

Location: `packages/ffmpeg/src/ffmpeg-commands.ts:366`

**The most important function for video creation.** Takes clips and produces a single output video in one ffmpeg pass.

**Input:**

```typescript
clips: readonly {
  inputVideo: AbsolutePath;
  startTime: number;
  duration: number;
  beatType: BeatType;        // "none" | "long"
  mode?: "default" | "portrait-zoom";
}[]
```

**Output:** `AbsolutePath` to the created video file (in a temp directory)

**What it does:**

1. Builds per-clip `-ss <start> -t <duration> -i "<path>"` input args
2. For "long" beats: extends duration by `LONG_BEAT_DURATION` (0.18s)
3. For "portrait-zoom" mode: applies `scale=iw*1.2:ih*1.2,crop=1920:1080:120:100`
4. Builds a complex filter: `setpts=PTS-STARTPTS` per stream, then `concat=n=N:v=1:a=1`
5. Encodes with GPU acceleration (h264_nvenc)

**FFmpeg command:**

```bash
ffmpeg -y -hide_banner \
  -ss <start1> -t <dur1> -i "<video1>" \
  -ss <start2> -t <dur2> -i "<video2>" ... \
  -filter_complex "[0:v]setpts=PTS-STARTPTS[v0];[0:a]asetpts=PTS-STARTPTS[a0]; \
    [1:v]setpts=PTS-STARTPTS[v1];[1:a]asetpts=PTS-STARTPTS[a1]; ... \
    [v0][a0][v1][a1]...concat=n=N:v=1:a=1[outv][outa]" \
  -map "[outv]" -map "[outa]" \
  -c:v h264_nvenc -preset slow -rc:v vbr -cq:v 19 \
  -b:v 15387k -maxrate 20000k -bufsize 30000k \
  -fps_mode cfr -r 60 \
  -c:a aac -ar 48000 -b:a 320k \
  -async 1 -movflags +faststart \
  "<output.mp4>"
```

### Supporting function: `normalizeAudio()`

Location: `packages/ffmpeg/src/ffmpeg-commands.ts:263`

Called after concatenation to normalize audio levels and fix audio/video drift.

**What it does:**

1. Measures video stream duration and audio stream duration separately
2. Calculates stretch factor (`videoDuration / audioDuration`)
3. Applies `atempo` filter if drift > 10ms
4. Always applies `loudnorm=I=-16:TP=-1.5:LRA=11`

### Orchestrator: `createVideoFromClipsWorkflow()`

Location: `packages/ffmpeg/src/workflows.ts:445`

Full workflow:

1. Forks video creation (`createAutoEditedVideo` -> `createAndConcatenateVideoClipsSinglePass` + `normalizeAudio`)
2. If shorts requested: also creates audio track, transcribes, renders subtitles with Remotion, overlays
3. Copies output to export directory

### Simpler path: `createAutoEditedVideo()`

Location: `packages/ffmpeg/src/workflows.ts:418`

Just the video creation without shorts/subtitles:

1. `createAndConcatenateVideoClipsSinglePass(clips)`
2. `normalizeAudio(concatenatedVideoPath)`

### Other relevant ffmpeg operations

| Method                    | Location (line) | Purpose                                                       |
| ------------------------- | --------------- | ------------------------------------------------------------- |
| `trimVideo()`             | :244            | Trims video with `-ss -to -c copy` (fast, no re-encode)       |
| `concatenateVideoClips()` | :427            | Alternative concat via concat demuxer (for pre-trimmed files) |
| `createAudioClip()`       | :343            | Extracts audio segment from video                             |
| `concatenateAudioClips()` | :464            | Joins audio files via concat demuxer                          |
| `extractAudioFromVideo()` | :317            | Full audio extraction to MP3 (384k)                           |
| `overlaySubtitles()`      | :486            | Overlays subtitle track on video                              |

### Concurrency control

The FFmpegCommandsService uses Effect semaphores:

- `gpuAcceleratedMutex` (6 permits) - for GPU-encoded operations (h264_nvenc)
- `cpuMutex` (12 permits) - for CPU-bound operations
- `transcriptionMutex` (20 permits) - for Whisper API calls
- `remotionMutex` (1 permit) - for Remotion rendering

---

## Types to Extract

### From `packages/ffmpeg/src/video-clip-types.ts`

```typescript
type BeatType = "none" | "long";

type ClipWithMetadata = {
  startTime: number;
  duration: number;
  inputVideo: AbsolutePath;
  beatType: BeatType;
};

type VideoClip = {
  sourceVideoPath: AbsolutePath;
  sourceVideoStartTime: number;
  sourceVideoEndTime: number;
};
```

### From `packages/shared/src/types.ts`

```typescript
type AbsolutePath = Brand<string, "AbsolutePath">;
```

This is a branded string type. course-video-manager would need its own branded type or use plain strings.

---

## Shared Utilities Used

### `execAsync()` from `packages/shared/src/utils.ts`

Simple Effect wrapper around Node's `child_process.exec`:

```typescript
const execAsync = (command: string, opts?: ExecOptions) =>
  Effect.tryPromise(
    () =>
      new Promise((resolve, reject) => {
        exec(command, opts, (e, stdout, stderr) => {
          if (e) reject(e);
          resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
        });
      })
  ).pipe(Effect.mapError((e) => e as ExecException));
```

---

## Transcription (Capability used by both flows)

### `getSubtitlesForClips()`

Location: `packages/ffmpeg/src/workflows.ts:207`

1. Extracts audio from each unique input video
2. Creates audio clips for each clip's time range
3. Transcribes each audio clip via OpenAI Whisper
4. Returns `{ segments: {start, end, text}[], words: {start, end, text}[] }` per clip

### `createSubtitleFromAudio()`

Location: `packages/ffmpeg/src/ffmpeg-commands.ts:110`

Calls OpenAI Whisper API with `timestamp_granularities: ["segment", "word"]`.

### `transcribeAudio()`

Location: `packages/ffmpeg/src/ffmpeg-commands.ts:148`

Simpler transcription - just returns text, no timing.

---

## Summary: What to Extract

### For clip detection (testable):

1. `getClipsOfSpeakingFromFFmpeg()` - pure function, ~90 lines
2. `findSilenceInVideo()` - Effect wrapper, ~50 lines
3. Constants: `THRESHOLD`, `SILENCE_DURATION`, `AUTO_EDITED_START_PADDING`, `AUTO_EDITED_END_PADDING`, `AUTO_EDITED_VIDEO_FINAL_END_PADDING`, `MINIMUM_CLIP_LENGTH_IN_SECONDS`
4. The `findClips()` orchestrator from WorkflowsService, ~60 lines

### For creating a file from clips:

1. `createAndConcatenateVideoClipsSinglePass()` - ~60 lines
2. `normalizeAudio()` - ~50 lines
3. `LONG_BEAT_DURATION` constant
4. Supporting: `getFPS()`, `detectSilence()`, `trimVideo()`
5. Optional: `concatenateVideoClips()`, `concatenateAudioClips()`, `extractAudioFromVideo()`, `createAudioClip()`

### Shared infrastructure:

1. `execAsync()` utility
2. `AbsolutePath` branded type
3. Semaphore-based concurrency control pattern
4. Effect error types (`CouldNotDetectSilenceError`, etc.)

### Total extraction size

~400-500 lines of core logic (excluding the queue system, article generation, DaVinci Resolve integration, OBS integration, and Remotion rendering which are not needed).
