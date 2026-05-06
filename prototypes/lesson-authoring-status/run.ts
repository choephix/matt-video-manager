// PROTOTYPE — throwaway. Drives the Lesson Authoring Status state model
// by hand to flush out edge cases. Delete once the design is captured.

type FsStatus = "ghost" | "real";
type AuthoringStatus = "todo" | "done" | null;

type Lesson = {
  id: string;
  title: string;
  fsStatus: FsStatus;
  authoringStatus: AuthoringStatus;
  previousVersionLessonId: string | null;
};

type Version = {
  id: string;
  kind: "draft" | "published";
  name: string | null;
  lessons: Lesson[];
};

const state: {
  versions: Version[];
  selectedLessonId: string | null;
  nextLessonNum: number;
  nextVersionNum: number;
  log: string[];
} = {
  versions: [
    {
      id: "v1",
      kind: "draft",
      name: null,
      lessons: [
        // Pre-existing lessons (predate the feature) — migration sets real → done
        {
          id: "L1",
          title: "Intro (legacy)",
          fsStatus: "real",
          authoringStatus: "done",
          previousVersionLessonId: null,
        },
        {
          id: "L2",
          title: "Setup (legacy)",
          fsStatus: "real",
          authoringStatus: "done",
          previousVersionLessonId: null,
        },
      ],
    },
  ],
  selectedLessonId: "L1",
  nextLessonNum: 3,
  nextVersionNum: 2,
  log: [
    "Initialised with 2 pre-existing real lessons (authoringStatus=done, post-migration state).",
  ],
};

// ---------- helpers ----------
const draft = () => state.versions[state.versions.length - 1]!;

const findLesson = (id: string | null): { v: Version; l: Lesson } | null => {
  if (!id) return null;
  for (const v of state.versions) {
    const l = v.lessons.find((x) => x.id === id);
    if (l) return { v, l };
  }
  return null;
};

const log = (msg: string) => {
  state.log.unshift(msg);
  state.log = state.log.slice(0, 6);
};

// Invariant (biconditional): fsStatus='real' ⇔ authoringStatus IS NOT NULL
const violations = (): string[] => {
  const out: string[] = [];
  for (const v of state.versions) {
    for (const l of v.lessons) {
      if (l.fsStatus === "ghost" && l.authoringStatus !== null) {
        out.push(
          `${v.id}/${l.id}: ghost lesson has authoringStatus=${l.authoringStatus}`
        );
      }
      if (l.fsStatus === "real" && l.authoringStatus === null) {
        out.push(`${v.id}/${l.id}: real lesson has authoringStatus=NULL`);
      }
    }
  }
  return out;
};

// ---------- actions ----------
function selectInDraft(dir: 1 | -1) {
  const lessons = draft().lessons;
  if (lessons.length === 0) return;
  const i = lessons.findIndex((l) => l.id === state.selectedLessonId);
  const next = i === -1 ? 0 : (i + dir + lessons.length) % lessons.length;
  state.selectedLessonId = lessons[next]!.id;
}

function createReal() {
  if (draft().kind !== "draft") return;
  const id = `L${state.nextLessonNum++}`;
  draft().lessons.push({
    id,
    title: `New real lesson ${id}`,
    fsStatus: "real",
    authoringStatus: "todo", // Q5 rule: new real → todo
    previousVersionLessonId: null,
  });
  state.selectedLessonId = id;
  log(`Created real lesson ${id} → todo`);
}

function createGhost() {
  if (draft().kind !== "draft") return;
  const id = `L${state.nextLessonNum++}`;
  draft().lessons.push({
    id,
    title: `New ghost lesson ${id}`,
    fsStatus: "ghost",
    authoringStatus: null, // Q5 rule: ghost → NULL
    previousVersionLessonId: null,
  });
  state.selectedLessonId = id;
  log(`Created ghost lesson ${id} → NULL`);
}

function materialize() {
  const found = findLesson(state.selectedLessonId);
  if (!found || found.v !== draft())
    return log("Can only materialize in draft.");
  const { l } = found;
  if (l.fsStatus !== "ghost") return log(`${l.id} is already real.`);
  l.fsStatus = "real";
  l.authoringStatus = "todo"; // Q5 rule + edge 1: materialize always → todo
  log(`Materialized ${l.id} → real, todo`);
}

function convertToGhost() {
  const found = findLesson(state.selectedLessonId);
  if (!found || found.v !== draft()) return log("Can only convert in draft.");
  const { l } = found;
  if (l.fsStatus !== "real") return log(`${l.id} is already ghost.`);
  l.fsStatus = "ghost";
  l.authoringStatus = null; // forced by constraint
  log(`Converted ${l.id} → ghost, NULL`);
}

function markDone() {
  const found = findLesson(state.selectedLessonId);
  if (!found || found.v !== draft()) return log("Can only edit in draft.");
  const { l } = found;
  if (l.authoringStatus === null)
    return log(`${l.id} is not tracked (NULL) — cannot mark done.`);
  l.authoringStatus = "done";
  log(`${l.id} → done (pill clicked)`);
}

