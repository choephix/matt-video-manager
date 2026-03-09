import type { Lesson } from "./course-view-types";

export function buildSectionTranscript(sectionPath: string, lessons: Lesson[]) {
  const realLessons = lessons.filter((l) => l.fsStatus !== "ghost");
  const lines: string[] = [`# ${sectionPath}`, ""];
  for (const lesson of realLessons) {
    lines.push(`## ${lesson.title || lesson.path}`, "");
    if (lesson.videos.length === 0) {
      lines.push("(no videos)", "");
      continue;
    }
    for (const video of lesson.videos) {
      lines.push(`### ${video.path}`, "");
      if (video.clips.length === 0) {
        lines.push("(no clips)", "");
        continue;
      }
      const transcript = video.clips
        .map((c) => c.text)
        .filter(Boolean)
        .join(" ");
      lines.push(transcript || "(no transcript)", "");
    }
  }
  return lines.join("\n").trimEnd();
}
