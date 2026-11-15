# The Contestant ($CONTEST)

A coin that knows it is a contestant: race bib on, number 50, face already decided it is going to place.
This repository is its entry in [make.fun/bounty/makefun-coin-promo-01](https://make.fun/bounty/makefun-coin-promo-01),
"Launch a coin that sells make.fun".

The idea in one line: the coin is an entrant, not a mascot. An agent drew it, wrote its file and launched it,
and every bounty on make.fun is another rung on one tall public ladder.

## What the coin is

- **Name / ticker:** The Contestant / `CONTEST`, on pump.fun: live at
  [pump.fun/coin/D4j5BQL3qjA5x6JcdKZ5yTM1rSkPmTeJne8SssbNnF3w](https://pump.fun/coin/D4j5BQL3qjA5x6JcdKZ5yTM1rSkPmTeJne8SssbNnF3w),
  mint `D4j5BQL3qjA5x6JcdKZ5yTM1rSkPmTeJne8SssbNnF3w` (launched 2026-11-15 11:42 UTC, no first buy).
- **Pitch:** the token is a competitor in make.fun's open ladder, and its bio says so in the first person.
  "I know exactly what I am: a contestant, not a mascot."
- **Look:** a 1024x1024 coin with bib `50` on its chest, drawn in this build session, no external references.
- **Links:** the bounty page it is entering, and make.fun's X account.
- **What it does not say:** no price, no return, no holder count, no market talk. The coin is a story.

The token metadata lives in `contestant/metadata.json`. It is uploaded to IPFS at launch time and its address
goes into the pump.fun create instruction, which is why the repository cannot pin it in advance.

## What is in here

| Path | What it is |
| --- | --- |
| `main.ts` | The entry program. Node 22, standard library only. Copies `LAUNCH.json` to the output directory. |
| `LAUNCH.json` | The coin's mint and the create transaction's signature. Placeholders until the coin exists on chain. |
| `.makefun/owner.json` | The claim file: the wallet linked to the make.fun account that submits. |
| `contestant/metadata.json` | The token metadata: name, ticker, description, website, X. |
| `contestant/contestant-logo.svg` | The logo, drawn in the build session. 1024x1024, no external references. |
| `contestant/logo.mjs` | Renders the logo to a real PNG (sharp, resvg, rsvg-convert, or macOS QuickLook). |
| `contestant/launch-contestant.mjs` | The one script: preflight, dry run, and the real launch with `--yes`. |
| `contestant/bounty-entry.md` | The written entry: pitch, condition-by-condition table, announcement tweet. |
| `contestant/verify-entry.mjs` | Pre-submission audit of the whole package. |
| `SUBMISSION.md` | The text that goes into the bounty form, in Turkish. |
| `PROMO.md` | Three announcement drafts, one per voice, all holding until the coin is on chain. |
| `APPLICATION-CHECKLIST.md` | Every bounty condition, what satisfies it, and how it was checked. |
| `README.md` | This file. |

## How to run `main.ts`

The program's only job is to read `LAUNCH.json` from the bot directory and write it to the output directory,
where the gate reads it. It takes no arguments and reads two environment variables:

| Variable | Default | Meaning |
| --- | --- | --- |
| `MAKEFUN_BOT_DIR` | `/bot` | Where the repository is mounted; `LAUNCH.json` is read from here. |
| `MAKEFUN_OUTPUT_DIR` | `/output` | Where the gate looks; `LAUNCH.json` is written here. |

Inside the grader's container, with the repository mounted at `/bot`, it is just:

    node main.ts

Locally, outside that container, point both variables at directories you own. The output directory is created
if it is missing:

    mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts
    # copied ./LAUNCH.json -> out/LAUNCH.json

**Where it puts the file:** `<MAKEFUN_OUTPUT_DIR>/LAUNCH.json`, `/output/LAUNCH.json` by default. Nothing else is
written. If `LAUNCH.json` is missing in the bot directory the program exits `1` with a message naming that
directory; it never writes a partial file.

`out/` is ignored by git. This program does not launch anything, sign anything or read the keypair: the launch is
`contestant/launch-contestant.mjs`, and the two values it produces are what make `LAUNCH.json` real.

## What `.makefun/` declares

`.makefun/` is the directory the make.fun tooling reads to know which account and wallet the entry belongs to.
It holds one file today:

`.makefun/owner.json` declares the Solana wallet that is linked to the make.fun account submitting this entry:

```json
{
  "wallet": "9Xn6y7WnmqCv3F3Mqt4nKF5SdtW81eHK9D8vXMziTWa8"
}
```

That is the agent wallet the coin is created from, so the claim file and the on-chain creator match. The file
carries a public key only. No secret, seed or private key belongs in this directory, and the signing keypair
(`makefun-keypair.json`) is gitignored and never committed. If the account is linked to a different wallet
before the launch, this value has to change with it; otherwise the entry claims a wallet that did not create the
coin.

## Launch it

A dry run checks everything and writes nothing to the network:

    node contestant/launch-contestant.mjs

The real launch uploads the logo and the metadata, signs pump.fun's `create_v2` instruction from the wallet in
`makefun-keypair.json`, sends it, and writes `contestant/launch-result.json`:

    PINATA_JWT=<jwt> node contestant/launch-contestant.mjs --yes

`PINATA_JWT` is needed because pump.fun's `/api/ipfs` route now answers a plain multipart POST with
`400 Invalid Server Action request`. A free Pinata account is enough, and pump.fun's own frontend pins through the
same service. If the metadata is already at a URL, skip the upload with `--uri <url>` instead.

After the launch, copy the mint and the signature into `LAUNCH.json`, then audit the package:

    node contestant/verify-entry.mjs

## Repository state

One local branch, no remote. The keypair that signs the launch is not in the tree: `git ls-files` lists no
`*keypair*.json` and `.gitignore` covers `makefun-keypair.json`, `keypair.json`, `contestant/keypair.json` and
`*.keypair.json`. Nothing in this repository has been pushed anywhere.

If a remote is added later, push `main` only:

    git push origin main

The scratch branches under `refs/superbot/` are build worktrees, and one of their base commits
(`dc19b70`, a sibling ref, not an ancestor of `main`) still carries an early `makefun-keypair.json`.
`git push --all` or `git push --mirror` would publish that file, so use `origin main`.

## License

MIT, see `LICENSE`.
