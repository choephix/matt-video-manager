import { describe, it, expect } from "vitest";
import {
  statusForCreateLesson,
  statusForMaterialize,
  statusForConvertToGhost,
  validateStatus,
} from "./lesson-authoring-status";

describe("lesson-authoring-status", () => {
  describe("statusForCreateLesson", () => {
    it("returns 'todo' for a real lesson", () => {
      expect(statusForCreateLesson("real")).toBe("todo");
    });

    it("returns null for a ghost lesson", () => {
      expect(statusForCreateLesson("ghost")).toBeNull();
    });
  });

  describe("statusForMaterialize", () => {
    it("always returns 'todo'", () => {
      expect(statusForMaterialize()).toBe("todo");
    });
  });

  describe("statusForConvertToGhost", () => {
    it("always returns null", () => {
      expect(statusForConvertToGhost()).toBeNull();
    });
  });

  describe("validateStatus", () => {
    it("accepts real + todo", () => {
      expect(validateStatus("real", "todo")).toBe(true);
    });

    it("accepts real + done", () => {
      expect(validateStatus("real", "done")).toBe(true);
    });

    it("rejects real + null", () => {
      expect(validateStatus("real", null)).toBe(false);
    });

    it("accepts ghost + null", () => {
      expect(validateStatus("ghost", null)).toBe(true);
    });

    it("rejects ghost + todo", () => {
      expect(validateStatus("ghost", "todo")).toBe(false);
    });

    it("rejects ghost + done", () => {
      expect(validateStatus("ghost", "done")).toBe(false);
    });
  });
});
