# @firecrawl/opencode

[OpenCode](https://opencode.ai) plugin for [Firecrawl](https://firecrawl.dev). It gives your agent primary-source answers from the Firecrawl developer index, structured data from Firecrawl Alexandria providers, and web scraping, crawling, and search through the [Firecrawl CLI](https://github.com/firecrawl/cli).

## Installation

The plugin supports OpenCode 2 and OpenCode 1 (1.18.29 or later) from the same package.

### OpenCode 2

```bash
opencode plugin add @firecrawl/opencode
```

Or add it to `opencode.jsonc` yourself:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["@firecrawl/opencode"]
}
```

### OpenCode 1

Add it to `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@firecrawl/opencode"]
}
```

OpenCode installs the package on the next start. The developer search tool works right away, with no API key and no CLI.

For the web skills (scrape, crawl, map, search, agent), install the Firecrawl CLI:

```bash
npx -y firecrawl-cli@latest init -y --browser
```

## Authentication

Get an API key at [firecrawl.dev](https://firecrawl.dev).

On OpenCode 2, connect Firecrawl with `/connect` in the TUI (or `opencode auth login`). This is the same Firecrawl connection OpenCode's built-in web search uses. Connecting or disconnecting takes effect without a restart. `FIRECRAWL_API_KEY` in the environment works too.

On OpenCode 1, export the key before starting OpenCode:

```bash
export FIRECRAWL_API_KEY=fc-your-api-key
```

With a key, the plugin:

- registers the `firecrawl_alexandria` tool
- passes the key to shell commands, so the CLI is authenticated
- raises the rate limit on developer search

`firecrawl login --browser` authenticates the CLI alone.

## Tools

### `firecrawl_developer_search`

Searches an index of GitHub issues, merged pull requests, READMEs, and library documentation, and returns the **matched passages** as markdown rather than a list of links. Use it for how a library behaves, what an error means, whether a bug was fixed, or what an API contract guarantees.

```
Why does my Playwright script hang on page.goto with a service worker registered?
```

It takes a `query` plus optional `types` (`doc`, `issue`, `pull_request`, `readme`), `repos` (`owner/name`), `sources`, `k`, and `passages`. No API key needed.

### `firecrawl_alexandria`

Finds and runs [Alexandria](https://www.firecrawl.dev/alexandria) data providers: official APIs, licensed publishers, and Firecrawl indexes that return structured records instead of a web page.

```
What has the unemployment rate in California been over the last two years?
```

The agent passes `query` to discover matching capabilities with their input contract and price (free), then `provider`, `capability`, and `options` to run one. A run spends Firecrawl credits at the listed price. The tool only appears once a key is connected.

On OpenCode 1, runs go through the `firecrawl_alexandria` permission, matched on `provider/capability`. To confirm each one before it spends:

```json
{
  "permission": { "firecrawl_alexandria": "ask" }
}
```

OpenCode 2 does not let plugin tools prompt for each call, so runs there are not confirmed one by one. To turn the tool off:

```jsonc
{
  "permissions": [{ "action": "firecrawl_alexandria", "resource": "*", "effect": "deny" }]
}
```

## Skills

The plugin bundles the Firecrawl CLI skills (search, scrape, crawl, map, interact, download, parse, agent, monitor, the developer and research indexes, and Alexandria). They teach the agent when each one fits and how to keep output in a `.firecrawl/` directory instead of the context window.

## Links

- [Firecrawl CLI documentation](https://docs.firecrawl.dev/sdks/cli)
- [Firecrawl CLI on GitHub](https://github.com/firecrawl/cli)
- [OpenCode plugin docs](https://opencode.ai/v2/docs/plugins)

## License

ISC
