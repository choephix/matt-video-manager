import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Returns true if the mouse event was a left-click (button === 0).
 * Use this to guard onMouseDown handlers that navigate, so that
 * right-click (context menu) and middle-click are not intercepted.
 */
export function isLeftClick(e: React.MouseEvent): boolean {
  return e.button === 0;
}
