# THIRSTY privacy policy

Last updated 30 September 2026. Applies to the THIRSTY desktop app (Windows and Mac) and the
"THIRSTY: AI sip counter" Chrome extension, published by Cooling Loop.

## The short version

THIRSTY counts. It does not collect. Everything it knows stays on your computer, and nothing is
sent to us or to anyone else.

## What the desktop app reads

- Your local Claude Code logs (`~/.claude/projects`) and Codex logs (`~/.codex/sessions`), opened
  read-only. From each line it takes only what it needs to count: whether it is a reply or a
  prompt, a timestamp, a message id and token numbers. The text of your prompts and replies is
  never stored.
- Count events from the THIRSTY Chrome extension, received on `127.0.0.1` (your own computer).

## What the desktop app stores

In its own folder (`%APPDATA%\Thirsty` on Windows, `~/Library/Application Support/Thirsty` on Mac):
daily counts per source, token totals, your streak, badges and settings, reply ids kept for two
days to avoid double counting, and how far it has read each log file. You can delete that folder
at any time.

## What the extension does

On the supported AI chat sites (Claude, ChatGPT, Gemini, Perplexity, Copilot, Grok, DeepSeek,
Mistral and Google AI Studio) it notices when you send a message. To avoid counting the same
message twice it makes a short hash of the text in the moment, which is thrown away and never
saved or sent. What it keeps is a count event: site, time and a random id. It hands those to the
desktop app on `127.0.0.1` and keeps them in Chrome's local extension storage until the app is
running.

On pages served from your own computer (`localhost`) it can show your own stats to you when the
page asks. The stats stay in your browser.

Permissions: `storage` (the local queue), access to `127.0.0.1` (the desktop app) and content
scripts on the sites listed above and on `localhost`. No access to tabs, history, cookies or any
other site.

## What we never do

- No analytics, telemetry, tracking pixels, crash reports or accounts.
- No sale, sharing or transfer of any data, because we receive none.

## Children

THIRSTY is not directed at children under 13 and collects no personal information from anyone.

## Changes and contact

If this policy changes, the new version appears here with a new date. Questions: open an issue at
https://github.com/coolingloop/thirsty-widget.
