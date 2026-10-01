import type { Plugin } from "@opencode-ai/plugin";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { alexandria } from "./alexandria.ts";
import { developerSearch } from "./developer-search.ts";

const current_dir = dirname(fileURLToPath(import.meta.url));

export const plugin: Plugin = async () => {
  const apiKey = process.env.FIRECRAWL_API_KEY;

  return {
    async config(input) {
      input.instructions ??= [];
      // @ts-expect-error -- opencode reads skills.paths, but the plugin SDK's Config type does not declare it yet
      input.skills ??= {};
      // @ts-expect-error -- see above
      input.skills.paths ??= [];

      input.instructions.push(join(current_dir, "skills", "firecrawl", "rules", "install.md"));

      // @ts-expect-error -- see above
      input.skills.paths.push(join(current_dir, "skills"));
    },

    "shell.env": async (_input, output) => {
      if (apiKey) {
        output.env.FIRECRAWL_API_KEY = apiKey;
      }
    },

    tool: {
      firecrawl_developer_search: developerSearch,
      // Alexandria runs spend credits against an account, so the tool only exists once a key is connected.
      ...(apiKey && { firecrawl_alexandria: alexandria(apiKey) }),
    },
  };
};

export default plugin;
