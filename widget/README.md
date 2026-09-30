# THIRSTY desktop app

Electron app: a transparent, always-on-top pet plus a dashboard window. `npm start` runs it from
source; `npm run dist:win` or `npm run dist:mac` builds installers into `dist/`.

He never takes keyboard focus. Drag his body to move him, click to poke him, double-click for the
dashboard, right-click (or the tray / menu-bar icon) for the menu: sound, size S/M/L, ghost mode
(clicks go through him), pause tracking for an hour, reset position, start at login, quit. On the
Mac he has no Dock icon; the Dock icon appears only while the dashboard is open.

## What it counts

- **Claude Code**: distinct assistant message ids in `~/.claude/projects/**/*.jsonl`, subagents
  included. A reply streamed as several entries counts once. Prompts are human messages, not tool
  results or metadata. Tokens are counted once per message.
- **Codex**: new `token_count` totals in `~/.codex/sessions/**/rollout-*.jsonl`, repeated totals
  ignored. Prompts are human messages, not injected instructions or environment context.
- **Web**: the Chrome extension (`../extension`) reports one prompt and one sip per message you
  send on the supported AI chat sites.

Plain chats in the Claude and ChatGPT desktop apps leave no local log and cannot be counted.
Tokens are shown on their own and never turned into water.

One reply is one sip of 3.5 mL (see the root README for the sources). After the first scan the
daily ration is 80% of your median day over the last 14 active days, rounded to 0.5 L (minimum
0.5 L, 2 L with no history); a value you set yourself is never overwritten. Days under ration
build the streak; the planet goes parched (under 3 days), okay (3 to 13), lush (14 and up).

## Files and privacy

Logs are opened read-only and never written, locked, renamed or truncated. No prompt or reply text
is stored. The app keeps daily counts per source, numeric usage, reply ids for de-duplication
(two days), settings and byte offsets, in:

- Windows: `%APPDATA%\Thirsty`
- Mac: `~/Library/Application Support/Thirsty`
- Linux: `~/.config/Thirsty`

First launch scans the last 30 days in a worker thread. After that it reads only appended bytes,
driven by file-system watches with a 60 s rescan as a safety net.

## Local API

HTTP on `127.0.0.1:47821` (next free port up to 47841, written to the `port` file):

- `GET /health`: `{ ok, ready, progress }`
- `GET /stats`: today, yesterday, 14-day series, by source, streak, ration, badges, lifetime.
- `POST /event`: `{ source: "web", site, kind: "prompt", ts, id }`, only from `chrome-extension://`
  origins, de-duplicated by id.

CORS allows extension origins, `localhost` pages and the website set in the dashboard. Nothing is
sent off the machine.

## Environment overrides

| Variable | Purpose |
|---|---|
| `THIRSTY_DATA_DIR` | Counts, settings, offsets and Chromium cache |
| `THIRSTY_CLAUDE_DIR` | Claude Code log root |
| `THIRSTY_CODEX_DIR` | Codex log root |
| `THIRSTY_PICTURES_DIR` | Where Share My Week saves its card (default: Pictures) |
| `THIRSTY_PORT` | First port to try (default 47821) |
| `THIRSTY_TEST_MODE=1` | Test runs: no login item, no single-instance lock |

## Tests

- `npm test`: engine unit tests on scrubbed log fixtures.
- `npm run smoke`: launches the packaged app from `dist/` against fake logs in a temp folder and
  checks the scan, a live sip and the API. Pass a path to test another build.
- `npm run verify`: the full Electron and Chromium acceptance run (needs Playwright's Chromium),
  including a read-only pass over your own real logs. Quit a running pet first (the extension
  phase refuses to run while one holds port 47821). Item 4 waits two minutes for new Codex
  replies, so it needs a Codex session working at the time. Single phases:
  `node test/acceptance.js --phase=extension|shots|real|idle|punctuation`.

## Windows from source

`install-windows.ps1` adds a Start Menu shortcut that runs this folder with the local Electron and
starts the pet; `uninstall-windows.ps1` removes it and the login item and keeps your counts. No
admin rights needed.
