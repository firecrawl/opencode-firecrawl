# opencode-firecrawl

OpenCode plugin for [Firecrawl](https://firecrawl.dev) — gives your AI agent primary-source answers from the Firecrawl developer index, plus reliable web scraping, crawling, and search via the [Firecrawl CLI](https://github.com/firecrawl/cli).

## Installation

Add the plugin to your `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-firecrawl"]
}
```

The `firecrawl_developer_search` tool works as soon as the plugin loads, with no API key and no CLI.

For the web tools (scrape, crawl, map, search, agent), install the Firecrawl CLI globally:

```bash
npm install -g firecrawl-cli
```

## Authentication

On first use, the agent will prompt you to authenticate. You can also set up in advance:

```bash
# Browser login (recommended)
firecrawl login --browser

# Or set an API key
export FIRECRAWL_API_KEY=fc-your-api-key
```

Get an API key at [firecrawl.dev](https://firecrawl.dev).

If `FIRECRAWL_API_KEY` is set in your environment, the plugin automatically passes it to shell commands.

## Developer index

The plugin adds a `firecrawl_developer_search` tool that searches a curated index of GitHub issues, merged pull requests, READMEs, and library documentation, and returns the **matched passages** as markdown rather than a list of links.

Use it when the question is how a library behaves, what an error means, whether a bug was fixed, or what an API contract guarantees. The agent gets to answer from the issue that reported the bug, the pull request that fixed it, or the doc page that defines the contract.

```
Why does my Playwright script hang on page.goto with a service worker registered?
```

The tool takes a `query` plus optional `types` (`doc`, `issue`, `pull_request`, `readme`), `repos` (`owner/name`), `sources`, `k`, and `passages`. It needs no API key; setting `FIRECRAWL_API_KEY` only raises the rate limit. The same index is available from the shell as `firecrawl developer <query>`.

The bundled `firecrawl-developer-index` skill teaches the agent which questions belong in the index, how to shape a query for an error string versus an API contract, and when to fall back to the open web instead.

## What it does

This plugin registers the Firecrawl CLI skill with OpenCode. Once installed, the agent can:

- **Search** the web with optional scraping of results
- **Scrape** any webpage to clean markdown, HTML, or structured data
- **Map** all URLs on a website
- **Crawl** entire websites recursively
- **Agent** — AI-powered autonomous web data extraction
- **Developer search** — issues, merged PRs, READMEs, and docs, with the matched passages

All output is written to a `.firecrawl/` directory to avoid flooding context.

## Links

- [Firecrawl CLI Documentation](https://docs.firecrawl.dev/cli)
- [Firecrawl CLI GitHub](https://github.com/firecrawl/cli)
- [OpenCode Plugin Docs](https://opencode.ai/docs/plugins)

## License

ISC
