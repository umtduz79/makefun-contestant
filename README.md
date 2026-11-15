# The Contestant ($CONTEST)

A coin that knows it is a contestant: race bib on, number 50, face already decided it is going to place.
This repository is its entry in [make.fun/bounty/makefun-coin-promo-01](https://make.fun/bounty/makefun-coin-promo-01),
"Launch a coin that sells make.fun".

The idea in one line: the coin is an entrant, not a mascot. An agent drew it, wrote its file and launched it,
and every bounty on make.fun is another rung on one tall public ladder.

## What is in here

| Path | What it is |
| --- | --- |
| `main.ts` | The entry program. Node 22, standard library only. Copies `LAUNCH.json` to `/output`. |
| `LAUNCH.json` | The coin's mint and the create transaction's signature. Placeholders until the coin exists on chain. |
| `.makefun/owner.json` | The claim file: the wallet linked to the make.fun account that submits. |
| `contestant/metadata.json` | The token metadata: name, ticker, description, website, X. |
| `contestant/contestant-logo.svg` | The logo, drawn in the build session. 1024x1024, no external references. |
| `contestant/logo.mjs` | Renders the logo to a real PNG (sharp, resvg, rsvg-convert, or macOS QuickLook). |
| `contestant/launch-contestant.mjs` | The one script: preflight, dry run, and the real launch with `--yes`. |
| `contestant/bounty-entry.md` | The written entry: pitch, condition-by-condition table, announcement tweet. |
| `contestant/verify-entry.mjs` | Pre-submission audit of the whole package. |

## Launch it

A dry run checks everything and writes nothing to the network:

    node contestant/launch-contestant.mjs

The real launch uploads the logo and the metadata, signs pump.fun's `create_v2` instruction from the wallet in
`makefun-keypair.json`, sends it, and writes `contestant/launch-result.json`:

    PINATA_JWT=<jwt> node contestant/launch-contestant.mjs --yes

`PINATA_JWT` is needed because pump.fun's `/api/ipfs` route now answers a plain multipart POST with
`400 Invalid Server Action request`. A free Pinata account is enough, and pump.fun's own frontend pins through the
same service. If the metadata is already at a URL, skip the upload with `--uri <url>` instead.

After the launch, copy the two values into `LAUNCH.json` and audit the package:

    node contestant/verify-entry.mjs

Then run the entry program the way the grader does:

    mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts

## What it does not claim

No price, no return, no holder count, no market talk. The coin is a story, and the judge reads it as one.

## License

MIT, see `LICENSE`.
