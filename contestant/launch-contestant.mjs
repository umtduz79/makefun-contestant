#!/usr/bin/env node
/**
 * The Contestant ($CONTEST) — launch script for the make.fun bounty
 * "Launch a coin that sells make.fun" (makefun-coin-promo-01).
 *
 * One file the person runs. By default it is a dry run: it checks everything,
 * prints the exact create call it would make and the gaps it found, and writes
 * nothing to the network. Only `--yes` uploads the metadata, signs and sends the
 * create transaction, and writes contestant/launch-result.json.
 *
 *   node contestant/launch-contestant.mjs            # dry run (default)
 *   node contestant/launch-contestant.mjs --dry-run  # the same, explicit
 *   node contestant/launch-contestant.mjs --yes      # really launch
 *
 * Contracts this file relies on (written by sibling agents):
 *   contestant/metadata.json  { name, symbol, description, website, twitter, image }
 *   contestant/logo.mjs       { LOGO_SVG_PATH, renderLogoPng() -> Buffer (PNG) }
 *
 * Requires Node >= 22.18 (the bounty's runtime) and, for a real launch, the two
 * packages named in DEPS. A dry run needs neither of them.
 */

import { existsSync, readdirSync } from 'node:fs';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const RESULT_PATH = path.join(HERE, 'launch-result.json');
const LOGO_PNG_PATH = path.join(HERE, 'logo.png');

const BOUNTY_URL = 'https://make.fun/bounty/makefun-coin-promo-01';
const BOUNTY_ADDRESS = 'make.fun/bounty/makefun-coin-promo-01';
const DEPS = '@pump-fun/pump-sdk@4.3.1 @solana/web3.js@1.99.0';
const INSTALL_CMD = 'npm install --no-save ' + DEPS;

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 16000000;
const MAX_DOSSIER_SIDE = 512;
const MAX_NAME = 32;
const MAX_SYMBOL = 10;
const MAX_DESCRIPTION = 1000;
const MAX_TWITTER = 300;

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

const USAGE = [
  'node contestant/launch-contestant.mjs [--yes] [options]',
  '',
  '  --yes                 gercekten launch et (yoksa on kontrol + komut basilir)',
  '  --dry-run             acikca kuru calisma (varsayilan davranis)',
  '  --keypair <file>      Solana keypair (solana-keygen JSON); varsayilan: $SOLANA_KEYPAIR,',
  '                        contestant/keypair.json, makefun-keypair.json veya ~/.makefun/keypairs',
  '  --rpc <url>           Solana RPC; varsayilan $SOLANA_RPC_URL veya mainnet-beta',
  '  --uri <url>           metadata JSON zaten bir adreste ise onu kullan (yukleme yapilmaz)',
  '  --min-sol <amount>    launch icin gereken en az SOL; varsayilan 0.035',
  '  --metadata <file>     varsayilan contestant/metadata.json',
  '  --logo <file>         varsayilan contestant/logo.mjs',
  '  --out <file>          varsayilan contestant/launch-result.json',
  '  --help                bu metin',
].join('\n');

// ---------------------------------------------------------------- utilities

function base58(bytes) {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let out = '';
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b === 0) out = '1' + out;
    else break;
  }
  return out;
}

function pngHeader(buf) {
  if (buf.length < 24) return null;
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < sig.length; i++) if (buf[i] !== sig[i]) return null;
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function parseArgs(argv) {
  const opts = {
    yes: false,
    dryRun: false,
    help: false,
    keypair: null,
    uri: null,
    rpc: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    minSol: 0.035,
    metadata: path.join(HERE, 'metadata.json'),
    logo: path.join(HERE, 'logo.mjs'),
    out: RESULT_PATH,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const v = argv[i + 1];
      i += 1;
      if (v === undefined) throw new Error(arg + ' bir deger bekliyor');
      return v;
    };
    switch (arg) {
      case '--yes':
        opts.yes = true;
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--help':
      case '-h':
        opts.help = true;
        break;
      case '--keypair':
        opts.keypair = path.resolve(next());
        break;
      case '--rpc':
        opts.rpc = next();
        break;
      case '--uri':
        opts.uri = next();
        break;
      case '--min-sol': {
        const v = Number(next());
        if (!Number.isFinite(v) || v < 0) throw new Error('--min-sol sayi olmali');
        opts.minSol = v;
        break;
      }
      case '--metadata':
        opts.metadata = path.resolve(next());
        break;
      case '--logo':
        opts.logo = path.resolve(next());
        break;
      case '--out':
        opts.out = path.resolve(next());
        break;
      default:
        if (arg.startsWith('--')) throw new Error('bilinmeyen secenek: ' + arg);
    }
  }
  if (opts.yes) opts.dryRun = false;
  return opts;
}

