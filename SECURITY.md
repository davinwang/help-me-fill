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
- API keys are stored in `chrome.storage.local`, which is scoped to the
  extension and encrypted at rest by the OS keychain.
- Documents are parsed in-browser and never uploaded anywhere except directly
  to the AI provider the user selected — the request path is:
  `browser → provider`, with no proxy.
- Content scripts are injected on demand into a specific tab, not ambient.
- The build has hard assertions on the exact permission set. Weakening these is
  treated as a security regression.

## Recognition

Reporters who follow this policy and ask to be credited will be listed in the
release notes for the version containing the fix. We do not pay bounties at
this time; if that changes, this document will be updated.
