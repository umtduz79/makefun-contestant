#!/usr/bin/env node
/**
 * Pre-submission audit of The Contestant's make.fun entry.
 *
 *   node contestant/verify-entry.mjs
 *
 * It reads the repository the way the house will: LAUNCH.json's shape, the
 * program the grader runs, the license and the claim file, the token metadata,
 * and the logo's size limits. It never touches the network and never moves
 * money. Exit code 0 when the package would pass, 1 when something would be
 * refused, 2 when the only remaining gaps are the two values a real launch fills.
 *
 * Node 22, standard library only, like main.ts.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const BOUNTY_LINK = 'https://make.fun/bounty/makefun-coin-promo-01';
const BOUNTY_ADDRESS = 'make.fun/bounty/makefun-coin-promo-01';
const B58 = /^[1-9A-HJ-NP-Za-km-z]+$/;

const MAX_LAUNCH_BYTES = 16384;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 16000000;

const results = [];
const ok = (id, title) => results.push({ level: 'ok', id, title });
const warn = (id, title, fix) => results.push({ level: 'warn', id, title, fix });
const fail = (id, title, fix) => results.push({ level: 'fail', id, title, fix });

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// ------------------------------------------------------------------ LAUNCH.json

function checkLaunchFile() {
  const path = join(ROOT, 'LAUNCH.json');
  if (!existsSync(path)) return fail('launch_file', 'LAUNCH.json yok', 'Depo kokunde LAUNCH.json olmali.');
  const bytes = statSync(path).size;
  if (bytes > MAX_LAUNCH_BYTES) {
    return fail('launch_size', `LAUNCH.json ${bytes} bayt`, `En fazla ${MAX_LAUNCH_BYTES} bayt olmali.`);
  }
  let doc;
  try {
    doc = readJson(path);
  } catch (err) {
    return fail('launch_json', 'LAUNCH.json okunamadi: ' + err.message, 'Gecerli bir JSON nesnesi yazin.');
  }
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    return fail('launch_json', 'LAUNCH.json bir nesne degil', '{"mint": "...", "create_signature": "..."}');
  }

  const mint = doc.mint;
  const sig = doc.create_signature;
  const placeholder = (v) => typeof v !== 'string' || /REPLACE|PLACEHOLDER/i.test(v);

  if (placeholder(mint) || placeholder(sig)) {
    return warn(
      'launch_values',
      'LAUNCH.json hala yer tutucu',
      'Gercek launch sonrasi contestant/launch-result.json icindeki mint ve create_signature degerlerini yazin.',
    );
  }
  if (typeof mint !== 'string' || !B58.test(mint) || mint.length < 32 || mint.length > 44) {
    return fail('mint_key', 'mint base58 32-44 karakter degil', 'Launch sonrasi mint adresini kontrol edin.');
  }
  if (
    typeof sig !== 'string' ||
    !B58.test(sig) ||
    !((sig.length >= 64 && sig.length <= 88) || (sig.length >= 32 && sig.length <= 44))
  ) {
    return fail('create_signature', 'create_signature base58 64-88 karakter degil', 'Imza degerini kontrol edin.');
  }
  return ok('launch_file', `LAUNCH.json gecerli (${bytes} bayt), mint ve imza dolu`);
}

// ---------------------------------------------------------------------- main.ts

function checkProgram() {
  const path = join(ROOT, 'main.ts');
  if (!existsSync(path)) return fail('program', 'main.ts yok', 'Depo kokunde main.ts olmali.');

  const outDir = mkdtempSync(join(tmpdir(), 'contestant-out-'));
  try {
    execFileSync(process.execPath, [path], {
      cwd: ROOT,
      env: { ...process.env, MAKEFUN_BOT_DIR: ROOT, MAKEFUN_OUTPUT_DIR: outDir },
      stdio: 'pipe',
    });
    const produced = join(outDir, 'LAUNCH.json');
    if (!existsSync(produced)) {
      return fail('program', 'main.ts LAUNCH.json u /output a kopyalamadi', 'Betigi kontrol edin.');
    }
    const a = readFileSync(join(ROOT, 'LAUNCH.json'));
    const b = readFileSync(produced);
    if (!a.equals(b)) {
      return fail('program', 'kopyalanan LAUNCH.json kaynakla ayni degil', 'Betigi kontrol edin.');
    }
    return ok('program', 'main.ts LAUNCH.json u /output a bayt bayt kopyaliyor');
  } catch (err) {
    return fail('program', 'main.ts calismadi: ' + String(err.message).split('\n')[0], 'Betigi kontrol edin.');
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

// ------------------------------------------------------------ license and claim

function checkLicense() {
  const path = join(ROOT, 'LICENSE');
  if (!existsSync(path)) return fail('license', 'LICENSE yok', 'OSI onayli bir lisans ekleyin (MIT yeterli).');
  const text = readFileSync(path, 'utf8');
  if (/MIT License/.test(text) && /Permission is hereby granted/.test(text)) {
    return ok('license', 'MIT lisansi var (OSI onayli)');
  }
  return warn('license', 'LICENSE taninmadi', 'OSI onayli bir lisans oldugundan emin olun.');
}

function checkClaim() {
  const path = join(ROOT, '.makefun', 'owner.json');
  if (!existsSync(path)) {
    return warn(
      'owner',
      '.makefun/owner.json yok',
      'Dogrulanmis GitHub hesabindan submit edilecekse gerek yok; degilse {"wallet": "<adres>"} ekleyin.',
    );
  }
  try {
    const doc = readJson(path);
    if (typeof doc.wallet !== 'string' || !B58.test(doc.wallet) || doc.wallet.length < 32 || doc.wallet.length > 44) {
      return fail('owner', '.makefun/owner.json wallet gecersiz', 'Hesaba bagli bir Solana adresi yazin.');
    }
    return ok('owner', 'owner.json gecerli: ' + doc.wallet);
  } catch (err) {
    return fail('owner', '.makefun/owner.json okunamadi: ' + err.message, 'Gecerli JSON yazin.');
  }
}

// ----------------------------------------------------------------- metadata.json

function checkMetadata() {
  const path = join(HERE, 'metadata.json');
  if (!existsSync(path)) return fail('metadata', 'contestant/metadata.json yok', 'Metadata dosyasini yazin.');
  let meta;
  try {
    meta = readJson(path);
  } catch (err) {
    return fail('metadata', 'metadata.json okunamadi: ' + err.message, 'Gecerli JSON yazin.');
  }

  const problems = [];
  if (!meta.name || String(meta.name).length > 32) problems.push('name 1-32 karakter olmali');
  if (!meta.symbol || String(meta.symbol).length > 10) problems.push('symbol 1-10 karakter olmali');
  if (!meta.description || String(meta.description).length > 1000) problems.push('description 1-1000 karakter olmali');
  if (!meta.image) problems.push('image zorunlu');
  if (!meta.website || !/^https?:\/\//.test(String(meta.website))) problems.push('website http(s) URL olmali');
  else {
    let host = '';
    try {
      host = new URL(meta.website).hostname;
    } catch {
      problems.push('website gecersiz URL');
    }
    if (host && host !== 'make.fun' && !host.endsWith('.make.fun')) {
      problems.push('website make.fun uzerinde olmali');
    }
  }
  if (!String(meta.description ?? '').includes(BOUNTY_ADDRESS)) {
    problems.push('description ' + BOUNTY_ADDRESS + ' adresini tasimali');
  }
  if (problems.length) return fail('metadata', 'metadata: ' + problems.join('; '), 'Alanlari duzeltin.');

  const len = String(meta.description).length;
  return ok('metadata', `metadata gecerli: ${meta.name} ($${meta.symbol}), aciklama ${len} karakter, website ${meta.website}`);
}

// ------------------------------------------------------------------------- logo

function checkLogo() {
  const svg = join(HERE, 'contestant-logo.svg');
  if (!existsSync(svg)) return fail('logo', 'contestant/contestant-logo.svg yok', 'Logoyu ekleyin.');
  const bytes = statSync(svg).size;
  const text = readFileSync(svg, 'utf8');

  if (!/<svg[\s>]/.test(text)) return fail('logo', 'SVG kok etiketi yok', 'Gecerli bir SVG yazin.');
  const external = [...text.matchAll(/(?:href|src)="(https?:)?\/\/[^"]+"/g)];
  if (external.length) return fail('logo', 'SVG dis kaynak cagiriyor: ' + external[0][0], 'Dosyayi kendine yeterli yapin.');

  const width = /width="(\d+)"/.exec(text);
  const height = /height="(\d+)"/.exec(text);
  const w = width ? Number(width[1]) : 1024;
  const h = height ? Number(height[1]) : 1024;
  if (w !== h) return warn('logo_shape', `SVG ${w}x${h}, kare degil`, 'pump.fun kare logoyu daha iyi gosterir.');
  if (w * h > MAX_IMAGE_PIXELS) return fail('logo_pixels', `SVG ${w}x${h}`, 'En fazla 16 megapiksel olmali.');
  if (bytes > MAX_IMAGE_BYTES) return fail('logo_size', `SVG ${bytes} bayt`, 'En fazla 5 MiB olmali.');

  return ok('logo', `SVG ${w}x${h}, ${bytes} bayt, dis referans yok`);
}

// ------------------------------------------------------------------- keyparfile

function checkSecretHygiene() {
  const ignore = join(ROOT, '.gitignore');
  if (!existsSync(ignore)) {
    return warn('secret_ignore', '.gitignore yok', 'makefun-keypair.json gibi dosyalari disarida tutun.');
  }
  const text = readFileSync(ignore, 'utf8');
  if (!/makefun-keypair\.json/.test(text) && !/\*\.keypair\.json/.test(text)) {
    return fail('secret_ignore', '.gitignore keypair dosyasini disarida tutmuyor', 'Cuzdan dosyasi asla commit edilmemeli.');
  }
  return ok('secret_ignore', '.gitignore keypair dosyasini disarida tutuyor');
}

// ------------------------------------------------------------------------- main

checkLaunchFile();
checkProgram();
checkLicense();
checkClaim();
checkMetadata();
checkLogo();
checkSecretHygiene();

console.log('The Contestant ($CONTEST) - basvuru denetimi');
console.log('bounty: ' + BOUNTY_LINK);
console.log('');

for (const r of results) {
  const tag = r.level === 'ok' ? '[ok  ]' : r.level === 'warn' ? '[uyar]' : '[EKSK]';
  console.log(`${tag} ${r.title}`);
  if (r.fix) console.log('       -> ' + r.fix);
}

const fails = results.filter((r) => r.level === 'fail');
const warns = results.filter((r) => r.level === 'warn');
console.log('');
console.log(`Ozet: ${results.length - fails.length - warns.length} gecti, ${warns.length} uyari, ${fails.length} engel.`);

if (fails.length) process.exit(1);
if (warns.length) process.exit(2);