// ---------------------------------------------------------------- preflight

function createReporter() {
  const checks = [];
  const add = (level, id, title, detail, fix) => checks.push({ level, id, title, detail, fix });
  return {
    checks,
    ok: (id, title, detail) => add('ok', id, title, detail),
    warn: (id, title, detail, fix) => add('warn', id, title, detail, fix),
    fail: (id, title, detail, fix) => add('fail', id, title, detail, fix),
    blocking: () => checks.filter((c) => c.level === 'fail'),
    warnings: () => checks.filter((c) => c.level === 'warn'),
  };
}

function checkNode(r) {
  const parts = process.versions.node.split('.').map(Number);
  const major = parts[0];
  const minor = parts[1];
  const atLeast = major > 22 || (major === 22 && minor >= 18);
  if (atLeast) r.ok('node', 'Node ' + process.versions.node + ' (bounty 22.18+ istiyor)');
  else
    r.warn(
      'node',
      'Node ' + process.versions.node + ' eski',
      'Bounty Node 22.18+ istiyor.',
      'Node 22.18 veya ustune gecin.',
    );
}

function findKeypairFile(explicit) {
  if (explicit) return explicit;
  if (process.env.SOLANA_KEYPAIR) return path.resolve(process.env.SOLANA_KEYPAIR);
  const local = path.join(HERE, 'keypair.json');
  if (existsSync(local)) return local;
  const repo = path.join(ROOT, 'makefun-keypair.json');
  if (existsSync(repo)) return repo;
  const dir = path.join(os.homedir(), '.makefun', 'keypairs');
  if (existsSync(dir)) {
    try {
      const files = readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .sort();
      if (files.length) return path.join(dir, files[0]);
    } catch {
      /* keep looking */
    }
  }
  return null;
}

async function checkWallet(r, opts) {
  const file = findKeypairFile(opts.keypair);
  if (!file) {
    r.fail(
      'wallet',
      'Cuzdan bulunamadi',
      'Ne $SOLANA_KEYPAIR, ne contestant/keypair.json, ne makefun-keypair.json var.',
      'Cuzdani --keypair <file> ile verin (make.fun hesabina bagli olmali).',
    );
    return null;
  }
  if (!existsSync(file)) {
    r.fail('wallet', 'Cuzdan dosyasi yok: ' + file, null, '--keypair ile var olan bir dosya verin.');
    return null;
  }
  let bytes;
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    const arr = Array.isArray(parsed) ? parsed : (parsed && (parsed.secretKey || parsed.privateKey));
    if (!Array.isArray(arr) || arr.length !== 64) throw new Error('64 baytlik JSON dizi bekleniyordu');
    for (const b of arr) {
      if (!Number.isInteger(b) || b < 0 || b > 255) throw new Error('gecersiz bayt degeri');
    }
    bytes = Uint8Array.from(arr);
  } catch (err) {
    r.fail(
      'wallet',
      'Cuzdan okunamadi: ' + path.basename(file),
      err.message,
      'solana-keygen JSON (64 baytlik dizi) kullanin.',
    );
    return null;
  }
  const address = base58(bytes.slice(32));
  r.ok('wallet', 'Cuzdan: ' + address, path.basename(file));
  const mode = (await stat(file)).mode & 0o777;
  if (mode !== 0o600) {
    r.warn(
      'wallet-mode',
      'Cuzdan dosyasi 0' + mode.toString(8) + ' izinli',
      'Ozel anahtar dosyasi 600 olmali.',
      'chmod 600 ' + file,
    );
  }
  return { file: file, address: address, bytes: bytes };
}

