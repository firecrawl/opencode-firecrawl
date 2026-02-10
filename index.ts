import type { Plugin } from "@opencode-ai/plugin";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const current_dir = dirname(fileURLToPath(import.meta.url));

export const plugin: Plugin = async () => {
  return {
    async config(input) {
      input.instructions ??= [];
      // @ts-expect-error -- skills is a new opencode feature, types not yet updated
      input.skills ??= {};
      // @ts-expect-error -- skills is a new opencode feature, types not yet updated
      input.skills.paths ??= [];

      input.instructions.push(
        join(current_dir, "skills", "firecrawl-cli", "rules", "install.md"),
      );

      // @ts-expect-error -- skills is a new opencode feature, types not yet updated
      input.skills.paths.push(join(current_dir, "skills"));
    },

    "shell.env": async (_input, output) => {
      if (process.env.FIRECRAWL_API_KEY) {
        output.env.FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
      }
    },
  };
};

export default plugin;
