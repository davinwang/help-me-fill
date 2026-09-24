# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Ollama preset** (`src/ai/registry.ts`) — local, keyless, OpenAI-compatible
  at `http://localhost:11434`. Default model `llama3.2`.
- **LM Studio preset** (`src/ai/registry.ts`) — local, keyless, OpenAI-compatible
  at `http://localhost:1234`. Default model `local-model`.
- **Custom local server preset** — user-configurable endpoint for llamafile,
  vLLM, or any local OpenAI-compatible server. Endpoint validated by
  `localEndpointOrigin()` to loopback and the RFC1918 private ranges
  (`192.168.0.0/16`, `10.0.0.0/8`, `172.16.0.0/12`); public/remote URLs are
  rejected with a `UserError`. API key optional; `Authorization` header omitted
  when empty.
- **Save-time provider verification** (`verifyProvider()` in `src/ai/provider.ts`)
  — a lightweight `GET` of the provider's model list (or the on-device capability
  gate) confirms the key, endpoint, and connectivity before saving; a failure
  blocks the save. It sends only the API key, never document text.
- **AES-GCM encryption of the API key at rest** (`src/shared/secret-box.ts`) — the
  key is sealed into `chrome.storage.local` (the random data key is stored
  alongside, so this is obfuscation, not an OS-keychain vault). Non-sensitive
  provider/model/endpoint preferences stay unencrypted.
- **`kind` field on every provider** (`cloud` / `local` / `builtin`) driving
  settings-UI badges, cloud data notice beside Enable, local install hints,
  and consent copy that distinguishes the three modes.
- **`resolveProvider()`** in `src/ai/registry.ts` as the single source of
  truth for a provider's network identity, replacing scattered lookups.
- `http://localhost/*`, `http://127.0.0.1/*`, and `http://*/*` added to manifest
  `optional_host_permissions` and to the `scripts/build.mjs` assertion list,
  preserving the exact-permission-set invariant. The broad `http://*/*` entry
  exists only so a custom private-LAN origin can be requested at runtime (match
  patterns cannot express CIDR); `localEndpointOrigin()` still restricts every
  request to loopback/RFC1918, and no `https://*/*` is declared.
- **Brand icon set** at 16/32/48/128/512 PNGs under `brand/icons/`, sourced
  from `brand/icon-master.png`. Replaces the previous procedural pixel-loop
  generator in `scripts/build.mjs`.
- **Hero banner** at `docs/assets/hero-banner.png`, referenced from the top
  of both READMEs.
- `scripts/render-icons.ps1` — Windows PowerShell helper that regenerates
  the size variants from the master using built-in System.Drawing. No npm
  dependency required.
