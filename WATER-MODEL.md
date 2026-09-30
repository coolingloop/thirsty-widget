# How THIRSTY estimates water per AI reply

Version 2, 30 September 2026. Code: `widget/engine/water.js`.

No AI provider publishes water per reply, so THIRSTY builds an estimate from the measurements that
do exist, in two steps: energy from the reply's tokens, then water from that energy for the data
centres that serve it. Expect it to be right within a factor of about three either way. The point is
the relative size: a short chat answer and an agent turn that re-reads a whole project are very
different amounts of water.

## Step 1: energy from tokens

```
energy (Wh) = size x (fresh input x 250 + cache writes x 310 + cache reads x 25 + output x 600) / 1,000,000
```

| Token kind | Wh per million tokens | Why |
|---|---|---|
| Output (including hidden reasoning) | 600 | A typical chat answer of about 500 tokens comes to 0.3 Wh, matching three independent anchors below |
| Fresh input | 250 | Epoch AI: a 10,000-token prompt pushes a query to about 2.5 Wh |
| Cache write | 310 | 1.25 x input, the price ratio providers charge for writing the prompt cache |
| Cache read | 25 | 0.1 x input, the price ratio for re-reading cached context |

Model size: Opus-class models count 1.7 times (their price relative to mid-size models),
mini, Haiku, Flash, Lite and Luna models 0.4 times, everything else 1.

Anchors for a typical chat reply:

- Google measured its median Gemini Apps text prompt at 0.24 Wh, counting accelerators, host
  machines, idle capacity and data-centre overhead ([arXiv 2508.15734](https://arxiv.org/abs/2508.15734), 2025).
- OpenAI states an average ChatGPT query uses about 0.34 Wh (Sam Altman, June 2025).
- Epoch AI estimates about 0.3 Wh for a typical GPT-4o query, rising to about 2.5 Wh with a
  10,000-token prompt and toward 40 Wh at 100,000 tokens
  ([Epoch AI](https://epoch.ai/gradient-updates/how-much-energy-does-chatgpt-use), 2025).

Cross-checks: Jegham et al. measured Claude 3.7 Sonnet at 0.84, 2.78 and 5.52 Wh for prompts of
100/300, 1,000/1,000 and 10,000/1,500 input/output tokens
([How Hungry is AI?](https://arxiv.org/abs/2505.09598), 2025); this model gives 0.2, 0.9 and 3.4 Wh,
so it sits between the providers' own numbers and that benchmark. Scaling token kinds by price
follows Simon Couch's estimate for Claude Code
([Electricity use of AI coding agents](https://simonpcouch.com/blog/2026-01-20-cc-impact/), 2026).

## Step 2: water from energy

```
water (mL) = energy (Wh) x (on-site cooling water + power-plant water), both in mL per Wh
```

| Cloud | Used for | On site | Power plants | Total mL per Wh | Source |
|---|---|---|---|---|---|
| Amazon Web Services | Claude Code, claude.ai, Perplexity | 0.16 | 3.14 | 3.30 | Jegham et al. (WUE 0.18 / PUE 1.14) |
| Microsoft Azure | Codex, ChatGPT, Copilot | 0.27 | 3.14 | 3.41 | Jegham et al. (WUE 0.30 / PUE 1.12) |
| Google | Gemini, AI Studio | 1.08 | 3.14 | 4.23 | Google: 0.26 mL on site per 0.24 Wh |
| China | DeepSeek | 0.94 | 6.02 | 6.96 | Jegham et al. (WUE 1.20 / PUE 1.27) |
| US average | Grok, Mistral | 0.37 | 3.14 | 3.52 | LBNL 2024: 17.4 billion gallons over 176 TWh in 2023 |

On-site water is cooling water evaporated at the data centre. Power-plant water is what the
electricity grid consumes to generate that energy (3.14 L per kWh for the US grid in Jegham et al.;
the Berkeley Lab report's own indirect figure, 211 billion gallons over 176 TWh, is higher, about
4.5 L per kWh, so this part is if anything conservative)
([LBNL 2024](https://eta.lbl.gov/publications/2024-lbnl-data-center-energy-usage-report)).

## What that means

| Reply | Energy | Water |
|---|---|---|
| Short chat answer (40 tokens in, 500 out) | 0.31 Wh | about 1 mL |
| Summarising a 40-page PDF in a chat (20,000 fresh tokens in) | about 5 Wh | about 18 mL |
| Codex turn with 65,000 tokens of context, mostly cached | about 3.3 Wh | about 11 mL |
| Claude Opus agent turn re-reading 300,000 cached tokens | about 16 Wh | about 53 mL |

## Where the tokens come from

- Claude Code: the exact input, cache write, cache read and output tokens of every reply, from
  `~/.claude/projects` logs, and the model name.
- Codex: the last-turn token usage in `~/.codex/sessions` logs (cached input split out, reasoning
  counted as output) and the model from the turn context.
- Web chats: the extension measures character counts only (the conversation before your message,
  your message, and how much the page grows while the answer streams) and divides by 4. If the
  answer's length cannot be measured it counts as a typical 500-token answer.

## Limits

- Providers do not publish per-reply energy for today's models; model sizes and hardware change.
- Price ratios are a stand-in for the energy of cached and fresh tokens.
- Hidden reasoning in web chats cannot be seen, so reasoning-heavy web answers are undercounted.
- Water intensity varies by site, season and grid; these are averages.
- Days recorded before version 2 keep their old flat estimate of 3.5 mL per reply. When version 2
  starts, the last 30 days of Claude Code and Codex logs are read again with the new model.
