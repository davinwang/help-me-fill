# Contributing to Help Me Fill

Thanks for your interest in contributing. This document explains how to get the
project running locally, what we care about in code and commits, and how to open
a PR that will get merged quickly.

## Ground rules

- **Be kind.** Read the [Code of Conduct](./CODE_OF_CONDUCT.md).
- **Security bugs go through private disclosure.** See [SECURITY.md](./SECURITY.md).
  Never open a public issue for a vulnerability.
- **Small, focused PRs.** A 200-line PR that does one thing will merge in days.
  A 2000-line PR that does six things will not.
- **Tests for behavior, not for lines.** New user-facing behavior needs a test.
  Refactors that preserve behavior don't need new tests, but existing ones must
  still pass.
- **Discussion before large changes.** If you plan to add a new provider, change
  the message protocol, restructure the parsers, or touch the build assertions,
  open an issue first so we can align before you spend your weekend on it.

## Prerequisites

- **Node.js 22.18+ or 24+** (the extension uses `chrome.aiOrigin` types and Vite 8)
- **npm 10+**
- A Chromium-based browser (Chrome, Edge, Brave) for manual testing
- Optional: AI provider keys if you want to test live mapping. Chrome built-in AI
  needs no key.

## Setup

```bash
git clone https://github.com/davinwang/help-me-fill.git
cd help-me-fill
npm install
npm run build
```

Then load `dist/` as an unpacked extension in `chrome://extensions/` with
Developer mode on.

## Development workflow

```bash
# Type check without emitting
npm run typecheck

# Unit tests (vitest)
npm run test
npm run test:watch

# Regenerate synthetic PDF fixtures used by unit tests
npm run fixtures

# Serve the fixture forms locally for manual testing
npm run fixtures:serve

# E2E tests (Playwright; runs build first)
npm run test:e2e

# Live benchmark against real providers (requires keys in .env)
npm run benchmark
```

The extension itself has no hot-reload — after changing source, run
`npm run build` and hit the reload icon on the extension card in
`chrome://extensions/`.

## Project layout

```
src/
  ai/                   Provider abstraction, transports, prompts, mapping validation
    transports/         One file per provider family (anthropic, gemini, openai-compatible, builtin)
    registry.ts         Provider catalog and factory
    prompts.ts          Prompt templates
    validate-mapping.ts Zod schemas for AI responses
  background/           Service worker (message router, storage, provider calls)
  content/              Content scripts injected on demand
    scan.ts             Form field discovery
    fill.ts             Safe value setting with framework events
    undo.ts             Snapshot & restore
  parsers/              Document text extraction (lazy chunks)
  shared/               errors.ts, messages.ts, schemas.ts
  sidepanel/            React 19 UI
scripts/                build.mjs (with post-build assertions), fixtures, benchmark
tests/                  unit, integration, e2e (Playwright), fixtures
.qoder/repowiki/        Internal architecture wiki (committed for reference)
```

## Code style

- **TypeScript strict mode**, no `any` without an inline justification comment.
- **ES modules everywhere**, including Node scripts.
- **Named exports** preferred over default exports (except React components).
- **Zod** for any external boundary (AI responses, chrome.storage reads, message payloads).
- **UserError** for anything the UI needs to render gracefully. Reserve raw
  `throw new Error` for programmer bugs.
- **AbortSignal** threaded through anything that can be cancelled (AI calls,
  parsing, filling).
- Match the existing comment density. Comments explain *why*, not *what*.
- No emoji in source code comments, log messages, or commit subjects.

## Build assertions — do not weaken casually

`scripts/build.mjs` ends with several hard assertions:

- Exact permission list (`activeTab`, `scripting`, `sidePanel`, `storage`)
- No `host_permissions`, no `content_scripts`, no `web_accessible_resources`
- Exact optional host permissions matching the provider list
- All manifest-referenced files exist in `dist/`
- Content script has no dynamic `import()` (must not load runtime chunks)

If your change requires weakening one of these, open an issue explaining why
before submitting a PR. These are the security invariants that let us honestly
claim "no server, no telemetry, no ambient permissions" in the README.

## Commit and PR conventions

- Conventional Commits preferred: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`,
  `test:`, `perf:`.
- Subject line ≤ 72 chars, imperative mood, no trailing period.
- Body explains *why*, not *what* — the diff already shows what.
- PRs must pass CI (typecheck + unit tests + build).
- Fill out the PR template. Link the issue with `Fixes #NNN`.
- Squash-merge is the default.

## Adding a new AI provider

1. Add a transport in `src/ai/transports/`. If it's OpenAI-compatible, extend
   `openai-compatible.ts` config instead of writing a new file.
2. Register it in `src/ai/registry.ts` with:
   - id, display name, key page URL, default model, capabilities
   - host permission string
3. Add the host permission to `src/manifest.json` `optional_host_permissions`.
4. **Update `scripts/build.mjs`** to include the new host in the assertion list.
5. Add unit tests in `tests/unit/providers.test.ts`.
6. Update the provider tables in `README.md` and `README.zh-CN.md`.
7. If the provider has quirks (rate limits, response format oddities), document
   them inline in the transport with a comment explaining the workaround.

## Adding a new document parser

1. Create `src/parsers/<format>.ts` exporting the `DocumentLine` interface.
2. Wire it into `src/parsers/index.ts` with lazy import so it stays in its own chunk.
3. Add unit tests in `tests/unit/documents.test.ts` covering at least: happy path,
   empty document, oversized document (must refuse, not truncate), and malformed input.
4. Update the format table in both READMEs.

## Getting help

- Open a [Discussion](https://github.com/davinwang/help-me-fill/discussions) for
  questions or design conversations.
- Open an [Issue](https://github.com/davinwang/help-me-fill/issues) for bugs and
  concrete feature requests.
- Tag the maintainer `@davinwang` if a PR is quiet for more than a week.

## Recognition

Contributors are added to the README's Credits section (opt-out available) and
listed in the release notes for the version their work ships in.

Thank you for helping make form-filling private again.
