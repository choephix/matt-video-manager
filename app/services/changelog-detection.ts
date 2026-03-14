export type VersionWithStructure = {
  id: string;
  name: string;
  description: string;
  createdAt: Date;
  sections: Array<{
    id: string;
    path: string;
    previousVersionSectionId: string | null;
    lessons: Array<{
      id: string;
      path: string;
      previousVersionLessonId: string | null;
      videos: Array<{
        id: string;
        path: string;
        clips: Array<{
          id: string;
          text: string;
        }>;
      }>;
    }>;
  }>;
};

type Lesson = VersionWithStructure["sections"][number]["lessons"][number];

export type VideoChange =
  | {
      type: "updated";
      videoPath: string;
      oldClips: string[];
      newClips: string[];
    }
  | { type: "new"; videoPath: string }
  | { type: "deleted"; videoPath: string };

export type VersionChanges = {
  newLessons: Array<{
    sectionPath: string;
    lessonPath: string;
    videoPaths: string[];
  }>;
  renamedSections: Array<{ oldPath: string; newPath: string }>;
  renamedLessons: Array<{
    sectionPath: string;
    oldPath: string;
    newPath: string;
  }>;
  updatedLessons: Array<{
    sectionPath: string;
    lessonPath: string;
    videoChanges: VideoChange[];
  }>;
  deletedSections: Array<{ sectionPath: string }>;
  deletedLessons: Array<{
    sectionPath: string;
    lessonPath: string;
    videoPaths: string[];
  }>;
};

function lessonHasContent(lesson: Lesson): boolean {
  return lesson.videos.some((v) => v.clips.length > 0);
}

type VideoData = { videoPath: string; clips: string[] };

type LessonLookupEntry = {
  sectionPath: string;
  lessonPath: string;
  lesson: Lesson;
  videosByPath: Map<string, VideoData>;
};

function buildLessonLookup(
  version: VersionWithStructure
): Map<string, LessonLookupEntry> {
  const lookup = new Map<string, LessonLookupEntry>();
  for (const section of version.sections) {
    for (const lesson of section.lessons) {
      const videosByPath = new Map<string, VideoData>();
      for (const video of lesson.videos) {
        videosByPath.set(video.path, {
          videoPath: video.path,
          clips: video.clips.map((c) => c.text.trim()),
        });
      }
      lookup.set(lesson.id, {
        sectionPath: section.path,
        lessonPath: lesson.path,
        lesson,
        videosByPath,
      });
    }
  }
  return lookup;
}

function getVideosWithContent(lesson: Lesson): string[] {
  return lesson.videos.filter((v) => v.clips.length > 0).map((v) => v.path);
}

function detectVideoChanges(
  currentLesson: Lesson,
  prevEntry: LessonLookupEntry
): VideoChange[] {
  const changes: VideoChange[] = [];
  const currentVideosByPath = new Map<string, string[]>();
  for (const video of currentLesson.videos) {
    currentVideosByPath.set(
      video.path,
      video.clips.map((c) => c.text.trim())
    );
  }

  for (const [videoPath, currentClips] of currentVideosByPath) {
    const prevVideo = prevEntry.videosByPath.get(videoPath);
    if (!prevVideo || prevVideo.clips.length === 0) {
      if (currentClips.length > 0) {
        changes.push({ type: "new", videoPath });
      }
    } else if (currentClips.length === 0) {
      changes.push({ type: "deleted", videoPath });
    } else {
      const oldJoined = prevVideo.clips.join(" ");
      const newJoined = currentClips.join(" ");
      if (oldJoined !== newJoined) {
        changes.push({
          type: "updated",
          videoPath,
          oldClips: prevVideo.clips,
          newClips: currentClips,
        });
      }
    }
  }

  for (const [videoPath, prevVideo] of prevEntry.videosByPath) {
    if (!currentVideosByPath.has(videoPath) && prevVideo.clips.length > 0) {
      changes.push({ type: "deleted", videoPath });
    }
  }

  return changes;
}

function buildSectionLookup(
  version: VersionWithStructure
): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const section of version.sections) {
    lookup.set(section.id, section.path);
  }
  return lookup;
}

function stripNumericPrefix(path: string): string {
  return path.replace(/^[\d.]+-/, "");
}