async function fetchBalance(r, opts, wallet) {
  if (!wallet) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(opts.rpc, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [wallet.address] }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error('RPC HTTP ' + res.status);
    const body = await res.json();
    if (body.error) throw new Error(body.error.message || 'RPC hatasi');
    const lamports = BigInt((body.result && body.result.value) || 0);
    const sol = Number(lamports) / 1e9;
    if (sol >= opts.minSol) {
      r.ok('balance', 'Bakiye: ' + sol.toFixed(4) + ' SOL', 'Esik ' + opts.minSol + ' SOL.');
    } else {
      r.fail(
        'balance',
        'Bakiye yetersiz: ' + sol.toFixed(4) + ' SOL',
        'Launch icin en az ' + opts.minSol + ' SOL gerekiyor (kira + ag ucreti; ilk alim yok).',
        wallet.address + ' adresine en az ' + opts.minSol + ' SOL gonderin.',
      );
    }
    return sol;
  } catch (err) {
    const reason = err.name === 'AbortError' ? 'RPC 12 sn icinde yanit vermedi' : err.message;
    r.warn(
      'balance',
      'Bakiye okunamadi',
      reason,
      'RPC adresini --rpc ile degistirin; bakiye okunmadan launch edilmez.',
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function checkMetadata(r, opts) {
  if (!existsSync(opts.metadata)) {
    r.fail('metadata', 'metadata.json yok', opts.metadata, 'contestant/metadata.json yazilmali (w3).');
    return null;
  }
  let meta;
  try {
    meta = JSON.parse(await readFile(opts.metadata, 'utf8'));
  } catch (err) {
    r.fail('metadata', 'metadata.json okunamadi', err.message, 'Gecerli JSON yazin.');
    return null;
  }
  for (const key of ['name', 'symbol', 'description', 'website']) {
    if (typeof meta[key] !== 'string' || !meta[key].trim()) {
      r.fail('metadata-' + key, 'metadata alani eksik: ' + key, null, 'metadata.json icine ' + key + ' ekleyin.');
    }
  }
  if (typeof meta.name === 'string' && meta.name.length > MAX_NAME) {
    r.fail('metadata-name', 'name ' + meta.name.length + ' karakter', 'Sinir ' + MAX_NAME + '.', 'Adi kisaltin.');
  }
  if (typeof meta.symbol === 'string' && meta.symbol.length > MAX_SYMBOL) {
    r.fail(
      'metadata-symbol',
      'symbol ' + meta.symbol.length + ' karakter',
      'Sinir ' + MAX_SYMBOL + '.',
      'Sembolu kisaltin.',
    );
  }
  if (typeof meta.description === 'string') {
    if (meta.description.indexOf(BOUNTY_ADDRESS) === -1) {
      r.fail(
        'metadata-bounty',
        'Aciklama bounty adresini icermiyor',
        'Ev, aciklamada ' + BOUNTY_ADDRESS + ' ariyor; yoksa entry reddedilir.',
        'Aciklamaya ' + BOUNTY_URL + ' linkini ekleyin.',
      );
    }
    if (meta.description.length > MAX_DESCRIPTION) {
      r.warn(
        'metadata-length',
        'description ' + meta.description.length + ' karakter',
        'pump.fun uzun aciklamayi kirpabilir.',
        'Kisaltmayi dusunun.',
      );
    }
  }
  if (typeof meta.website === 'string') {
    let url = null;
    try {
      url = new URL(meta.website);
    } catch {
      url = null;
    }
    if (!url) {
      r.fail('metadata-website', 'website gecerli URL degil: ' + meta.website, null, 'website = ' + BOUNTY_URL);
    } else {
      const host = url.hostname.toLowerCase();
      const onMakeFun = host === 'make.fun' || host.endsWith('.make.fun');
      if (url.protocol !== 'https:' || !onMakeFun) {
        r.fail(
          'metadata-website',
          'website make.fun adresi degil: ' + meta.website,
          'Ev, https ve make.fun (veya alt alan adi) istiyor.',
          'website = ' + BOUNTY_URL,
        );
      } else if (meta.website.replace(/\/$/, '') !== BOUNTY_URL) {
        r.warn(
          'metadata-website-path',
          'website bounty sayfasi degil: ' + meta.website,
          null,
          'Bounty sayfasi en iyi secim: ' + BOUNTY_URL,
        );
      } else {
        r.ok('metadata-website', 'website: ' + meta.website);
      }
    }
  }
  if (meta.twitter !== undefined) {
    if (typeof meta.twitter !== 'string') {
      r.warn('metadata-twitter', 'twitter metin degil', null, 'X linkini metin verin ya da alani birakin.');
    } else if (meta.twitter.length > MAX_TWITTER) {
      r.warn('metadata-twitter', 'twitter ' + meta.twitter.length + ' karakter', null, 'Kisaltin.');
    }
  }
  if (meta.image === undefined || meta.image === null) {
    r.warn('metadata-image', 'metadata image alani yok', 'Bounty metadata image istiyor.', 'image alanini logonun dosya adina ayarlayin.');
  } else if (typeof meta.image !== 'string' || !meta.image.trim()) {
    r.warn('metadata-image', 'image gecerli dosya adi degil', null, 'image alanina logonun dosya adini yazin.');
  }
  const bad = r.blocking().some((c) => c.id.indexOf('metadata') === 0);
  if (bad) return meta;
  r.ok('metadata', 'metadata.json gecerli: ' + meta.name + ' ($' + meta.symbol + ')');
  return meta;
}

async function checkLogo(r, opts) {
  if (!existsSync(opts.logo)) {
    r.fail('logo', 'logo.mjs yok', opts.logo, 'contestant/logo.mjs yazilmali (w2).');
    return null;
  }
  let mod;
  try {
    mod = await import(pathToFileURL(opts.logo).href + '?t=' + Date.now());
  } catch (err) {
    r.fail('logo-import', 'logo.mjs yuklenemedi', err.message, 'logo.mjs derlenebilir olmali (node --check).');
    return null;
  }
  if (typeof mod.renderLogoPng !== 'function') {
    r.fail(
      'logo-contract',
      'logo.mjs renderLogoPng() vermiyor',
      'Beklenen cikti: renderLogoPng(): Buffer (PNG).',
      'renderLogoPng fonksiyonunu export edin.',
    );
    return null;
  }
  // Two shapes are accepted: renderLogoPng() -> Buffer (this launcher's own
  // contract) and renderLogoPng(outPath, size) -> path (contestant/logo.mjs as
  // w2 wrote it). The bytes are always read back and checked, because a renderer
  // with no rasteriser installed hands back the SVG at that path.
  const scratch = path.join(os.tmpdir(), 'contestant-logo-check-' + process.pid + '.png');
  let png = null;
  try {
    const written = await mod.renderLogoPng(scratch, MAX_DOSSIER_SIDE);
    if (Buffer.isBuffer(written) || written instanceof Uint8Array) png = Buffer.from(written);
    else if (typeof written === 'string' && existsSync(written)) png = await readFile(written);
    else if (existsSync(scratch)) png = await readFile(scratch);
  } catch (err) {
    try {
      const ret = await mod.renderLogoPng();
      if (Buffer.isBuffer(ret) || ret instanceof Uint8Array) png = Buffer.from(ret);
    } catch (err2) {
      r.fail('logo-render', 'renderLogoPng() hata verdi', err.message + ' / ' + err2.message, 'Logo uretecini duzeltin.');
      return null;
    }
  }
  if (!png) {
    r.fail('logo-render', 'renderLogoPng() gorsel vermedi', 'Ne Buffer ne dosya yolu alindi.', 'renderLogoPng(outPath) PNG yazmali.');
    return null;
  }
  const buf = png;
  const dims = pngHeader(buf);
  const head = buf.toString('utf8', 0, 200).trim();
  const isSvg = !dims && head.startsWith('<') && head.indexOf('<svg') !== -1;
  if (!dims && !isSvg) {
    r.fail('logo-png', 'Logo okunamadi', 'Ne PNG imzasi ne <svg> bulundu.', 'renderLogoPng PNG ya da SVG uretmeli.');
    return null;
  }
  if (isSvg) {
    // The house accepts an SVG and rasterises it at 512 for the judge, and so
    // does pump.fun's uploader when it takes the file; a PNG is still better.
    r.warn(
      'logo-svg',
      'Logo SVG olarak uretildi',
      'renderLogoPng PNG ureteci bulamadi; pump.fun SVG dosyasini kabul etmezse PNG gerekir.',
      'npm install --no-save sharp  (sonra betigi tekrar calistirin) ya da logoyu PNG olarak kaydedin.',
    );
    const bytes = buf.length;
    if (bytes > MAX_IMAGE_BYTES) {
      r.fail('logo-size', 'Logo ' + (bytes / 1048576).toFixed(2) + ' MiB', 'Sinir 5 MiB.', 'Kucultun.');
      return null;
    }
    return { bytes: buf, mime: 'image/svg+xml', filename: 'logo.svg', width: null, height: null };
  }
  const pixels = dims.width * dims.height;
  if (buf.length > MAX_IMAGE_BYTES) {
    r.fail('logo-size', 'Logo ' + (buf.length / 1048576).toFixed(2) + ' MiB', 'Sinir 5 MiB.', 'Logoyu kucultun.');
  }
  if (pixels > MAX_IMAGE_PIXELS) {
    r.fail('logo-pixels', 'Logo ' + pixels + ' piksel', 'Sinir 16,000,000.', 'Boyutu dusurun.');
  }
  if (Math.max(dims.width, dims.height) > MAX_DOSSIER_SIDE) {
    r.warn(
      'logo-side',
      'Logo ' + dims.width + 'x' + dims.height,
      'Hakem gorseli 512 piksele sigdiriyor.',
      'Juri icin 512 px kenar onerilir (otomatik kucultulur).',
    );
  }
  const bad = r.blocking().some((c) => c.id.indexOf('logo') === 0);
  if (!bad) {
    r.ok('logo', 'Logo hazir: ' + dims.width + 'x' + dims.height + ', ' + Math.round(buf.length / 1024) + ' KB');
  }
  return { bytes: buf, mime: 'image/png', filename: 'logo.png', width: dims.width, height: dims.height };
}

function resolveDep(name) {
  const require = createRequire(path.join(ROOT, 'index.js'));
  const roots = [ROOT, path.join(ROOT, '.launchtest')];
  for (const root of roots) {
    try {
      return require.resolve(name, { paths: [root] });
    } catch {
      /* try the next root */
    }
  }
  return null;
}

/**
 * Import a package the launcher needs for a real launch. A plain `import` from
 * this file only finds packages installed at the repo root; the fallback loads
 * the CommonJS build the resolver finds, which is what .launchtest installs.
 */
async function loadModule(name) {
  try {
    return await import(name);
  } catch {
    /* not resolvable from this file: fall through to the resolved path */
  }
  const resolved = resolveDep(name);
  if (!resolved) throw new Error(name + ' kurulu degil. Once: ' + INSTALL_CMD);
  const require = createRequire(resolved);
  const mod = require(name);
  return mod && mod.default && Object.keys(mod).length === 1 ? mod.default : mod;
}

function checkDependencies(r) {
  const pump = resolveDep('@pump-fun/pump-sdk');
  const web3 = resolveDep('@solana/web3.js');
  if (pump && web3) {
    r.ok('deps', 'Launch paketleri kurulu', '@pump-fun/pump-sdk + @solana/web3.js');
  } else {
    r.warn(
      'deps',
      'Launch paketleri eksik',
      (pump ? '' : '@pump-fun/pump-sdk ') + (web3 ? '' : '@solana/web3.js') + ' bulunamadi.',
      INSTALL_CMD + '  (yalnizca --yes icin gerekli; kuru calisma bunlari kullanmaz)',
    );
  }
  return Boolean(pump && web3);
}

// ---------------------------------------------------------------- report

function relativeSelf() {
  const rel = path.relative(process.cwd(), path.join(HERE, 'launch-contestant.mjs'));
  return rel.split(path.sep).join('/');
}

function describeCommand(opts, wallet) {
  return 'node ' + relativeSelf() + ' --yes' + (wallet ? ' --keypair ' + wallet.file : '');
}

function describeCreate(meta, wallet) {
  const creator = wallet ? JSON.stringify(wallet.address) : '<cuzdan>';
  return [
    'create cagrisi (pump.fun create_v2, SOL kotasyonu, ilk alim YOK):',
    '  PUMP_SDK.createV2Instruction({',
    '    mint: <yeni mint keypair>.publicKey,',
    '    name: ' + JSON.stringify((meta && meta.name) || '<metadata.name>') + ',',
    '    symbol: ' + JSON.stringify((meta && meta.symbol) || '<metadata.symbol>') + ',',
    '    uri: <yuklenen metadata uri>,',
    '    creator: ' + creator + ',',
    '    user: ' + creator + ',',
    '    mayhemMode: false,',
    '  })',
    '  Transaction(feePayer = cuzdan, imzalar = mint + cuzdan) -> sendTransaction',
    '',
    'metadata yuklemesi: POST https://pump.fun/api/ipfs (multipart: file, name, symbol, description, website, twitter)',
  ].join('\n');
}

function printReport(r, opts, meta, wallet) {
  const icon = { ok: 'ok  ', warn: 'uyar', fail: 'EKSK' };
  console.log('The Contestant ($CONTEST) - launch on kontrolu');
  console.log('bounty: ' + BOUNTY_URL);
  console.log('mod:    ' + (opts.yes ? 'GERCEK LAUNCH' : 'kuru calisma (hicbir sey gonderilmedi)'));
  console.log('');
  for (const c of r.checks) {
    console.log('[' + icon[c.level] + '] ' + c.title + (c.detail ? '  - ' + c.detail : ''));
    if (c.fix && c.level !== 'ok') console.log('           -> ' + c.fix);
  }
  console.log('');
  const blocking = r.blocking();
  console.log(
    'Ozet: ' +
      (r.checks.length - blocking.length - r.warnings().length) +
      ' gecti, ' +
      r.warnings().length +
      ' uyari, ' +
      blocking.length +
      ' engel.',
  );
  console.log('');
  console.log('Calistirilacak komut:');
  console.log('  ' + describeCommand(opts, wallet));
  console.log('');
  console.log(describeCreate(meta, wallet));
  if (!opts.yes) {
    console.log('');
    console.log('Kuru calisma bitti: coini gercekten acmak icin ayni komutu --yes ile calistirin.');
  }
}

// ---------------------------------------------------------------- launch

async function uploadMetadata(meta, logo) {
  const endpoints = ['https://pump.fun/api/ipfs', 'https://frontend-api.pump.fun/api/ipfs'];
  const failures = [];
  for (const url of endpoints) {
    const form = new FormData();
    form.append('name', meta.name);
    form.append('symbol', meta.symbol);
    form.append('description', meta.description);
    if (meta.website) form.append('website', meta.website);
    if (meta.twitter) form.append('twitter', meta.twitter);
    form.append('showName', 'true');
    form.append('createdOn', 'https://pump.fun');
    form.append('file', new Blob([logo.bytes], { type: logo.mime }), logo.filename);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          accept: '*/*',
          origin: 'https://pump.fun',
          referer: 'https://pump.fun/',
          'user-agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        },
        body: form,
      });
      const text = await res.text();
      if (!res.ok) {
        failures.push(url + ' -> HTTP ' + res.status + ' ' + text.slice(0, 200));
        continue;
      }
      let body = null;
      try {
        body = JSON.parse(text);
      } catch {
        failures.push(url + ' -> JSON degil: ' + text.slice(0, 120));
        continue;
      }
      const uri = body.metadataUri || body.uri || body.metadata_uri;
      if (!uri) {
        failures.push(url + ' -> yanitta metadata uri yok (' + Object.keys(body).join(',') + ')');
        continue;
      }
      return { uri: uri, endpoint: url };
    } catch (err) {
      failures.push(url + ' -> ' + err.message);
    }
  }
  throw new Error('metadata yuklenemedi:\n  ' + failures.join('\n  '));
}

