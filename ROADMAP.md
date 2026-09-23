# Roadmap

Public roadmap for Help Me Fill. Items are grouped by the phase they belong to,
not by strict priority within the phase. Vote on proposed items by reacting
👍 to the tracking issue (each item will get one).

If you want something on this list that isn't here, open a
[Discussion](https://github.com/davinwang/help-me-fill/discussions) first so we
can shape it before it becomes an issue.

---

## Now — v0.2 (next ~4 weeks)

Focused on making the extension usable on real-world job boards and publishing
to the stores.

- [ ] **Chrome Web Store publication** — listing, screenshots, description,
      privacy practices declaration, single-purpose justification.
- [ ] **Microsoft Edge Add-ons publication** — same manifest, second channel.
- [ ] **Iframe support** — Workday, Greenhouse, Lever, SmartRecruiters embed
      their forms in iframes. Without this, the job-seeker wedge is broken.
      Requires `all_frames: true` on on-demand injection and a per-frame scan
      aggregator in the side panel.
- [ ] **File input support** — auto-attach a resume PDF from the parsed
      document set into `<input type="file">` fields. Uses `DataTransfer`
      synthesis, gated by an explicit user confirmation per field.
- [ ] **Real brand icon set** — replace procedurally generated placeholder in
      `scripts/build.mjs` with a proper SVG source rendered to 16/32/48/128/512.
- [ ] **Demo GIF and screenshot capture pipeline** — Playwright script that
      records the demo and captures store screenshots reproducibly.
- [ ] **Landing page** — VitePress or Astro site at `website/`, deployed to
      Cloudflare Pages, linked from `manifest.homepage_url`.

## Next — v0.3 (~2 months out)

Focused on differentiation and reaching power users.

- [ ] **Firefox port** — Manifest V3 with browser-specific shims. Publish to
      addons.mozilla.org.
- [ ] **UI internationalization** — extract strings from React components,
      wire up `i18next` or `@formatjs/intl`, ship English + Simplified Chinese.
      Community-driven translations after.
- [ ] **Form profiles** — save common answers ("home address", "work history",
      "references") across sites and merge them with document parsing.
- [ ] **Multi-document context** — resume + cover letter + reference sheet in
      a single mapping pass. Requires prompt budgeting and deduplication.
- [ ] **Shadow DOM traversal** — LinkedIn and several modern design systems
      use shadow roots. Extend the scanner in `src/content/scan.ts`.
- [ ] **Custom widget handling** — rich comboboxes, JS date pickers, tag
      inputs. Adapter pattern with per-widget heuristics.
- [ ] **Site-specific adapters** — hand-tuned for Workday, Greenhouse, Lever,
      SmartRecruiters, with retry logic and framework-quirk handling.
- [ ] **OCR for scanned PDFs** — on-device via `tesseract.js` in a lazy chunk.
      Only loaded when a text-layer-less PDF is detected.

## Later — v0.4+ (~4-6 months out)

Focused on retention and community.

- [ ] **Import from external sources** — LinkedIn profile (user-driven export),
      browser autofill, 1Password, Bitwarden.
- [ ] **Cloud sync via user's own storage** — Google Drive, Dropbox, or
      WebDAV. Never through a help-me-fill server.
- [ ] **Batch filling** — fill the same profile into multiple tabs at once.
- [ ] **Signature support** — draw once, insert into signature fields.
- [ ] **Field validation feedback** — surface site-side validation errors back
      into the review table before submitting.
- [ ] **Audit log export** — for enterprise/compliance users who need a record
      of what was filled where.
- [ ] **Keyboard-driven power mode** — every action reachable without a mouse.
- [ ] **Prompt template customization** — per-field-type prompt overrides for
      advanced users.
- [ ] **Community translation program** — Crowdin or Weblate setup.

## Non-goals

These will not ship, ever, because they contradict the project's core promise:

- ❌ **A help-me-fill server or cloud account.** No backend, no user database,
      no shared key pool. BYO-key or nothing.
- ❌ **Telemetry or analytics.** Not even anonymized crash reports. If you want
      to report a bug, you open an issue.
- ❌ **Auto-submit.** The extension fills fields; it never clicks submit.
      The human always makes the final call.
- ❌ **Silent truncation of oversized documents.** On-device providers refuse
      the input and surface the reason. We do not quietly drop context.
- ❌ **Obfuscated release builds.** Minified with Terser in readable mode.
      The published extension must be auditable.

## How this roadmap is maintained

- Items move from **Later** to **Next** to **Now** as capacity allows.
- Shipped items are removed from this file and appear in [CHANGELOG.md](./CHANGELOG.md).
- Dropped items get a short note here explaining why, so the history is visible.
- Community-voted items are prioritized, but the maintainer reserves final call
  on scope and sequencing.
