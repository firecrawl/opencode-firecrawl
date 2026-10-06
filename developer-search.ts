import { z } from "zod";

const ENDPOINT = "https://api.firecrawl.dev/v2/search/developer";
const TIMEOUT_MS = 30_000;

type Passage = { text?: string; citation_url?: string };

type SearchResult = {
  id?: string;
  url?: string;
  title?: string;
  license?: string;
  passages?: Passage[];
};

type SearchResponse = {
  success?: boolean;
  partial?: boolean;
  results?: SearchResult[];
  repos?: { repo?: string; indexed?: boolean }[];
  sources?: { source?: string; indexed?: boolean }[];
  error?: string;
};

type Scope = { repos?: string[]; sources?: string[] };

/**
 * A scope the index doesn't hold can never match, so no rephrasing will help.
 * Unknown repos are absent from the echo entirely while unknown sources come
 * back with `indexed: false`, so treat "missing" and "not indexed" alike.
 */
function unmatchableScopes(response: SearchResponse, scope: Scope) {
  const indexed = (echo: { indexed?: boolean } | undefined) => echo !== undefined && echo.indexed !== false;
  const missing = [
    ...(scope.repos ?? [])
      .filter((repo) => !indexed(response.repos?.find((echo) => echo.repo === repo)))
      .map((repo) => `repo ${repo}`),
    ...(scope.sources ?? [])
      .filter((source) => !indexed(response.sources?.find((echo) => echo.source === source)))
      .map((source) => `source ${source}`),
  ];
  if (missing.length === 0) return [];
  return [
    `Not in the developer index, so no query scoped to ${missing.length > 1 ? "them" : "it"} can ever match: ${missing.join(", ")}. Drop the scope and search the whole index, or use the Firecrawl CLI for the open web.`,
  ];
}

function render(response: SearchResponse, scope: Scope) {
  const results = response.results ?? [];
  const notes = [
    ...unmatchableScopes(response, scope),
    response.partial ? "The index returned a partial result set." : undefined,
  ].filter((note): note is string => Boolean(note));

  if (results.length === 0) {
    return ["No results.", ...notes].join("\n\n");
  }

  const blocks = results.map((result, index) => {
    const heading = `## ${index + 1}. ${result.title ?? result.url ?? result.id ?? "untitled"}`;
    const meta = [
      // A doc id is just the url with a prefix, so printing both wastes context.
      result.id && !result.id.startsWith("doc:") && `id: ${result.id}`,
      result.url && `url: ${result.url}`,
      result.license && `license: ${result.license}`,
    ]
      .filter(Boolean)
      .join("\n");
    const passages = (result.passages ?? [])
      .map((passage) => passage.text?.trim())
      .filter(Boolean)
      .join("\n\n---\n\n");
    return [heading, meta, passages || "(no passage returned)"].filter(Boolean).join("\n\n");
  });

  return [...blocks, ...notes].join("\n\n");
}

const input = z.object({
  query: z
    .string()
    .describe("The developer question, literal error string, or API contract to look up"),
  k: z.number().min(1).max(100).default(10).describe("Number of results to return"),
  types: z
    .array(z.enum(["doc", "issue", "pull_request", "readme"]))
    .optional()
    .describe(
      "Artifact kinds to search. Defaults to all four; narrowing here is the cheapest way to sharpen a query",
    ),
  repos: z
    .array(z.string())
    .optional()
    .describe("Scope the repository half (issue, pull_request, readme) to these owner/name slugs"),
  sources: z
    .array(z.string())
    .optional()
    .describe(
      "Scope the documentation half (doc) to these source ids, at most 20. Unions with repos rather than intersecting",
    ),
  passages: z
    .number()
    .min(1)
    .max(5)
    .default(1)
    .describe(
      "Maximum passages per result. Raise when a page is clearly right but the first passage is the wrong part of it",
    ),
});

export const developerSearch = {
  name: "firecrawl_developer_search",
  description: `Search a curated index of GitHub issues, merged pull requests, READMEs, and library documentation, returning the matched passages as markdown.

Reach for this before a web search whenever the question is how a library or API behaves, what an error message means, whether a bug was fixed, or what an API contract guarantees. It answers from the primary source: the issue where the bug was reported, the merged PR that fixed it, the doc page that defines the contract. A blog post describing a behaviour is a weaker answer than the passage defining it.

Matching the query to the question:
- Literal error string or stack trace: search the string plus the library name with types ["issue", "pull_request"]. If nothing matches, strip the volatile parts (paths, line numbers, ids) and retry; the invariant middle of the message is what is indexed.
- Conceptual "how do I do X": ask the full question in natural language across all types. Raise passages before raising k.
- Known bug: the issue reports it, the merged pull request fixes it, and the fix is what you want. Search ["issue", "pull_request"], then re-query the issue's own terms scoped to its repo with types ["pull_request"].
- API contract ("what does X return", "is Y required", "what is the default"): types ["readme", "doc"].
- Version-specific behaviour: an issue's opening report describes the broken version and its resolution supersedes it, so read the resolution before answering.
- Scoped to one library: repos ["owner/name"]. If a scoped search comes back empty, read the "Not indexed" note before rephrasing.

Search broadly first, then narrow with types or repos once you have seen what the hits look like; scoping first hides the result that would have told you where to look. Quote the passages and cite the url, falling back to the url when a doc result has no title. When the index has nothing to say, comparisons, opinion, news, or an unindexed project, use the Firecrawl CLI to search or scrape the open web instead.`,
  input,
  // Keyless by default; a key only raises the rate limit.
  async run(args: z.output<typeof input>, abort: AbortSignal, apiKey: string | undefined) {
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const response = await fetch(ENDPOINT, {
      method: "POST",
      signal: AbortSignal.any([abort, timeout]),
      headers: {
        "Content-Type": "application/json",
        ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
      },
      body: JSON.stringify(args),
    });

    const body = (await response.json().catch(() => undefined)) as SearchResponse | undefined;

    if (!response.ok) {
      const detail = body?.error ? `: ${body.error}` : "";
      throw new Error(`Developer index search failed with ${response.status} ${response.statusText}${detail}`);
    }

    return {
      title: args.query,
      output: render(body ?? {}, args),
      metadata: {
        count: body?.results?.length ?? 0,
        partial: body?.partial ?? false,
      },
    };
  },
};
