# Privacy Policy

**Effective date:** 2026-09-23
**Applies to:** the Help Me Fill browser extension (all versions)

## The short version

- We have no servers. There is nothing to breach, nothing to subpoena, nothing to sell.
- Your documents are parsed inside your browser and never uploaded to us.
- Your AI requests go directly from your browser to the provider you chose.
- Your API key is stored only in your browser's extension storage.
- We collect no telemetry, no analytics, no crash reports, no usage data.
- The extension works fully offline if you use the Chrome built-in AI provider.

If any of the above stops being true in a future version, this document will be
updated, the change will appear in [CHANGELOG.md](../CHANGELOG.md), and the
update will be announced before the release ships.

## The long version

### 1. What data the extension touches

| Data type | Where it comes from | Where it goes | Retained? |
|---|---|---|---|
| Your document (PDF, DOCX, XLSX, MD, TXT) | You drop it into the side panel | Parsed in-browser by `pdf.js`, `mammoth`, or SheetJS. Extracted text is sent to the AI provider you selected. | Only in the current session. Cleared when you close the panel or start a new document. Never persisted to disk by the extension. |
| Your API key for a provider | You paste it into the settings UI | `chrome.storage.local`, encrypted at rest by the OS keychain, scoped to the extension. Sent only to the provider it belongs to, in the `Authorization` header of your AI requests. | Until you clear it in settings or uninstall the extension. |
| The web form's fields | Scanned from the tab you're on | Sent to your AI provider as part of the mapping prompt. | Only in the current session. |
| Values you accept and fill | From the review table | Written into the page's form fields using framework-compatible events. | Whatever the page itself does with them. The extension retains nothing after fill. |
| Undo snapshot | Captured before fill | Kept in memory in the content script. | Until you navigate away, close the tab, or reload. |

### 2. What data the extension sends to the extension author

**None.** Zero. There is no help-me-fill.com server. There are no analytics
scripts. There is no crash reporting. There is no `fetch()` to any domain the
maintainer controls.

You can verify this yourself:

```bash
grep -rn "fetch\|XMLHttpRequest" src/
```

Every hit is either (a) a request to a user-configured AI provider, (b) a
Chrome extension API call, or (c) a request to a page the user is actively
filling. None target a help-me-fill domain.

### 3. What data goes to third parties

Only the AI provider you explicitly select in settings. When you trigger a
mapping request:

- The extracted document text is sent to that provider.
- The scanned form fields (labels, types, placeholders, existing values) are
  sent to that provider.
- Your API key is sent to that provider in the request headers.

No other provider sees any of this. Providers are not chained, requests are
not proxied, and there is no fallback that silently switches providers.

**Your use of each provider is governed by that provider's own privacy policy.**
We encourage you to read them:

- Anthropic: https://www.anthropic.com/legal/privacy
- OpenAI: https://openai.com/policies/privacy-policy
- Google (Gemini): https://policies.google.com/privacy
- DeepSeek: https://www.deepseek.com/privacy
- Moonshot (Kimi): https://platform.moonshot.cn/docs/privacy
- Zhipu: https://open.bigmodel.cn/privacy
- OpenRouter: https://openrouter.ai/privacy
- Aliyun Bailian: https://terms.aliyun.com/legal-agreement/terms/suit_bu1_ali_cloud/suit_bu1_ali_cloud202112071754_32178.html

### 4. On-device mode (Chrome built-in AI)

If you select the **Chrome built-in AI** provider (Gemini Nano via
`chrome.aiOrigin`), the AI inference runs **entirely on your device**. No
network calls are made. No API key is needed. Your document and form data
never leave your machine.

This mode requires Chrome 138+ with the appropriate flag or channel enabled.
If your browser doesn't support it, the option is disabled in the UI with a
clear explanation. The extension never silently falls back to a cloud provider.

### 5. Permissions and why we need them

| Permission | Why |
|---|---|
| `sidePanel` | To render the UI where you drop documents and review mappings. |
| `activeTab` | To scan and fill only the tab you're actively working on. We cannot see other tabs. |
| `scripting` | To inject the scan/fill/undo content scripts on demand into the active tab. |
| `storage` | To persist your provider settings and API keys in `chrome.storage.local`. |

Optional host permissions are requested **per provider, only when you enable
that provider**:

- `https://api.openai.com/*` — only if you configure OpenAI
- `https://api.anthropic.com/*` — only if you configure Anthropic
- `https://generativelanguage.googleapis.com/*` — only if you configure Gemini
- `https://api.deepseek.com/*` — only if you configure DeepSeek
- `https://open.bigmodel.cn/*` — only if you configure Zhipu
- `https://openrouter.ai/*` — only if you configure OpenRouter
- `https://api.moonshot.cn/*` — only if you configure Moonshot
- Your Bailian endpoint — only if you configure Qwen

We do not request `<all_urls>`. We do not request `tabs`, `webRequest`,
`cookies`, `history`, `bookmarks`, or `notifications`. The build script has a
hard assertion on the exact permission list; if the shipped extension's
permissions ever drift from the list above, the build fails.

### 6. Data we do NOT collect

- No telemetry
- No analytics
- No crash reports
- No usage metrics
- No feature flags tied to a user identity
- No A/B testing
- No advertising identifiers
- No cross-site tracking
- No fingerprinting

### 7. Children's privacy

The extension has no server component and collects no data. It is not directed
at children under 13 and does not knowingly collect information from anyone,
of any age.

### 8. Changes to this policy

Any change to this policy will:

1. Be reflected in an updated `docs/PRIVACY.md` with a new effective date.
2. Appear in [CHANGELOG.md](../CHANGELOG.md) under the release that ships it.
3. Be announced in the release notes before the release is published to any
   store.

Material changes that would weaken privacy (adding telemetry, adding a
server, changing the permission set) will not ship without an explicit
major-version bump and a prominent notice in the extension UI on first run
after upgrade.

### 9. Contact

Questions about this policy: `davin.wang@live.com`.

To report a security issue privately, see [SECURITY.md](../SECURITY.md).

### 10. Auditing

The extension is MIT-licensed and the source is public. The most trustworthy
answer to "does it do what it says?" is:

```bash
git clone https://github.com/davinwang/help-me-fill.git
cd help-me-fill
npm install
npm run build
# Load dist/ as an unpacked extension in Chrome
```

The build produces a non-obfuscated, Terser-minified bundle. It can be
inspected directly in `dist/`. We deliberately do not obfuscate release builds
because an un-auditable privacy tool is not a privacy tool.
