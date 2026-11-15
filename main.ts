// The Contestant ($CONTEST) — entry for make.fun's makefun-coin-promo-01 bounty.
//
// Node 22, standard library only. The whole job of this program is to copy
// LAUNCH.json from the repository root to /output/LAUNCH.json, where the gate
// reads it. Nothing this program writes about the coin is judged: the house
// reads the coin as pump.fun shows it (logo, name, ticker, description, links)
// and builds the dossier from that.
//
// LAUNCH.json holds two placeholders until the coin is really on chain, and the
// gate refuses it while they are there. Replace both values with the coin's mint
// and the signature of the transaction that created it, then submit.
//
// Local run, outside the grader's container:
//   mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts

import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BOT_DIR = process.env.MAKEFUN_BOT_DIR ?? '/bot';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const source = join(BOT_DIR, 'LAUNCH.json');
const target = join(OUTPUT_DIR, 'LAUNCH.json');

mkdirSync(OUTPUT_DIR, { recursive: true });

try {
  copyFileSync(source, target);
  console.log(`copied ${source} -> ${target}`);
} catch (err) {
  console.error(`LAUNCH.json could not be copied from ${BOT_DIR}: ${(err as Error).message}`);
  process.exit(1);
}