- Project documentation foundation: `README.md`, `README.zh-CN.md`,
  `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `ROADMAP.md`,
  `docs/PRIVACY.md`.
- GitHub issue templates (`bug_report.yml`, `feature_request.yml`, `config.yml`)
  and pull request template.
- GitHub Actions CI workflow (typecheck, unit tests, build with post-build
  assertions) on push and PR to `main`.
- GitHub Sponsors funding configuration.
- Chrome extension `_locales/` for `en` and `zh_CN` — enables localized store
  listing without changing the manifest name string per language.
- Expanded `.gitignore` covering Node, Vite, Chrome extension packaging,
  OS metadata, and editor artifacts.
- MIT `LICENSE`.
- README "Verifiable privacy" section with code-linked audit table
  (`DisclosurePreview.tsx`, `compactFields` allowlist, `SYSTEM_PROMPT`
  abstention rule, prompt-injection defense, never-auto-submit, undo
  snapshot, zero-telemetry grep, build-time permission assertions,
  non-obfuscated release builds).
- PRIVACY.md corrected to reflect the actual `compactFields` allowlist —
  current field values and page URL are never sent to the AI provider.

### Changed
- Manifest `name` localized via `__MSG_appName__` — defaults to
  "Help Me Fill" in English and "帮我填" in Simplified Chinese.
- Manifest `description` rewritten for Chrome Web Store search clarity.
- Manifest adds `homepage_url`, `author`, and `default_locale`.
- Manifest `icons` adds size 32 for HiDPI toolbars.
- `package.json` adds `license`, `author`, `homepage`, `repository`, `bugs`,
  `keywords`, and `description` metadata fields.
- README provider tables restructured to show Cloud / Local / On-device kind
  per row, with the new Ollama and Custom local server entries. Comparison
  table adds a "Local LLM support" row.
- `scripts/build.mjs` copies icons from `brand/icons/` instead of generating
  them procedurally; the `zlib` import and CRC32/PNG-chunk helpers are gone.
- **Provider settings UI redesigned** (`src/sidepanel/components/ProviderSettings.tsx`):
  the dropdown groups options under Cloud / Local / On-device `<optgroup>`s and shows
  clean provider names (no inline kind suffix); the selected kind appears once on the
  colored badge, and a "🔑 Key saved" chip plus a per-option key glyph mark providers
  with a stored key. The primary button is contextual — "Save & verify key" (cloud),
  "Save & verify" (local), "Enable on-device model" (on-device).

### Removed
- **Moonshot (Kimi)** host permission (`https://api.moonshot.cn/*`) dropped
  from `src/manifest.json` and from the `scripts/build.mjs` assertion list.
  The provider entry had already been removed from `src/ai/registry.ts` at
  some earlier point, leaving the manifest, build assertion, and
  `tests/unit/providers.test.ts` iteration out of sync with the registry.
  Reason for not restoring: Kimi has no flash-class model — flagship-only
  pricing is too heavy for a per-form mapping call. Users who want Kimi
  can route through OpenRouter.
- **Aliyun Bailian (Qwen dedicated host)** permission
  (`https://llm-8qqdhr2i4l0ydvm2.cn-beijing.maas.aliyuncs.com/*`) dropped
  from the manifest and build assertion for the same drift reason. Not
  restored because the pinned host was an account-provisioned dedicated
  Bailian maas deployment that only authenticates keys from that specific
  account — unsuitable for a distributed extension. A user-configurable
  "custom OpenAI-compatible endpoint" provider is on the roadmap and will
  cover Qwen, DashScope, and any other OpenAI-compatible service.
- Provider comparison in both READMEs updated from "9+" to "7+" to match
  the actual registry after the removals.

## [0.1.0] — 2026-09-23

### Added
- Initial public release of the codebase.
- Three-stage pipeline: parse → map → fill, with human review before fill.
- Document parsers for PDF (via `pdf.js`), DOCX (via `mammoth`), XLSX (via
  SheetJS), Markdown, and plain text.
- AI provider transports:
  - Chrome built-in AI (Gemini Nano) — on-device, zero network, no key.
  - Anthropic (Claude).
  - Google Gemini.
  - OpenAI-compatible family: OpenAI, DeepSeek, Moonshot (Kimi), Zhipu (GLM),
    OpenRouter, Aliyun Bailian (Qwen dedicated endpoint), and any custom
    OpenAI-compatible URL.
- Capability-gated provider registry with model defaults and per-provider key
  page URLs.
- Content-script scanner with framework-aware safe filling (React, Vue,
  Angular) and one-click undo via snapshot/restore.
- React 19 side panel with drop zone, document preview, review table,
  disclosure preview, fill results, and provider settings.
- Zod schemas for AI mapping responses with strict validation and typed
  `UserError` propagation.
- Playwright E2E harness driving real Chrome and Edge with the built extension
  loaded against fixture forms.
- Vitest unit tests covering parsers, mapping validation, provider transports,
  and built-in AI capability gates.
- Build pipeline via Vite with production Terser minification (readable, no
  obfuscation) and post-build assertions on permissions, CSP, and content-script
  chunking.
- Lazy-loaded parser chunks so first-paint cost stays minimal.
- Oversized-input refusal for on-device providers (no silent truncation).
- Session re-lock and provider gating for the workflow steps.

[Unreleased]: https://github.com/davinwang/help-me-fill/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/davinwang/help-me-fill/releases/tag/v0.1.0
