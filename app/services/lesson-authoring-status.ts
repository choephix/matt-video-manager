export type AuthoringStatus = "todo" | "done";
export type FsStatus = "ghost" | "real";

export function statusForCreateLesson(
  fsStatus: FsStatus
): AuthoringStatus | null {
  return fsStatus === "real" ? "todo" : null;
}

export function statusForMaterialize(): AuthoringStatus {
  return "todo";
}

export function statusForConvertToGhost(): null {
  return null;
}

export function validateStatus(
  fsStatus: FsStatus,
  authoringStatus: AuthoringStatus | null
): boolean {
  if (fsStatus === "real") return authoringStatus !== null;
  return authoringStatus === null;
}
