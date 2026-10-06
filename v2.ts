import type { Plugin, Skill } from "@opencode/plugin";
import { tool } from "@opencode-ai/plugin";
import { alexandria } from "./alexandria.ts";
import { developerSearch } from "./developer-search.ts";
import { bundledSkills } from "./skills.ts";

const z = tool.schema;

/** OpenCode registers the `firecrawl` integration for its built-in web search, so `/connect` already offers it. */
const INTEGRATION = "firecrawl";
const CONNECTION_EVENTS = new Set(["integration.updated", "credential.updated", "credential.switched"]);

/** A rejected promise reaches OpenCode 2 as a defect rather than a tool error, so failures come back as text the model can act on. */
async function result(run: () => Promise<{ title: string; output: string; metadata: Record<string, unknown> }>) {
  try {
    const { title, output, metadata } = await run();
    return { content: output, metadata: { ...metadata, title } };
  } catch (error) {
    return { content: error instanceof Error ? error.message : String(error), metadata: { error: true } };
  }
}

/** OpenCode 2: tools, skills, and the shell key come from the Firecrawl connection made with `/connect`. */
export const v2: Plugin.Plugin = {
  id: "firecrawl",
  async setup(ctx) {
    const resolveKey = async () => {
      const connection = await ctx.integration.connection.active(INTEGRATION);
      const credential = connection && (await ctx.integration.connection.resolve(connection));
      // The env fallback covers a setup where the built-in web search plugins, and with them the integration, are disabled.
      return credential?.type === "key" ? credential.key : process.env.FIRECRAWL_API_KEY;
    };
    let apiKey = await resolveKey();

    const skills = await bundledSkills();
    // SAFETY: Skill.Info's ids and paths are branded strings; the brands are compile-time only.
    await ctx.skill.transform((editor) => skills.forEach((skill) => editor.add(skill as unknown as Skill.Info)));

    await ctx.shell.hook("create.before", (event) => {
      if (apiKey) event.env.FIRECRAWL_API_KEY = apiKey;
    });

    await ctx.tool.transform((editor) => {
      editor.add({
        name: developerSearch.name,
        description: developerSearch.description,
        input: z.toJSONSchema(developerSearch.input, { io: "input" }),
        execute: (input, context) =>
          result(() => developerSearch.run(developerSearch.input.parse(input), context.signal, apiKey)),
      });
      // Alexandria runs spend credits against an account, so the tool only exists once Firecrawl is connected.
      const key = apiKey;
      if (key)
        editor.add({
          name: alexandria.name,
          description: alexandria.description,
          input: z.toJSONSchema(alexandria.input, { io: "input" }),
          execute: (input, context) =>
            result(() => alexandria.run(alexandria.input.parse(input), context.signal, key)),
        });
    });

    // Connecting or disconnecting Firecrawl mid-session adds or removes Alexandria without a restart.
    const controller = new AbortController();
    void (async () => {
      for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
        if (!CONNECTION_EVENTS.has(event.type)) continue;
        const next = await resolveKey();
        if (next === apiKey) continue;
        apiKey = next;
        await ctx.tool.reload();
      }
    })().catch((error) => {
      if (!controller.signal.aborted) console.error("firecrawl: connection watch stopped", error);
    });
    return () => controller.abort();
  },
};
