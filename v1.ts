import { type Plugin, tool } from "@opencode-ai/plugin";
import { join } from "node:path";
import { alexandria } from "./alexandria.ts";
import { developerSearch } from "./developer-search.ts";
import { skillsDir } from "./skills.ts";

/** OpenCode 1: hooks returned from `server()`, with the key read from the environment. */
export const server: Plugin = async () => {
  const apiKey = process.env.FIRECRAWL_API_KEY;

  return {
    async config(input) {
      input.instructions ??= [];
      // @ts-expect-error -- opencode reads skills.paths, but the plugin SDK's Config type does not declare it yet
      input.skills ??= {};
      // @ts-expect-error -- see above
      input.skills.paths ??= [];

      input.instructions.push(join(skillsDir, "firecrawl", "rules", "install.md"));

      // @ts-expect-error -- see above
      input.skills.paths.push(skillsDir);
    },

    "shell.env": async (_input, output) => {
      if (apiKey) {
        output.env.FIRECRAWL_API_KEY = apiKey;
      }
    },

    tool: {
      [developerSearch.name]: tool({
        description: developerSearch.description,
        args: developerSearch.input.shape,
        execute: (args, context) => developerSearch.run(args, context.abort, apiKey),
      }),
      // Alexandria runs spend credits against an account, so the tool only exists once a key is connected.
      ...(apiKey && {
        [alexandria.name]: tool({
          description: alexandria.description,
          args: alexandria.input.shape,
          execute: (args, context) =>
            alexandria.run(args, context.abort, apiKey, (target, metadata) =>
              context.ask({ permission: alexandria.name, patterns: [target], always: [target], metadata }),
            ),
        }),
      }),
    },
  };
};
