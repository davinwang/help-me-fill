# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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
- `package.json` adds `license`, `author`, `homepage`, `repository`, `bugs`,
  `keywords`, and `description` metadata fields.

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
