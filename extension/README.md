# THIRSTY: AI sip counter (Chrome extension)

Counts the messages you send on AI chat sites and hands the count to the THIRSTY desktop pet,
which takes a sip for each one. Manifest V3, no build step: this folder is the extension.

Install by hand: unzip `thirsty-extension.zip` (or use this folder), open `chrome://extensions`,
switch on **Developer mode**, click **Load unpacked** and pick the folder. Run the desktop app too;
without it the extension keeps the counts and delivers them later.

## Sites

Claude, ChatGPT, Gemini, Perplexity, Copilot, Grok, DeepSeek, Mistral and Google AI Studio.
`sites.js` holds one selector table (user message, composer, send button) per site. Chat sites
change their pages often; when counting stops on one, that table is the place to fix.

## How a prompt is detected

A sip needs a composer submit (Enter without Shift, or the send button) followed by exactly one new
user-message node that contains what was in the composer. Sites decorate that node ("You said ...",
screen-reader copies), so the extension hashes a 48-character sample of the composer text and looks
for the same hash anywhere in the node's text. The first 2 s after a page load or a chat switch are
ignored, and two or more new user nodes at once are treated as history loading, so reopening a chat
never counts. Only hashes are held, for at most 10 s; the text is never stored or sent.

For the water estimate it also measures sizes, as character counts: the conversation before your
message, your message, and how much the page grows while the answer streams. When the page has
been still for 4 s the answer is done, and one prompt and one sip go to the desktop app with those
sizes divided by 4 as token estimates.

`test/real-sites.mjs` loads the extension into Playwright's Chromium and checks every site live.
Logged out and automated, several sites stop at a bot check or a login page, which the script
reports instead of counting as a failure.

## Where the count goes

`sw.js` posts `{ source: "web", site, kind: "prompt", ts, id }` to the desktop app on
`127.0.0.1:47821` (trying up to 47841). While the app is not running, events wait in
`chrome.storage.local`. With nothing queued the extension makes no requests at all.

`bridge.js` runs on `localhost` pages. When the page posts `{ type: "thirsty:hello" }` it answers
with `{ type: "thirsty:stats", stats }` from the desktop app, so a local page can show your own
numbers. The `bridgeOrigins` storage value can narrow that list.

## Permissions

`storage`, host access to `http://127.0.0.1/*`, and content scripts on the chat sites and on
`localhost`. No tabs, history, cookies or remote code. Fonts are bundled under the SIL OFL.