async function launch(opts, meta, logo, wallet) {
  const web3 = await loadModule('@solana/web3.js');
  const pump = await loadModule('@pump-fun/pump-sdk');

  const connection = new web3.Connection(opts.rpc, 'confirmed');
  const sdk = new pump.PumpSdk(connection);
  const signer = web3.Keypair.fromSecretKey(wallet.bytes);
  const mint = web3.Keypair.generate();

  const logoPath = path.join(HERE, logo.filename);
  await writeFile(logoPath, logo.bytes, { mode: 0o644 });
  console.log('logo yazildi: ' + logoPath);

  const uploaded = opts.uri
    ? { uri: opts.uri, endpoint: '(verilen --uri)' }
    : await uploadMetadata(meta, logo);
  console.log('metadata uri: ' + uploaded.uri + '  (' + uploaded.endpoint + ')');

  const instruction = await sdk.createV2Instruction({
    mint: mint.publicKey,
    name: meta.name,
    symbol: meta.symbol,
    uri: uploaded.uri,
    creator: signer.publicKey,
    user: signer.publicKey,
    mayhemMode: false,
  });

  const latest = await connection.getLatestBlockhash('confirmed');
  const tx = new web3.Transaction().add(instruction);
  tx.feePayer = signer.publicKey;
  tx.recentBlockhash = latest.blockhash;
  tx.sign(mint, signer);

  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  console.log('create islemi gonderildi: ' + signature);
  await connection.confirmTransaction(
    { signature: signature, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
    'confirmed',
  );

  const result = {
    mint: mint.publicKey.toBase58(),
    create_signature: signature,
    created_at: new Date().toISOString(),
    name: meta.name,
    symbol: meta.symbol,
    uri: uploaded.uri,
    wallet: wallet.address,
    website: meta.website || null,
    bounty: BOUNTY_URL,
  };
  await writeFile(opts.out, JSON.stringify(result, null, 2) + '\n', { mode: 0o644 });

  console.log('');
  console.log('LAUNCH TAMAM');
  console.log('  mint:      ' + result.mint);
  console.log('  signature: ' + result.create_signature);
  console.log('  coin:      https://pump.fun/coin/' + result.mint);
  console.log('  kayit:     ' + opts.out);
  return result;
}

// ---------------------------------------------------------------- main

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    console.error('');
    console.error(USAGE);
    process.exit(2);
  }
  if (opts.help) {
    console.log(USAGE);
    return;
  }

  const r = createReporter();
  checkNode(r);
  const wallet = await checkWallet(r, opts);
  const sol = await fetchBalance(r, opts, wallet);
  const meta = await checkMetadata(r, opts);
  const logo = await checkLogo(r, opts);
  checkDependencies(r);
  if (!opts.uri) {
    r.warn(
      'metadata-uri',
      'metadata uri verilmedi',
      'Betik gorseli ve bilgileri pump.fun/api/ipfs adresine yuklemeyi deneyecek.',
      'O uc reddederse metadata JSON adresini --uri <url> ile verin.',
    );
  } else {
    r.ok('metadata-uri', 'metadata uri: ' + opts.uri, 'yukleme atlanacak');
  }

  const blocking = r.blocking();
  if (!opts.yes) {
    printReport(r, opts, meta, wallet);
    return;
  }
  if (blocking.length || !meta || !logo || !wallet || sol === null) {
    printReport(r, opts, meta, wallet);
    console.error('');
    console.error(
      'Launch edilmedi: ' +
        (blocking.length ? blocking.length + ' engel var (yukarida EKSK).' : 'on kontrol tamamlanamadi.'),
    );
    process.exit(1);
  }

  if (r.warnings().some((c) => c.id === 'deps')) {
    printReport(r, opts, meta, wallet);
    console.error('');
    console.error('Launch edilmedi: launch paketleri eksik. Once: ' + INSTALL_CMD);
    process.exit(1);
  }

  try {
    await launch(opts, meta, logo, wallet);
  } catch (err) {
    console.error('');
    console.error('Launch basarisiz: ' + (err && err.message ? err.message : err));
    console.error('launch-result.json yazilmadi; gerceklesip gerceklesmedigini pump.fun adresinden kontrol edin.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('beklenmeyen hata: ' + (err && err.stack ? err.stack : err));
  process.exit(1);
});
