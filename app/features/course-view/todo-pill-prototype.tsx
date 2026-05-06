// PROTOTYPE — throwaway. Renders 3 placement variants of the Lesson
// Authoring Status TODO pill on the real course view page, gated by
// ?variant=A|B|C. Uses a deterministic fake status derived from the
// lesson id (the real authoringStatus column doesn't exist yet).
// Delete this file and remove call sites once a winner is chosen.

import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

const VARIANTS = ["off", "A", "B", "C"] as const;
export type TodoPillVariant = (typeof VARIANTS)[number];

const VARIANT_NAMES: Record<TodoPillVariant, string> = {
  off: "Off (no pill)",
  A: "Trailing text pill",
  B: "Left ribbon",
  C: "Dim done + hover label",
};

export function useTodoPillVariant(): TodoPillVariant {
  const [params] = useSearchParams();
  const raw = params.get("variant") ?? "off";
  return (
    VARIANTS.includes(raw as TodoPillVariant) ? raw : "off"
  ) as TodoPillVariant;
}

// Deterministic fake: ~half the lessons are todo, stable per id.
export function fakeIsTodo(lessonId: string): boolean {
  let h = 0;
  for (let i = 0; i < lessonId.length; i++)
    h = (h * 31 + lessonId.charCodeAt(i)) | 0;
  return (h & 1) === 0;
}

// Classes applied to the outer lesson card (ribbon, dim).
export function todoPillRowClasses(
  variant: TodoPillVariant,
  isTodo: boolean
): string {
  if (variant === "B" && isTodo)
    return "border-l-[3px] border-yellow-500 pl-[7px]";
  if (variant === "C" && !isTodo) return "opacity-50";
  return "";
}

// Inline pill rendered inside the row's right-hand controls cluster.
export function TodoPillInline({
  variant,
  isTodo,
}: {
  variant: TodoPillVariant;
  isTodo: boolean;
}) {
  if (!isTodo) return null;
  if (variant === "A") {
    return (
      <button
        className="text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-foreground text-background hover:opacity-80 transition-opacity shrink-0"
        title="Click to mark as done (prototype — no-op)"
        onClick={(e) => e.stopPropagation()}
      >
        todo
      </button>
    );
  }
  if (variant === "C") {
    return (
      <span className="text-[10px] font-medium uppercase tracking-wide text-yellow-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        todo
      </span>
    );
  }
  return null;
}

export function TodoPillSwitcher() {
  if (process.env.NODE_ENV === "production") return null;
  const [params, setParams] = useSearchParams();
  const current = useTodoPillVariant();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      )
        return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const i = VARIANTS.indexOf(current);
      const next =
        e.key === "ArrowRight"
          ? VARIANTS[(i + 1) % VARIANTS.length]
          : VARIANTS[(i - 1 + VARIANTS.length) % VARIANTS.length];
      const np = new URLSearchParams(params);
      np.set("variant", next!);
      setParams(np, { replace: true });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, params, setParams]);

  // Only show the switcher when the prototype is engaged (?variant present).
  if (!params.has("variant")) {
    return (
      <div className="fixed bottom-4 right-4 text-[10px] text-muted-foreground bg-zinc-900 text-white/70 px-2 py-1 rounded shadow">
        TODO-pill prototype: append{" "}
        <code className="font-mono">?variant=A</code> to the URL
      </div>
    );
  }

  const cycle = (dir: 1 | -1) => {
    const i = VARIANTS.indexOf(current);
    const next = VARIANTS[(i + dir + VARIANTS.length) % VARIANTS.length]!;
    const np = new URLSearchParams(params);
    np.set("variant", next);
    setParams(np, { replace: true });
  };

  return (
    <div
      className={cn(
        "fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3 py-2",
        "rounded-full bg-zinc-900 text-white shadow-lg border border-zinc-700"
      )}
    >
      <button
        onClick={() => cycle(-1)}
        className="p-1 hover:bg-zinc-800 rounded"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-xs font-medium px-2 min-w-[200px] text-center">
        {current} — {VARIANT_NAMES[current]}
      </span>
      <button
        onClick={() => cycle(1)}
        className="p-1 hover:bg-zinc-800 rounded"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
