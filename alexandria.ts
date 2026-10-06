import { z } from "zod";

const API = "https://api.firecrawl.dev/v2";
const TIMEOUT_MS = 120_000;
const TERMS_URL = "https://www.firecrawl.dev/app/settings?tab=data-sources";

type ApiError = { success?: false; error?: string; code?: string };

type DiscoveredTool = {
  example?: { request?: unknown; response?: unknown };
  [key: string]: unknown;
};

type SearchResponse = ApiError & { data?: { tools?: DiscoveredTool[] }; creditsUsed?: number };

type ScrapeResponse = ApiError & {
  data?: { alexandria?: { error?: unknown }[]; creditsCost?: number };
};

async function post<T extends ApiError>(path: string, body: unknown, apiKey: string, abort: AbortSignal) {
  const response = await fetch(`${API}${path}`, {
    method: "POST",
    signal: AbortSignal.any([abort, AbortSignal.timeout(TIMEOUT_MS)]),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    // The API accepts unlisted integrations only with a leading underscore.
    body: JSON.stringify({ ...(body as object), integration: "_opencode" }),
  });
  const json = (await response.json().catch(() => undefined)) as T | undefined;
  if (response.ok && json?.success !== false) return json ?? ({} as T);

  if (json?.code === "THIRD_PARTY_DATA_TERMS_REQUIRED") {
    throw new Error(
      `This provider needs its data terms accepted first. Show the user the terms at ${TERMS_URL} and wait for them to accept; do not retry until they have.`,
    );
  }
  const detail = json?.error ? `: ${json.error}` : "";
  throw new Error(`Alexandria request failed with ${response.status} ${response.statusText}${detail}`);
}

const input = z.object({
  query: z.string().optional().describe("What data you need, in plain words. Finds providers"),
  provider: z.string().optional().describe('Provider slug from discovery, e.g. "bls-gov"'),
  capability: z
    .string()
    .optional()
    .describe('Capability address from discovery, e.g. "economic-statistics/bls_unemployment_rate"'),
  options: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Options matching the capability's contract"),
});

/** Asks the user before a run spends credits. Only OpenCode 1 can prompt from a plugin tool. */
type Confirm = (target: string, metadata: Record<string, unknown>) => Promise<void>;

export const alexandria = {
  name: "firecrawl_alexandria",
  description: `Find and run Firecrawl Alexandria data providers: official APIs, licensed publishers, and Firecrawl indexes that return structured records instead of a web page.

Two modes, exactly one per call:
- Discover: pass query, describing the data you need in plain words. Returns matching capabilities with their input contract (options), response fields, and credit price. Discovery is free.
- Run: pass provider and capability exactly as discovery returned them, plus options matching that capability's contract. Running spends Firecrawl credits at the listed price.

Discover first and only run a capability discovery returned. Check each result item for an error before using it, and report the credits the run cost. When no provider fits, fall back to web search or scraping.`,
  input,
  async run(
    args: z.output<typeof input>,
    abort: AbortSignal,
    apiKey: string,
    confirm?: Confirm,
  ) {
    const query = args.query?.trim();
    const target = args.provider && args.capability ? `${args.provider}/${args.capability}` : undefined;
    if (!query === !target) {
      throw new Error("Pass either query (to find providers) or provider and capability (to run one), not both.");
    }

    if (query) {
      const body = await post<SearchResponse>(
        "/search",
        // Full detail carries each capability's input contract, so the model can run it without guessing options.
        { query, sources: [{ type: "alexandria" }], limit: 5, toolDetail: "full" },
        apiKey,
        abort,
      );
      // A recorded example response can run to hundreds of rows; the field list already describes the shape.
      const tools = (body.data?.tools ?? []).map(({ example, ...rest }) =>
        example?.request ? { ...rest, example: { request: example.request } } : rest,
      );
      return {
        title: query,
        output: tools.length
          ? JSON.stringify(tools, null, 2)
          : "No Alexandria providers matched. Describe the data differently, or use web search.",
        metadata: { count: tools.length },
      };
    }

    await confirm?.(target!, { provider: args.provider, capability: args.capability, options: args.options });
    const body = await post<ScrapeResponse>(
      "/scrape",
      { alexandria: [{ provider: args.provider, capability: args.capability, options: args.options ?? {} }] },
      apiKey,
      abort,
    );
    const results = body.data?.alexandria ?? [];
    return {
      title: target!,
      output: results.length ? JSON.stringify(body.data, null, 2) : "The capability returned no data.",
      metadata: {
        creditsCost: body.data?.creditsCost,
        failed: results.some((item) => item.error),
      },
    };
  },
};
