import { describe, expect, it } from "vitest";
import { uploadReducer, createInitialUploadState } from "./upload-reducer";

const reduce = (state: uploadReducer.State, action: uploadReducer.Action) =>
  uploadReducer(state, action);

const createState = (
  overrides: Partial<uploadReducer.State> = {}
): uploadReducer.State => ({
  ...createInitialUploadState(),
  ...overrides,
});

const createDropboxPublishEntry = (
  overrides: Partial<
    Omit<uploadReducer.DropboxPublishUploadEntry, "uploadType">
  > = {}
): uploadReducer.DropboxPublishUploadEntry => ({
  uploadId: "upload-1",
  videoId: "",
  title: "My Course",
  progress: 0,
  status: "uploading",
  uploadType: "dropbox-publish",
  errorMessage: null,
  retryCount: 0,
  dependsOn: null,
  missingVideoCount: null,
  ...overrides,
});

describe("START_UPLOAD with dropbox-publish type", () => {
  it("should add a new dropbox-publish entry", () => {
    const state = reduce(createState(), {
      type: "START_UPLOAD",
      uploadId: "upload-1",
      videoId: "",
      title: "My Course",
      uploadType: "dropbox-publish",
    });

    expect(state.uploads["upload-1"]).toEqual({
      uploadId: "upload-1",
      videoId: "",
      title: "My Course",
      progress: 0,
      status: "uploading",
      uploadType: "dropbox-publish",
      errorMessage: null,
      retryCount: 0,
      dependsOn: null,
      missingVideoCount: null,
    });
  });
});

describe("UPDATE_PROGRESS with dropbox-publish", () => {
  it("should update progress for a dropbox-publish entry", () => {
    const state = reduce(
      createState({
        uploads: { "upload-1": createDropboxPublishEntry() },
      }),
      { type: "UPDATE_PROGRESS", uploadId: "upload-1", progress: 50 }
    );

    expect(state.uploads["upload-1"]!.progress).toBe(50);
  });
});

describe("UPDATE_DROPBOX_PUBLISH_MISSING_COUNT", () => {
  it("should set missingVideoCount on a dropbox-publish entry", () => {
    const state = reduce(
      createState({
        uploads: { "upload-1": createDropboxPublishEntry() },
      }),
      {
        type: "UPDATE_DROPBOX_PUBLISH_MISSING_COUNT",
        uploadId: "upload-1",
        missingVideoCount: 3,
      }
    );

    const upload = state.uploads["upload-1"]!;
    expect(
      upload.uploadType === "dropbox-publish" && upload.missingVideoCount
    ).toBe(3);
  });

  it("should not modify state for non-existent upload", () => {
    const initial = createState();
    const state = reduce(initial, {
      type: "UPDATE_DROPBOX_PUBLISH_MISSING_COUNT",
      uploadId: "non-existent",
      missingVideoCount: 1,
    });

    expect(state).toBe(initial);
  });

  it("should not modify state for non-dropbox-publish upload", () => {
    const initial = createState({
      uploads: {
        "upload-1": {
          uploadId: "upload-1",
          videoId: "video-1",
          title: "Test",
          progress: 0,
          status: "uploading",
          uploadType: "youtube",
          youtubeVideoId: null,
          errorMessage: null,
          retryCount: 0,
          dependsOn: null,
        },
      },
    });
    const state = reduce(initial, {
      type: "UPDATE_DROPBOX_PUBLISH_MISSING_COUNT",
      uploadId: "upload-1",
      missingVideoCount: 1,
    });

    expect(state).toBe(initial);
  });
});

describe("UPLOAD_SUCCESS with dropbox-publish", () => {
  it("should mark dropbox-publish entry as success", () => {
    const state = reduce(
      createState({
        uploads: {
          "upload-1": createDropboxPublishEntry({ progress: 80 }),
        },
      }),
      { type: "UPLOAD_SUCCESS", uploadId: "upload-1" }
    );

    const upload = state.uploads["upload-1"]!;
    expect(upload.status).toBe("success");
    expect(upload.progress).toBe(100);
  });
});

describe("UPLOAD_ERROR with dropbox-publish", () => {
  it("should retry on first failure", () => {
    const state = reduce(
      createState({
        uploads: {
          "upload-1": createDropboxPublishEntry({ retryCount: 0 }),
        },
      }),
      {
        type: "UPLOAD_ERROR",
        uploadId: "upload-1",
        errorMessage: "Network error",
      }
    );

    const upload = state.uploads["upload-1"]!;
    expect(upload.status).toBe("retrying");
    expect(upload.retryCount).toBe(1);
  });

  it("should fail after 3 retries", () => {
    const state = reduce(
      createState({
        uploads: {
          "upload-1": createDropboxPublishEntry({ retryCount: 2 }),
        },
      }),
      {
        type: "UPLOAD_ERROR",
        uploadId: "upload-1",
        errorMessage: "Network error",
      }
    );

    const upload = state.uploads["upload-1"]!;
    expect(upload.status).toBe("error");
    expect(upload.errorMessage).toBe("Network error");
  });
});

describe("RETRY with dropbox-publish", () => {
  it("should reset dropbox-publish entry for retry", () => {
    const state = reduce(
      createState({
        uploads: {
          "upload-1": createDropboxPublishEntry({
            status: "retrying",
            retryCount: 1,
            progress: 50,
          }),
        },
      }),
      { type: "RETRY", uploadId: "upload-1" }
    );

    const upload = state.uploads["upload-1"]!;
    expect(upload.status).toBe("uploading");
    expect(upload.progress).toBe(0);
    expect(upload.uploadType).toBe("dropbox-publish");
    if (upload.uploadType === "dropbox-publish") {
      expect(upload.missingVideoCount).toBeNull();
    }
  });
});

describe("DISMISS with dropbox-publish", () => {
  it("should remove dropbox-publish entry", () => {
    const state = reduce(
      createState({
        uploads: {
          "upload-1": createDropboxPublishEntry({ status: "success" }),
        },
      }),
      { type: "DISMISS", uploadId: "upload-1" }
    );

    expect(state.uploads["upload-1"]).toBeUndefined();
  });
});
