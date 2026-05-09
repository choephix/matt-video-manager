import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_PAUSE_LENGTH,
  type PauseLength,
} from "@/silence-detection-constants";

const STORAGE_KEY = "video-editor:pauseLength";

const isPauseLength = (value: unknown): value is PauseLength =>
  value === "short" || value === "long";

const readFromStorage = (): PauseLength => {
  if (typeof window === "undefined") return DEFAULT_PAUSE_LENGTH;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isPauseLength(stored) ? stored : DEFAULT_PAUSE_LENGTH;
};

export const usePauseLength = () => {
  const [pauseLength, setPauseLengthState] =
    useState<PauseLength>(DEFAULT_PAUSE_LENGTH);

  useEffect(() => {
    setPauseLengthState(readFromStorage());
  }, []);

  const setPauseLength = useCallback((next: PauseLength) => {
    setPauseLengthState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  }, []);

  return [pauseLength, setPauseLength] as const;
};
