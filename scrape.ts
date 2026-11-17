import { z } from "zod";

const ENDPOINT = "https://api.firecrawl.dev/v2/scrape";
const TIMEOUT_MS = 120_000;

type ScrapeResponse = {
  success?: boolean;
  error?: string;
  data?: {
    markdown?: string;
    html?: string;
    links?: string[];
    json?: unknown;
    metadata?: { title?: string; sourceURL?: string; statusCode?: number };
  };
};

const input = z.object({
  url: z.url().describe("The page to scrape"),
  formats: z
    .array(z.enum(["markdown", "html", "links", "json"]))
    .min(1)
    .default(["markdown"])
    .describe("Output formats. Use json with jsonPrompt to extract structured data"),
  jsonPrompt: z.string().optional().describe("What to extract when formats includes json"),
  onlyMainContent: z
    .boolean()
    .default(true)
    .describe("Drop navigation, headers, and footers. Turn off when you need the whole page"),
});

export const scrape = {
  name: "firecrawl_scrape",
  description: `Scrape one web page with Firecrawl and return it as markdown, html, links, or structured json.

Use this when you already have the URL. Pass formats ["json"] with jsonPrompt to pull specific fields from a page instead of reading all of it, and ["links"] to see where a page leads. For how a library or API behaves, try the developer search tool first. Each call spends Firecrawl credits.`,
  input,
  async run(args: z.output<typeof input>, abort: AbortSignal, apiKey: string) {
    const jsonPrompt = args.jsonPrompt?.trim();
    if (args.formats.includes("json") && !jsonPrompt) {
      throw new Error("Pass jsonPrompt describing what to extract when formats includes json.");
    }
    const formats = args.formats.map((format) => (format === "json" ? { type: "json", prompt: jsonPrompt } : format));

    const response = await fetch(ENDPOINT, {
      method: "POST",
      signal: AbortSignal.any([abort, AbortSignal.timeout(TIMEOUT_MS)]),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        url: args.url,
        formats,
        onlyMainContent: args.onlyMainContent,
        // The API accepts unlisted integrations only with a leading underscore.
        integration: "_opencode",
      }),
    });
    const body = (await response.json().catch(() => undefined)) as ScrapeResponse | undefined;
    if (!response.ok || body?.success === false) {
      const detail = body?.error ? `: ${body.error}` : "";
      throw new Error(`Scrape failed with ${response.status} ${response.statusText}${detail}`);
    }

    const data = body?.data ?? {};
    const statusCode = data.metadata?.statusCode;
    const parts = [
      statusCode && statusCode >= 400 ? `The page responded with HTTP ${statusCode}.` : undefined,
      data.markdown,
      data.html && `HTML:\n${data.html}`,
      data.links?.length ? `Links:\n${data.links.join("\n")}` : undefined,
      data.json !== undefined ? `JSON:\n${JSON.stringify(data.json, null, 2)}` : undefined,
    ].filter(Boolean);
    return {
      title: data.metadata?.title || args.url,
      output: parts.length ? parts.join("\n\n") : "The page returned no content.",
      metadata: { url: data.metadata?.sourceURL ?? args.url, statusCode },
    };
  },
};
