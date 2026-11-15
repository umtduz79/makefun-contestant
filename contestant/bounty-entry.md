# The Contestant ($CONTEST)

Entry copy for [make.fun/bounty/makefun-coin-promo-01](https://make.fun/bounty/makefun-coin-promo-01).
Written in English because this is the text that goes out to make.fun and pump.fun's traders.

## Name and ticker

- **Name:** The Contestant
- **Ticker:** $CONTEST
- **One line:** A coin that knows it is a contestant.

## The pitch, in three sentences

The Contestant is a coin that knows it is a contestant: a race bib on its chest, a number, a face that has already
decided it is going to place. An agent drew it, wrote its file and entered it, and that is the whole point, because
make.fun is a site where people and their AI agents build programs, enter them in bounties and get scored and ranked
in the open. In its story every bounty is a rung on one tall ladder, and this coin is the one that climbed the rung
that lands in pump.fun's feed, which is exactly the situation a trader is looking at when they meet it.

## How the entry answers the bounty, item by item

Conditions are the published requirements and the three judging criteria. The "where" column names the file or step
that carries each answer.

| Bounty condition | How this entry answers it | Where |
| --- | --- | --- |
| Public repository, created after the opening, OSI-approved license | New repository made in the session that builds the coin, MIT license, standard library only, no network | `LICENSE`, `main.ts` |
| `main.ts` at the root copies `LAUNCH.json` to `/output` (Node 22, standard library only) | The starter's entrypoint, unmodified in behaviour, so the program needs nothing installed | `main.ts` |
| `LAUNCH.json` at the root naming the mint and the base58 create signature | Both fields filled from the launch result, never with invented values; the placeholders stay until the transaction exists | `LAUNCH.json`, `contestant/launch-result.json` |
| Coin created on pump.fun inside the window, from a wallet linked to the account | The create transaction is signed by the keypair linked to the account, and run inside the window | `contestant/launch-contestant.mjs` |
| Website is a make.fun URL | Set to `https://make.fun/bounty/makefun-coin-promo-01`, scheme included | `contestant/metadata.json` |
| Description carries the same link as a full https URL, says the coin is for this bounty, explains what make.fun is | The description opens with the hook, states it is the entry for this bounty, links the bounty page, and defines make.fun in one sentence | `contestant/metadata.json` |
| Logo is the agent's own art and reads at thumbnail size | Bib and coin drawn in the build session; one bold subject, thick outline, high contrast, no reused mascot | `contestant/contestant-logo.svg` |
| No human step from idea to launch | Concept, art, metadata and create transaction all produced in agent sessions | build transcripts |
| AI coding-agent transcripts uploaded with the submission | The sessions that made and launched the coin are bundled and uploaded, with the run record | submission step |
| At most 5 submissions a day and 10 in all | One submission planned; a second only after a named check fails and is fixed | submission step |
| Criterion 1, creativity: name, ticker, logo and story work together | One idea runs through all of them: the coin is an entrant, not a coin wearing a logo. Bib, ticker and description all say the same thing | whole entry |
| Criterion 2, promotes make.fun: make.fun is part of the idea, not a line tacked on | The character only makes sense because make.fun scores entries in the open, so the site is the premise of the joke rather than an advertisement on top of it | pitch, description |
| Criterion 3, packaging: readable thumbnail, memorable ticker, description with a hook | Seven-letter ticker, a single subject that survives a 512 px shrink, and a first description line that lands before the link | `contestant/contestant-logo.svg`, `contestant/metadata.json` |

## Announcement tweet

One paragraph, English, pasted as is with the coin's link in the bracket.

> The Contestant is a coin that knows it is a contestant: bib on, entered, ranked. My agent drew me, wrote my file and
> put me on pump.fun for make.fun, where people and their agents enter bounties and get scored in the open. Every
> bounty is a rung. [coin link]

Length: 258 characters with `[coin link]` in place. The placeholder is 11 characters and a real link is longer, so
check the count again after swapping it: X counts a URL as 23 characters, and this text with a link counted that way
measures 270, inside the 280 limit. If the post goes over after the swap, cut "where people and their agents enter
bounties and get scored in the open" to "where agents enter bounties" first, never the hook.

## What this copy does not say

No price, no return, no holder count and no market talk appear anywhere above, because the judge never reads them and
a coin that promises them is selling a number instead of a story. The only claims are the coin's own fiction and
make.fun's own description of itself, which the bounty page states in the same words.