function markTodo() {
  const found = findLesson(state.selectedLessonId);
  if (!found || found.v !== draft()) return log("Can only edit in draft.");
  const { l } = found;
  if (l.fsStatus === "ghost")
    return log(`${l.id} is ghost — cannot mark todo.`);
  l.authoringStatus = "todo";
  log(`${l.id} → todo (right-click)`);
}

function publish() {
  const old = draft();
  if (old.kind !== "draft") return;
  // Freeze old draft as published
  old.kind = "published";
  old.name = `v${state.nextVersionNum - 1}`;
  // Clone into new draft (copyVersionStructure analog)
  // Per CONTEXT.md: ghost lessons are filtered out during copy.
  const newDraft: Version = {
    id: `v${state.nextVersionNum++}`,
    kind: "draft",
    name: null,
    lessons: old.lessons
      .filter((l) => l.fsStatus !== "ghost")
      .map((src) => ({
        id: `${src.id}_${state.versions.length + 1}`,
        title: src.title,
        fsStatus: src.fsStatus,
        authoringStatus: src.authoringStatus, // Q1 decision: per-version, carries over
        previousVersionLessonId: src.id,
      })),
  };
  state.versions.push(newDraft);
  state.selectedLessonId = newDraft.lessons[0]?.id ?? null;
  log(
    `Published ${old.id} as ${old.name}; new draft ${newDraft.id} (ghosts dropped, statuses carried)`
  );
}

// ---------- render ----------
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";

function statusPill(s: AuthoringStatus): string {
  if (s === "todo") return `${YELLOW}[TODO]${RESET}`;
  if (s === "done") return `${GREEN}[done]${RESET}`;
  return `${DIM}[—]${RESET}`;
}

function fsPill(s: FsStatus): string {
  return s === "ghost" ? `${DIM}ghost${RESET}` : `${CYAN}real${RESET} `;
}

function render() {
  console.clear();
  console.log(`${BOLD}Lesson Authoring Status — prototype${RESET}`);
  console.log(
    `${DIM}Driving the state model from Q1–Q5. ghost ⇒ NULL invariant enforced.${RESET}\n`
  );

  for (const v of state.versions) {
    const tag =
      v.kind === "draft"
        ? `${BOLD}${CYAN}DRAFT${RESET}`
        : `${DIM}published${RESET}`;
    console.log(
      `${BOLD}${v.id}${RESET} ${tag} ${v.name ? DIM + v.name + RESET : ""}`
    );
    if (v.lessons.length === 0) console.log(`  ${DIM}(no lessons)${RESET}`);
    for (const l of v.lessons) {
      const sel =
        l.id === state.selectedLessonId && v === draft()
          ? `${BOLD}>${RESET}`
          : " ";
      const prev = l.previousVersionLessonId
        ? `${DIM}← ${l.previousVersionLessonId}${RESET}`
        : "";
      console.log(
        `  ${sel} ${BOLD}${l.id}${RESET} ${fsPill(l.fsStatus)} ${statusPill(l.authoringStatus)} ${l.title} ${prev}`
      );
    }
    console.log("");
  }

  const vios = violations();
  if (vios.length > 0) {
    console.log(`${RED}${BOLD}INVARIANT VIOLATIONS:${RESET}`);
    for (const v of vios) console.log(`  ${RED}${v}${RESET}`);
    console.log("");
  }

  console.log(`${BOLD}Recent:${RESET}`);
  for (const m of state.log) console.log(`  ${DIM}•${RESET} ${m}`);
  console.log("");

  console.log(
    `${DIM}select:${RESET} ${BOLD}j${RESET}/${BOLD}k${RESET}  ` +
      `${DIM}create:${RESET} ${BOLD}r${RESET}=real ${BOLD}g${RESET}=ghost  ` +
      `${DIM}fs:${RESET} ${BOLD}m${RESET}=materialize ${BOLD}c${RESET}=convert-to-ghost  ` +
      `${DIM}status:${RESET} ${BOLD}d${RESET}=done ${BOLD}t${RESET}=todo  ` +
      `${DIM}lifecycle:${RESET} ${BOLD}p${RESET}=publish  ${BOLD}q${RESET}=quit`
  );
}

// ---------- main loop ----------
process.stdin.setRawMode?.(true);
process.stdin.resume();
process.stdin.setEncoding("utf8");

render();

process.stdin.on("data", (key: string) => {
  const k = key.toString();
  if (k === "q" || k === "") {
    process.stdin.setRawMode?.(false);
    process.exit(0);
  }
  switch (k) {
    case "j":
      selectInDraft(1);
      break;
    case "k":
      selectInDraft(-1);
      break;
    case "r":
      createReal();
      break;
    case "g":
      createGhost();
      break;
    case "m":
      materialize();
      break;
    case "c":
      convertToGhost();
      break;
    case "d":
      markDone();
      break;
    case "t":
      markTodo();
      break;
    case "p":
      publish();
      break;
  }
  render();
});
