import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins:
    process.env.NODE_ENV === "test"
      ? [tsconfigPaths()]
      : [tailwindcss(), reactRouter(), tsconfigPaths()],
  build: {
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        if (
          (warning.code === "MODULE_LEVEL_DIRECTIVE" ||
            warning.code === "SOURCEMAP_ERROR") &&
          warning.id?.includes("components/ui/kibo-ui/")
        ) {
          return;
        }
        defaultHandler(warning);
      },
    },
  },
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "**/.react-router/**"],
    pool: "forks",
    poolOptions: {
      forks: {
        maxForks: 5,
      },
    },
  },
});
