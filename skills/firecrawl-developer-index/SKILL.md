---
name: firecrawl-developer-index
description: |
  Search issues, merged pull requests, READMEs, and library documentation for primary-source answers to developer questions.

  USE THE DEVELOPER INDEX FOR:
  - How a library or API behaves, what it returns, what is required, what the default is
  - What an error message or stack trace means, and whether the bug was fixed
  - Version-specific behaviour and regressions
  - "why does X do Y", "is this a known bug", "what changed in this release"

  Prefer this over a general web search for any of the above: it returns the matched passages from the issue, the merged pull request, the README, or the doc page, so you can answer from the source instead of pointing at a page. Fall back to the Firecrawl CLI for the open web when the question is a comparison, an opinion, news, or a project that is not indexed.
---

# Firecrawl Developer Index

Answer a developer question from the primary source: the issue where the bug was reported, the merged pull request that fixed it, the README or documentation page that states the contract. A blog post that describes a behaviour is a weaker answer than the passage that defines it, so reach for the index first and the open web second.

There is **no fixed recipe**. Read the question, decide what kind it is, and choose the approach below. A literal error string wants a different move than "how do I do X". Don't run machinery a question doesn't call for.

## The surfaces, and what each is uniquely good at

- **`firecrawl_developer_search(query, k?, types?, repos?, sources?, passages?)`**
  Ranked results over the whole index, returned as markdown. Each result carries an `id` (`issue:owner/repo#123`), a `url`, and the **matched passages**, so tables and code blocks survive. The artifact kind is the `id` prefix: `doc:`, `issue:`, `pull_request:`, or `readme:`.
  This is the default first move for a developer question, and the only surface that hands you the passages. It works without an API key; a `FIRECRAWL_API_KEY` in the environment only raises the rate limit.
  `k` is 1 to 100 and defaults to 10. `passages` is 1 to 5 and defaults to 1.

- **`firecrawl developer <query> [--limit <n>]`** (CLI)
  The same index from the shell. Reach for it when you are already scripting a batch of lookups or want the output written to a file rather than into context.

- **`firecrawl search <query>` / `firecrawl scrape <url>`** (CLI)
  General web search and fetch, for what no primary source states: a comparison between two libraries, an outage, a migration write-up, a project with no public repository or indexed docs. Also the follow-through when a hit is the right page but you need all of it, so `scrape` the result's `url`.

## Filters, and what each one costs you

- `types` picks which of `doc`, `issue`, `pull_request`, `readme` to search, and defaults to all four. Narrowing here is the cheapest way to sharpen a query.
- `repos` (`owner/name`) scopes the repository half, meaning `issue`, `pull_request`, and `readme`. `sources` (documentation source ids, at most 20) scopes the documentation half, meaning `doc`. Passing both **unions** the halves rather than intersecting them.
- A filter that cannot match any requested `type` is an error rather than an empty list, so don't pass `repos` without a repository type in `types`, or `sources` without `doc`.
- When a scope is not in the index the result says so explicitly. That note means no rephrasing will ever help: drop the scope and search the whole index, or go to the web.
- `passages` is the _maximum_ passages per result, not a guarantee. Raise it when one page is clearly the right page but the first passage is the wrong part of it.

## Match the approach to the question

- **Literal error message or stack-trace string** → search the string itself plus the library name, with `types: ["issue", "pull_request"]`. Whoever hit it filed it. If nothing matches, strip the volatile parts (paths, line numbers, ids, addresses) and retry; the invariant middle of the message is what is indexed.
- **Conceptual "how do I do X"** → the full question in natural language, all four types. The answer is usually a `doc` or a `readme`; raise `passages` before raising `k`.
- **Known bug** → the issue reports it, the merged pull request _fixes_ it, and the fix is what you want. Search `types: ["issue", "pull_request"]`, then re-query the issue's own terms scoped to its repo with `types: ["pull_request"]`. A merged PR's passages tell you what changed and in which direction.
- **API contract** ("what does X return", "is Y required", "what is the default") → `readme` and `doc` are authoritative and a blog post is not. Use `types: ["readme", "doc"]`. If the contract looks like it moved, follow up with `pull_request` for the change that moved it.
- **Version-specific behaviour** → an issue's opening report describes the broken version; its resolution supersedes it. Raise `passages` to see further into the thread, and read the resolution and the linked pull request before answering. Never answer from an opening report alone.
- **Scoped to one library** → `repos: ["owner/name"]` when you know the slug, plus `sources` if you want its docs in the same call.
- **Comparison, opinion, news, or an unindexed project** → the open web, via `firecrawl search` and then `firecrawl scrape` on whatever deserves a full read. Combining is often right: take the contract from the index and the trade-off from the web.

## Principles

- **Quote the passage, cite the `url`.** The passages are the evidence; hand them over rather than paraphrasing them into a claim the reader can't check. `title` is frequently absent on `doc` results, so fall back to the `url`.
- **A merge supersedes a report.** When an issue and a pull request disagree, the merged pull request is the current behaviour. Say which one you read.
- **Scope last, not first.** Search the whole index, then narrow with `types` or `repos` once you know what the hits look like. Scoping first hides the result that would have told you where to look.
- **Go to the web when the index has nothing to say.** Trade-offs, ecosystem opinion, and anything about an unindexed project are web questions. Don't force them through the index, and don't dress a general web page up as a primary source.
