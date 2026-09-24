# Security Policy

Help Me Fill handles personally identifiable information (PII) — resumes, tax
records, medical intake forms, government applications. Security bugs are
treated as top priority. Please report them responsibly.

## Supported versions

| Version | Supported |
|---|---|
| Latest release on `main` | Yes |
| Anything older | Best-effort |

There is no long-term support branch. Users are expected to run the latest
release.

## Reporting a vulnerability

**Please do NOT open a public GitHub issue for a security vulnerability.**

Instead, use one of these private channels:

1. **GitHub Private Vulnerability Reporting** — enabled on this repo. Use the
   "Report a vulnerability" button under the Security tab.
2. **Email** — `davin.wang@live.com` with subject starting `[SECURITY]`.
   Please encrypt with PGP if the report includes reproducible details; key
   available on request.

Include:

- A description of the vulnerability and its impact.
- Minimal reproduction steps.
- Affected version(s) and browser(s).
- Any suggested remediation, if you have one.
- Whether you want to be credited in the release notes.

## Response SLA

| Milestone | Target |
|---|---|
| Acknowledge receipt | Within 48 hours |
| Initial triage and severity | Within 5 business days |
| Fix or mitigation shipped | Within 30 days for High/Critical |
| Public disclosure coordination | Agreed with reporter before release |

## Scope

The following are in scope:

- Extension source code (`src/**`, `scripts/**`, `manifest.json`)
- Message protocol between side panel, service worker, and content scripts
- Storage of API keys and user documents in `chrome.storage`
- CSP configuration
- Third-party dependency vulnerabilities with a demonstrable attack path
- Provider transport implementations (SSL pinning absent, header injection, etc.)
- Content-script injection into pages the user has not explicitly activated

The following are out of scope:

- Attacks that require the user to install a malicious companion extension
- Attacks that require physical access to an unlocked device
- The security of third-party AI providers themselves (report to them)
- Findings from automated scanners without a working proof of concept

## Threat model summary

For a full description, see [docs/PRIVACY.md](./docs/PRIVACY.md). Key points:

- The extension has **no server component**. There is no backend to breach.
- API keys are sealed with AES-GCM (Web Crypto) before being written to
  `chrome.storage.local`, which is scoped to the extension. The random data key
  lives in the same store, so this is obfuscation against plaintext disk
  inspection — **not** an OS-keychain or hardware-backed vault (extensions have
  no such API). Keys are sent only to the provider they belong to.
- Documents are parsed in-browser and never uploaded anywhere except directly
  to the AI provider the user selected — the request path is:
  `browser → provider`, with no proxy.
- Content scripts are injected on demand into a specific tab, not ambient.
- Saving a provider runs a one-off verification request (a `GET` of the
  provider's model list, or the on-device capability gate). It carries only the
  API key — never document text or field data — and a failure blocks the save.
- The build has hard assertions on the exact permission set. Weakening these is
  treated as a security regression. The single broad entry, `http://*/*` in
  `optional_host_permissions`, exists only so the custom provider can request a
  specific private-LAN origin at runtime (Chrome match patterns cannot express
  CIDR). `localEndpointOrigin()` restricts custom endpoints to loopback and the
  RFC1918 ranges (10/8, 172.16/12, 192.168/16) over `http://`; public and remote
  hosts are rejected, and only the exact host the user enters is ever prompted
  for and granted. No `https://*/*` and no `<all_urls>` are declared.

## Recognition

Reporters who follow this policy and ask to be credited will be listed in the
release notes for the version containing the fix. We do not pay bounties at
this time; if that changes, this document will be updated.