function hasNameChanged(oldPath: string, newPath: string): boolean {
  return stripNumericPrefix(oldPath) !== stripNumericPrefix(newPath);
}

export function detectChanges(
  currentVersion: VersionWithStructure,
  previousVersion: VersionWithStructure | undefined
): VersionChanges | null {
  if (!previousVersion) {
    return null;
  }

  const changes: VersionChanges = {
    newLessons: [],
    renamedSections: [],
    renamedLessons: [],
    updatedLessons: [],
    deletedSections: [],
    deletedLessons: [],
  };

  const prevLessonLookup = buildLessonLookup(previousVersion);
  const prevSectionLookup = buildSectionLookup(previousVersion);
  const renamedSectionIds = new Set<string>();

  for (const section of currentVersion.sections) {
    if (section.previousVersionSectionId) {
      const prevSectionPath = prevSectionLookup.get(
        section.previousVersionSectionId
      );
      if (prevSectionPath && hasNameChanged(prevSectionPath, section.path)) {
        if (!renamedSectionIds.has(section.previousVersionSectionId)) {
          changes.renamedSections.push({
            oldPath: prevSectionPath,
            newPath: section.path,
          });
          renamedSectionIds.add(section.previousVersionSectionId);
        }
      }
    }

    for (const lesson of section.lessons) {
      const currentHasContent = lessonHasContent(lesson);

      if (!lesson.previousVersionLessonId) {
        if (currentHasContent) {
          changes.newLessons.push({
            sectionPath: section.path,
            lessonPath: lesson.path,
            videoPaths: getVideosWithContent(lesson),
          });
        }
      } else {
        const prevLesson = prevLessonLookup.get(lesson.previousVersionLessonId);
        if (!prevLesson) {
          if (currentHasContent) {
            changes.newLessons.push({
              sectionPath: section.path,
              lessonPath: lesson.path,
              videoPaths: getVideosWithContent(lesson),
            });
          }
        } else {
          const prevHadContent = lessonHasContent(prevLesson.lesson);

          if (!prevHadContent && currentHasContent) {
            changes.newLessons.push({
              sectionPath: section.path,
              lessonPath: lesson.path,
              videoPaths: getVideosWithContent(lesson),
            });
          } else if (prevHadContent && !currentHasContent) {
            changes.deletedLessons.push({
              sectionPath: section.path,
              lessonPath: prevLesson.lessonPath,
              videoPaths: [...prevLesson.videosByPath.entries()]
                .filter(([, v]) => v.clips.length > 0)
                .map(([p]) => p),
            });
          } else if (prevHadContent && currentHasContent) {
            if (hasNameChanged(prevLesson.lessonPath, lesson.path)) {
              changes.renamedLessons.push({
                sectionPath: section.path,
                oldPath: prevLesson.lessonPath,
                newPath: lesson.path,
              });
            }

            const videoChanges = detectVideoChanges(lesson, prevLesson);
            if (videoChanges.length > 0) {
              changes.updatedLessons.push({
                sectionPath: section.path,
                lessonPath: lesson.path,
                videoChanges,
              });
            }
          }
        }
      }
    }
  }

  const referencedSectionIds = new Set<string>();
  const referencedLessonIds = new Set<string>();

  for (const section of currentVersion.sections) {
    if (section.previousVersionSectionId) {
      referencedSectionIds.add(section.previousVersionSectionId);
    }
    for (const lesson of section.lessons) {
      if (lesson.previousVersionLessonId) {
        referencedLessonIds.add(lesson.previousVersionLessonId);
      }
    }
  }

  for (const prevSection of previousVersion.sections) {
    if (!referencedSectionIds.has(prevSection.id)) {
      changes.deletedSections.push({ sectionPath: prevSection.path });
    } else {
      for (const prevLesson of prevSection.lessons) {
        if (
          !referencedLessonIds.has(prevLesson.id) &&
          lessonHasContent(prevLesson)
        ) {
          changes.deletedLessons.push({
            sectionPath: prevSection.path,
            lessonPath: prevLesson.path,
            videoPaths: getVideosWithContent(prevLesson),
          });
        }
      }
    }
  }

  return changes;
}
