import type { Credential, Plugin, Skill } from "@opencode/plugin";
import { z } from "zod";
import { alexandria } from "./alexandria.ts";
import { developerSearch } from "./developer-search.ts";
import { METHOD_ID, authorize, refresh } from "./oauth.ts";
import { bundledSkills, installInstructions } from "./skills.ts";

/** OpenCode registers the `firecrawl` integration for its built-in web search, so `/connect` already offers it. */
const INTEGRATION = "firecrawl";
const CONNECTION_EVENTS = new Set(["integration.updated", "credential.updated", "credential.switched"]);

/**
 * A rejected promise reaches OpenCode 2 as a defect rather than a tool error, so failures come back as text the model
 * can act on. A cancelled call keeps rejecting, so a stop never reads as a Firecrawl failure.
 */
async function result(
  signal: AbortSignal,
  run: () => Promise<{ title: string; output: string; metadata: Record<string, unknown> }>,
) {
  try {
    const { title, output, metadata } = await run();
    return { content: output, metadata: { ...metadata, title } };
  } catch (error) {
    if (signal.aborted) throw error;
    const message =
      error instanceof z.ZodError ? z.prettifyError(error) : error instanceof Error ? error.message : String(error);
    return { content: message, metadata: { error: true } };
  }
}

/**
 * OpenCode 2: tools, skills, and the shell key come from the Firecrawl connection made with `/connect`, either a browser
 * sign-in this plugin adds or an API key.
 */
export const v2: Plugin.Plugin = {
  id: "firecrawl",
  async setup(ctx) {
    await ctx.integration.transform((editor) =>
      editor.method.update({
        integrationID: INTEGRATION,
        method: { id: METHOD_ID, type: "oauth", label: "Sign in with Firecrawl" },
        // SAFETY: Credential.OAuth's methodID is a branded string; the brand is compile-time only.
        authorize: async () => {
          const authorization = await authorize();
          return { ...authorization, callback: authorization.callback as Promise<unknown> as Promise<Credential.OAuth> };
        },
        refresh: (credential) => refresh(credential) as Promise<unknown> as Promise<Credential.OAuth>,
      }),
    );

    // Resolved per use: OpenCode refreshes an OAuth access token here once it is close to expiring.
    const resolveKey = async () => {
      const connection = await ctx.integration.connection.active(INTEGRATION);
      const credential = connection && (await ctx.integration.connection.resolve(connection));
      if (credential?.type === "oauth") return credential.access;
      // The env fallback covers a setup where the built-in web search plugins, and with them the integration, are disabled.
      return credential?.type === "key" ? credential.key : process.env.FIRECRAWL_API_KEY;
    };
    let connected = Boolean(await resolveKey());

    const [skills, instructions] = await Promise.all([bundledSkills(), installInstructions()]);
    // SAFETY: Skill.Info's ids and paths are branded strings; the brands are compile-time only.
    await ctx.skill.transform((editor) => skills.forEach((skill) => editor.add(skill as unknown as Skill.Info)));

    // OpenCode 1 appends the install rules through config `instructions`; here they join the system prompt directly.
    await ctx.session.hook("context", (event) => {
      event.system.push({ type: "text", text: instructions });
    });

    await ctx.shell.hook("create.before", async (event) => {
      const apiKey = await resolveKey().catch(() => undefined);
      if (apiKey) event.env.FIRECRAWL_API_KEY = apiKey;
    });

    await ctx.tool.transform((editor) => {
      editor.add({
        name: developerSearch.name,
        description: developerSearch.description,
        input: z.toJSONSchema(developerSearch.input, { io: "input" }),
        execute: (input, context) =>
          result(context.signal, async () =>
            developerSearch.run(developerSearch.input.parse(input), context.signal, await resolveKey()),
          ),
      });
      // Alexandria runs spend credits against an account, so the tool only exists once Firecrawl is connected.
      if (connected)
        editor.add({
          name: alexandria.name,
          description: alexandria.description,
          input: z.toJSONSchema(alexandria.input, { io: "input" }),
          execute: (input, context) =>
            result(context.signal, async () => {
              const apiKey = await resolveKey();
              if (!apiKey) throw new Error("Firecrawl is not connected. Connect it with /connect, then try again.");
              return alexandria.run(alexandria.input.parse(input), context.signal, apiKey);
            }),
        });
    });

    // Connecting or disconnecting Firecrawl mid-session adds or removes Alexandria without a restart.
    const controller = new AbortController();
    void (async () => {
      for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
        if (!CONNECTION_EVENTS.has(event.type)) continue;
        // One failed read must not end the watch for the rest of the session.
        try {
          const next = Boolean(await resolveKey());
          if (next === connected) continue;
          connected = next;
          await ctx.tool.reload();
        } catch (error) {
          console.error("firecrawl: could not refresh the connection", error);
        }
      }
    })().catch((error) => {
      if (!controller.signal.aborted) console.error("firecrawl: connection watch stopped", error);
    });
    return () => controller.abort();
  },
};
