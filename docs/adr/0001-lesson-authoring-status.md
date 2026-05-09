# Lesson Authoring Status

We needed a per-lesson "still to do" marker that survives publishing and doesn't bleed mutable state into Published Versions. Decision: store `authoringStatus` (`todo | done`, nullable) directly on the `lessons` row and let `copyVersionStructure` carry it forward at Publish, so each **CourseVersion** owns a frozen snapshot — same pattern as every other lesson field. Rejected the alternative of tracking status against the `previousVersionLessonId` lineage because it would have made a completion in the Draft retroactively mutate Published Versions, contradicting Published Version immutability.

## Invariant

A biconditional with `fsStatus`: `fsStatus = 'real' ⇔ authoringStatus IS NOT NULL`. Ghost lessons never carry a status; real lessons always do. Convert-to-Ghost clears the status; Materialize sets it to `todo`. Enforced at the app layer and via a check constraint.

## Migration default

Existing real lessons are backfilled to `done`, not `todo` and not a third `legacy` value. Reason: the user explicitly didn't want pre-existing lessons demanding attention, and the enum is deliberately kept at two values — a `legacy` / `none` value would clutter every consumer with a third case that means "ignore me." `done` accepts a small semantic inaccuracy ("we don't actually know these are done") in exchange for a clean two-value enum and zero noise on day one. Re-materializing a previously-`done` lesson resets it to `todo` for the same reason: the on-disk content is freshly created, so prior completion is meaningless.
