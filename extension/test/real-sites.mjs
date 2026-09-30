// Real-site check for the extension: node extension/test/real-sites.mjs [site ...]
// Loads the unpacked extension into Playwright's Chromium (headless, fresh profile, logged out),
// opens each chat site, checks the composer / send / user-message selectors from sites.js
// against the live page, sends one short prompt where the site allows logged-out chats, and
// checks that the count arrived at the desktop app (GET /stats on 127.0.0.1).
// Writes extension/test/real-sites-results.json and screenshots in tools/.tmp/sites/.
import {chromium} from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ext = path.resolve(here, '..');
const shots = path.resolve(here, '../../tools/.tmp/sites');
fs.mkdirSync(shots, {recursive: true});
const sandbox = {module: {}};
vm.runInNewContext(fs.readFileSync(path.join(ext, 'sites.js'), 'utf8'), sandbox);
const SITES = sandbox.module.exports;
const START = {
  chatgpt: 'https://chatgpt.com/', claude: 'https://claude.ai/new', gemini: 'https://gemini.google.com/app',
  perplexity: 'https://www.perplexity.ai/', copilot: 'https://copilot.microsoft.com/', grok: 'https://grok.com/',
  deepseek: 'https://chat.deepseek.com/', mistral: 'https://chat.mistral.ai/chat', aistudio: 'https://aistudio.google.com/prompts/new_chat',
};
const PROMPT = 'Reply with just the word ok.';
const port = Number(process.env.THIRSTY_PORT) || 47821;
const stats = async () => (await (await fetch(`http://127.0.0.1:${port}/stats`)).json()).bySource;
const only = process.argv.slice(2);

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'thirsty-ext-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium', headless: true, viewport: {width: 1280, height: 900},
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
const results = [];
try {
  let [worker] = context.serviceWorkers();
  worker ||= await context.waitForEvent('serviceworker', {timeout: 15000});
  console.log('extension worker', worker.url().split('/')[2]);
  for (const [site, sel] of Object.entries(SITES)) {
    if (only.length && !only.includes(site)) continue;
    const r = {site, url: START[site]};
    const page = await context.newPage();
    try {
      await page.goto(START[site], {waitUntil: 'domcontentloaded', timeout: 45000});
      await page.waitForTimeout(8000);
      // Google's cookie notice covers the composer when logged out; decline the optional cookies.
      const reject = page.getByRole('button', {name: /^Reject all$/i});
      if (await reject.count()) {
        await reject.first().click();
        await page.waitForTimeout(3000);
        r.declinedCookies = true;
      }
      r.finalUrl = page.url();
      r.title = (await page.title()).slice(0, 80);
      r.composer = await page.locator(sel.composer).count();
      r.send = await page.locator(sel.send).count();
      r.userBefore = await page.locator(sel.user).count();
      if (r.composer) {
        const before = (await stats().catch(() => ({})))['web:' + site]?.sips ?? null;
        await page.locator(sel.composer).first().click({timeout: 5000});
        await page.keyboard.type(PROMPT, {delay: 25});
        await page.waitForTimeout(400);
        r.sendAfterTyping = await page.locator(sel.send).count();
        await page.keyboard.press('Enter');
        const deadline = Date.now() + 30000;
        while (Date.now() < deadline && (await page.locator(sel.user).count()) <= r.userBefore) await page.waitForTimeout(500);
        r.userAfter = await page.locator(sel.user).count();
        r.userText = r.userAfter ? (await page.locator(sel.user).last().innerText().catch(() => '')).slice(0, 80) : '';
        if (before !== null) {
          let after = before;
          const end = Date.now() + 15000;
          while (Date.now() < end && after <= before) {
            await page.waitForTimeout(1000);
            after = (await stats())['web:' + site]?.sips ?? before;
          }
          r.sipsBefore = before;
          r.sipsAfter = after;
        }
        r.counted = r.sipsAfter > r.sipsBefore;
      }
      const body = (await page.locator('body').innerText().catch(() => '')).slice(0, 2000);
      const wall = /verify you are human|security verification|checking your browser/i.test(body) ? 'BOT CHECK'
        : /403 error|request blocked|access denied/i.test(body) ? 'BLOCKED (403)'
        : /not available in your region|not yet available/i.test(body) ? 'REGION BLOCK'
        : body.trim().length < 40 ? 'PAGE NEVER LOADED (bot check iframe)'
        : /accounts\.google\.com|\/login|\/signin|sign in|log in/i.test(r.finalUrl + ' ' + body.slice(0, 300)) ? 'LOGIN WALL' : '';
      r.verdict = r.counted ? 'COUNTED' : r.composer ? (r.userAfter > r.userBefore ? 'SENT, NOT COUNTED' : 'COMPOSER OK, NO USER NODE') : wall ? `UNVERIFIED: ${wall}` : 'NO COMPOSER: selector needs a look';
    } catch (e) {
      r.error = e.message.split('\n')[0];
      r.verdict = 'ERROR';
    }
    await page.screenshot({path: path.join(shots, site + '.png')}).catch(() => {});
    console.log(site.padEnd(11), r.verdict, JSON.stringify({composer: r.composer, send: r.send, user: [r.userBefore, r.userAfter], sips: [r.sipsBefore, r.sipsAfter], url: r.finalUrl, error: r.error}));
    results.push(r);
    await page.close();
  }
} finally {
  await context.close();
  fs.rmSync(profile, {recursive: true, force: true, maxRetries: 5, retryDelay: 300});
  const file = path.join(here, 'real-sites-results.json');
  const previous = only.length && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).results.filter((r) => !only.includes(r.site)) : [];
  fs.writeFileSync(file, JSON.stringify({ran: new Date().toISOString(), results: [...previous, ...results]}, null, 2));
}
