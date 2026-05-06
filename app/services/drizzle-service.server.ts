import {
  drizzle as drizzlePostgres,
  type PostgresJsDatabase,
} from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import { pushSchema } from "drizzle-kit/api";
import * as schema from "@/db/schema";
import { Effect } from "effect";

/**
 * The DB driver used by all server-side services.
 *
 * - When `DATABASE_URL` is set, we connect to that Postgres instance via
 *   `postgres-js` — same as the original behavior, suitable for shared/dev
 *   databases and for keeping `drizzle-kit studio` / `clone-db-to-local.sh`
 *   working.
 * - Otherwise we boot an embedded PGlite instance at `PGLITE_DATA_DIR`
 *   (default: `./.pglite`). This is the desktop-MVP default and requires no
 *   external Postgres install.
 *
 * Both drivers expose the same SQL dialect and Drizzle query API. We type the
 * service against `PostgresJsDatabase` and structurally cast the pglite
 * instance into the same shape — mirrors the pattern in
 * `app/test-utils/pglite.ts`. The two driver result types differ in metadata
 * wrappers but are otherwise interchangeable at runtime.
 */
export type DrizzleDB = PostgresJsDatabase<typeof schema>;

export class DrizzleService extends Effect.Service<DrizzleService>()(
  "DrizzleService",
  {
    effect: Effect.gen(function* () {
      const url = process.env.DATABASE_URL;

      if (url) {
        yield* Effect.logInfo("DrizzleService: connecting via postgres-js");
        return drizzlePostgres(url, { schema }) as DrizzleDB;
      }

      const dataDir = process.env.PGLITE_DATA_DIR ?? "./.pglite";
      yield* Effect.logInfo(
        `DrizzleService: using embedded PGlite at ${dataDir}`
      );

      const pglite = new PGlite(dataDir);
      const db = drizzlePglite(pglite, { schema });

      // Bootstrap / sync the schema. Mirrors `drizzle-kit push` and matches
      // the pattern used in `app/test-utils/pglite.ts`. Idempotent — safe to
      // run on every startup. TODO: switch to committed migration files once
      // the schema stabilises.
      yield* Effect.tryPromise({
        try: async () => {
          const { apply } = await pushSchema(schema, db as any);
          await apply();
        },
        catch: (cause) =>
          new Error(`PGlite schema bootstrap failed: ${String(cause)}`),
      });

      return db as unknown as DrizzleDB;
    }),
  }
) {}
