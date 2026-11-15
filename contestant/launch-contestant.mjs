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
 * Where the metadata uri comes from, in order:
 *   --metadata-uri <url> / --uri <url>   (or $PUMP_METADATA_URI) use this address
 *                                        and upload nothing at all, image included
 *   --image-uri <url> (or $PUMP_IMAGE_URI)
 *                                        the PNG is already pinned; keep the given
 *                                        address as metadata.image and pin only the
 *                                        metadata JSON, nothing else
 *   --pinata-jwt <jwt> (or $PINATA_JWT)  pin the logo and the metadata JSON to
 *                                        IPFS through Pinata, the same service
 *                                        pump.fun's own frontend pins through
 *   otherwise                            POST to pump.fun /api/ipfs; that route
 *                                        now answers a plain multipart POST with
 *                                        400 "Invalid Server Action request",
 *                                        so it is best effort only
 *
 * The PNG the metadata names is contestant/logo.png, rendered from the SVG by
 * contestant/logo.mjs at 1024x1024 and kept under 5 MiB / 16 megapixels.
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
// The image the metadata names, and the file the launcher writes next to it.
const IMAGE_FILENAME = 'logo.png';
const LOGO_PNG_PATH = path.join(HERE, IMAGE_FILENAME);

const BOUNTY_URL = 'https://make.fun/bounty/makefun-coin-promo-01';
const BOUNTY_ADDRESS = 'make.fun/bounty/makefun-coin-promo-01';
const DEPS = '@pump-fun/pump-sdk@4.3.1 @solana/web3.js@1.99.0';
const INSTALL_CMD = 'npm install --no-save ' + DEPS;

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 16000000;
const MAX_DOSSIER_SIDE = 512;
// The edge length the launch renders and uploads, and the one the metadata
// claims. A 1024 PNG at this artwork's detail is about 1 MiB, well inside the
// 5 MiB / 16 megapixel ceiling pump.fun applies.
const LOGO_RENDER_SIDE = 1024;
const MAX_NAME = 32;
const MAX_SYMBOL = 10;
const MAX_DESCRIPTION = 1000;
const MAX_TWITTER = 300;

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

const USAGE = [
  'node contestant/launch-contestant.mjs [--yes] [options]',
  '',
  '  --yes                 gercekten launch et (yoksa on kontrol + komut basilir)',
  '  --upload-only         yalnizca metadata yi IPFS e yukle, uri yi bas, zincire dokunma',
  '  --dry-run             acikca kuru calisma (varsayilan davranis)',
  '  --keypair <file>      Solana keypair (solana-keygen JSON); varsayilan: $SOLANA_KEYPAIR,',
  '                        contestant/keypair.json, makefun-keypair.json veya ~/.makefun/keypairs',
  '  --rpc <url>           Solana RPC; varsayilan $SOLANA_RPC_URL veya mainnet-beta',
  '  --uri <url>           metadata JSON zaten bir adreste ise onu kullan (yukleme yapilmaz);',
  '                        $PUMP_METADATA_URI de ayni isi gorur',
  '  --metadata-uri <url>  --uri ile ayni sey; ikisi de yuklemeyi tamamen atlar',
  '  --image-uri <url>     PNG zaten bir adreste ise onu metadata.image yap ve yalniz',
  '                        metadata JSON u pinle; $PUMP_IMAGE_URI de okunur',
  '  --pinata-jwt <jwt>    IPFS yuklemesi icin Pinata JWT; $PINATA_JWT de okunur',
  '  --offline             bakiye icin RPC ye hic gitme (kuru calismayi agsiz yapar)',
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
    uploadOnly: false,
    dryRun: false,
    help: false,
    keypair: null,
    uri: process.env.PUMP_METADATA_URI || process.env.MAKEFUN_METADATA_URI || null,
    imageUri: process.env.PUMP_IMAGE_URI || process.env.MAKEFUN_IMAGE_URI || null,
    pinataJwt: process.env.PINATA_JWT || null,
    offline: process.env.MAKEFUN_OFFLINE === '1',
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
      case '--upload-only':
        opts.uploadOnly = true;
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
      case '--metadata-uri':
        opts.uri = next();
        break;
      case '--image-uri':
        opts.imageUri = next();
        break;
      case '--pinata-jwt':
        opts.pinataJwt = next();
        break;
      case '--offline':
        opts.offline = true;
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
  if (opts.uri) opts.uri = normalizeUri(opts.uri, '--metadata-uri');
  if (opts.imageUri) opts.imageUri = normalizeUri(opts.imageUri, '--image-uri');
  return opts;
}

/** A pre-pinned address must be a real http(s) url, never a bare file name. */
function normalizeUri(value, flag) {
  let url = null;
  try {
    url = new URL(String(value).trim());
  } catch {
    url = null;
  }
  if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) {
    throw new Error(flag + ' tam bir http(s) adresi olmali, alinan: ' + value);
  }
  return url.href;
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
  if (explicit) return { file: explicit, source: 'explicit' };
  if (process.env.SOLANA_KEYPAIR) return { file: path.resolve(process.env.SOLANA_KEYPAIR), source: 'env' };
  const local = path.join(HERE, 'keypair.json');
  if (existsSync(local)) return { file: local, source: 'local' };
  const repo = path.join(ROOT, 'makefun-keypair.json');
  if (existsSync(repo)) return { file: repo, source: 'repo' };
  const dir = path.join(os.homedir(), '.makefun', 'keypairs');
  if (existsSync(dir)) {
    try {
      const files = readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .sort();
      if (files.length) return { file: path.join(dir, files[0]), source: 'home' };
    } catch {
      /* keep looking */
    }
  }
  return null;
}

async function checkWallet(r, opts) {
  const found = findKeypairFile(opts.keypair);
  const file = found ? found.file : null;
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
  if (found.source === 'home') {
    r.warn(
      'wallet-source',
      'Cuzdan ~/.makefun/keypairs icinden secildi',
      file,
      'Launch eden cuzdan make.fun hesabina bagli olmali; degilse --keypair <file> ile dogru dosyayi verin.',
    );
  }
  const mode = (await stat(file)).mode & 0o777;
  if (mode !== 0o600) {
    r.warn(
      'wallet-mode',
      'Cuzdan dosyasi 0' + mode.toString(8) + ' izinli',
      'Ozel anahtar dosyasi 600 olmali.',
      'chmod 600 ' + file,
    );
  }
  return { file: file, address: address, bytes: bytes, source: found.source };
}

async function fetchBalance(r, opts, wallet) {
  if (!wallet) return null;
  if (opts.offline) {
    r.warn(
      'balance',
      'Bakiye okunmadi (--offline)',
      'RPC ye hic gidilmedi, yani kuru calisma agsiz.',
      'Gercek launch i --offline olmadan calistirin; bakiye esigi kontrol edilmez.',
    );
    return null;
  }
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
  // The metadata names the image the launch actually sends. The launch path
  // renders and uploads contestant/logo.png (1024x1024, under 5 MiB / 16 MP), so
  // a bare file name here must be that PNG: an .svg name is the mismatch this
  // check exists to catch, because pump.fun does not take an SVG.
  const imageRef = typeof meta.image === 'string' ? meta.image.trim() : '';
  if (!imageRef) {
    r.fail(
      'metadata-image',
      'metadata image alani yok',
      'metadata image istiyor ve launch yolu PNG gonderiyor.',
      'image alanini ' + IMAGE_FILENAME + ' yapin.',
    );
  } else if (/^https?:\/\//i.test(imageRef)) {
    r.ok('metadata-image', 'image: ' + imageRef, 'hazir adres (--image-uri gecersen bu degisir)');
  } else if (/\.svg$/i.test(imageRef)) {
    r.fail(
      'metadata-image',
      'image SVG yi gosteriyor: ' + imageRef,
      'Launch yolu 1024x1024 PNG gonderiyor; pump.fun SVG kabul etmez.',
      'image alanini ' + IMAGE_FILENAME + ' yapin.',
    );
  } else if (imageRef !== IMAGE_FILENAME) {
    r.warn(
      'metadata-image',
      'image ' + imageRef + ', launch ise ' + IMAGE_FILENAME,
      'Metadata ile gonderilen dosya ayni seyi gostermeli.',
      'image alanini ' + IMAGE_FILENAME + ' yapin.',
    );
  } else {
    r.ok('metadata-image', 'image: ' + imageRef, '1024x1024 PNG');
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
    const written = await mod.renderLogoPng(scratch, LOGO_RENDER_SIDE);
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
  const bad = r.blocking().some((c) => c.id.indexOf('logo') === 0);
  if (!bad) {
    const side = Math.max(dims.width, dims.height);
    const megabytes = (buf.length / 1048576).toFixed(2);
    if (side > LOGO_RENDER_SIDE) {
      r.warn(
        'logo-side',
        'Logo ' + dims.width + 'x' + dims.height,
        'Launch ' + LOGO_RENDER_SIDE + ' px kenar bekliyor.',
        'Boyutu ' + LOGO_RENDER_SIDE + ' px e dusurun.',
      );
    } else {
      r.ok(
        'logo-side',
        'Logo ' + dims.width + 'x' + dims.height + ', ' + megabytes + ' MiB',
        'sinir 5 MiB / 16 MP; hakem gorseli ' + MAX_DOSSIER_SIDE + ' px e sigdirir',
      );
    }
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
  return (
    'node ' +
    relativeSelf() +
    ' --yes' +
    (wallet ? ' --keypair ' + wallet.file : '') +
    (opts.uri ? ' --metadata-uri ' + opts.uri : '') +
    (opts.imageUri ? ' --image-uri ' + opts.imageUri : '')
  );
}

/**
 * Where the uri and the image come from. The order matches uploadMetadata():
 * a pre-pinned metadata uri wins, then a pre-pinned image uri, then the two
 * upload routes. `uri` is null when the launch still has to pin the JSON.
 */
function describeUploadPlan(opts) {
  opts = opts || {};
  if (opts.uri) {
    return {
      source: 'metadata-uri',
      label: 'hazir metadata adresi (hicbir yukleme yok)',
      uri: opts.uri,
      image: opts.imageUri || null,
    };
  }
  if (opts.imageUri) {
    return {
      source: 'image-uri',
      label: 'gorsel hazir; yalniz metadata JSON pinlenir',
      uri: null,
      image: opts.imageUri,
    };
  }
  if (opts.pinataJwt) {
    return {
      source: 'pinata',
      label: 'Pinata (IPFS), iki adim',
      uri: null,
      image: null,
    };
  }
  return {
    source: 'pump',
    label: 'pump.fun /api/ipfs',
    uri: null,
    image: null,
  };
}

function isHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * The cost of one create, and nothing else: no first buy, so no token is bought
 * with the launcher's SOL. The two rent lines are Solana's rent-exempt minimum
 * for the account sizes the create allocates (6960 lamports per byte); the last
 * line is what the simulation measured on top of them.
 */
const CREATE_COST = {
  measuredAt: '2026-11-15',
  measuredOn: 'mainnet-beta simulateTransaction (create only, no first buy)',
  lines: [
    { label: 'mint hesabi kirasi (82 B)', sol: 0.0014616 },
    { label: 'bonding curve token hesabi kirasi (165 B)', sol: 0.0020393 },
    { label: 'bonding curve hesabi kirasi (~150 B)', sol: 0.0019349 },
    { label: 'program hesaplari + islem ve oncelik ucreti', sol: 0.0039642 },
  ],
};

function formatCost(opts) {
  const total = CREATE_COST.lines.reduce((sum, line) => sum + line.sol, 0);
  const rows = CREATE_COST.lines.map(
    (line) => '  ' + line.label.padEnd(48) + line.sol.toFixed(7) + ' SOL',
  );
  rows.push('  ' + '-'.repeat(48) + ' ' + '-'.repeat(11));
  rows.push(
    '  ' + 'TOPLAM (ilk alim YOK)'.padEnd(48) + total.toFixed(7) + ' SOL',
  );
  return [
    'maliyet:',
    ...rows,
    '  olcum: ' + CREATE_COST.measuredOn + ', ' + CREATE_COST.measuredAt,
    '  esik (--min-sol): ' + Number(opts && opts.minSol).toFixed(3) + ' SOL; fazlasi cuzdanda kalir',
    '  ag ve oncelik ucreti piyasayla oynar; kesin tutar launch aninda zincirden gelir.',
  ].join('\n');
}

function describeCreate(meta, wallet, opts) {
  const creator = wallet ? JSON.stringify(wallet.address) : '<cuzdan>';
  const plan = describeUploadPlan(opts || {});
  const uriLine = plan.uri
    ? '    uri: ' + JSON.stringify(plan.uri) + ','
    : '    uri: <yuklenen metadata uri>,';
  const imageLine = plan.image
    ? '    // metadata.image = ' + JSON.stringify(plan.image)
    : '    // metadata.image = ' +
      JSON.stringify((meta && meta.image) || IMAGE_FILENAME) +
      ' (gorsel yuklenirken IPFS adresine cevrilir)';
  return [
    'create cagrisi (pump.fun create_v2, SOL kotasyonu, ilk alim YOK):',
    '  PUMP_SDK.createV2Instruction({',
    '    mint: <yeni mint keypair>.publicKey,',
    '    name: ' + JSON.stringify((meta && meta.name) || '<metadata.name>') + ',',
    '    symbol: ' + JSON.stringify((meta && meta.symbol) || '<metadata.symbol>') + ',',
    uriLine,
    '    creator: ' + creator + ',',
    '    user: ' + creator + ',',
    '    mayhemMode: false,',
    '  })',
    '  Transaction(feePayer = cuzdan, imzalar = mint + cuzdan) -> sendTransaction',
    '',
    imageLine,
    'metadata kaynagi: ' + plan.label + (plan.image || plan.uri ? '  ' + (plan.uri || plan.image) : ''),
    '',
    formatCost(opts),
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
  console.log(describeCreate(meta, wallet, opts));
  if (!opts.yes) {
    console.log('');
    console.log('launch sonrasi LAUNCH.json (repo koku) iki degeri launch-result.json dan alir:');
    console.log('  {"mint": "<mint>", "create_signature": "<create_signature>"}');
    console.log('');
    console.log('Kuru calisma bitti: coini gercekten acmak icin ayni komutu --yes ile calistirin.');
  }
}

// ---------------------------------------------------------------- launch

const PUMP_ENDPOINTS = ['https://pump.fun/api/ipfs', 'https://frontend-api.pump.fun/api/ipfs'];
const PINATA_V3 = 'https://uploads.pinata.cloud/v3/files';
const PINATA_LEGACY = 'https://api.pinata.cloud/pinning/pinFileToIPFS';
// Content pinned through Pinata is served by Pinata's public gateway for any
// account, which is why the uri and the image both go through it. ipfs.io
// rate-limits (429) far too readily to be the address a coin's metadata lives at,
// and pump.mypinata.cloud is pump.fun's own dedicated gateway: it answers 403 for
// a CID pinned by somebody else.
const IPFS_GATEWAY = 'https://gateway.pinata.cloud/ipfs/';

const BROWSER_HEADERS = {
  accept: '*/*',
  'accept-language': 'en-US,en;q=0.9',
  origin: 'https://pump.fun',
  referer: 'https://pump.fun/',
  'sec-ch-ua': '"Chromium";v="131", "Not_A Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

function uploadFailureMessage(failures) {
  const nextServerAction = failures.some((line) => /Server Action/i.test(line));
  const lines = ['metadata yuklenemedi:'];
  for (const line of failures) lines.push('  ' + line);
  lines.push('');
  if (nextServerAction) {
    lines.push('pump.fun /api/ipfs artik bir Next.js sunucu aksiyonu; duz multipart POST "Invalid Server Action" aliyor.');
    lines.push('');
  }
  lines.push('Cozum (biri yeterli):');
  lines.push('  1. PINATA_JWT=<jwt> node ' + relativeSelf() + ' --yes');
  lines.push('     (pump.fun da kendi yuklemelerini Pinata ile yapiyor; ucretsiz hesap yeterli)');
  lines.push('  2. gorsel + metadata JSON zaten bir adreste ise:');
  lines.push(
    '     node ' + relativeSelf() + ' --yes --image-uri <png-url> --metadata-uri <json-url>',
  );
  lines.push('     (--metadata-uri tek basina yeter: hicbir yukleme yapilmaz)');
  lines.push('  3. ikisini elle pinleyip ayni --metadata-uri ile calistirin.');
  return lines.join('\n');
}

/** Pin one file to IPFS through Pinata. Returns the CID. */
async function pinataPin(bytes, filename, mime, jwt) {
  const attempts = [];

  // Pinata v3 upload API (current): answers { data: { cid } }.
  try {
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: mime }), filename);
    form.append('network', 'public');
    const res = await fetch(PINATA_V3, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + jwt },
      body: form,
    });
    const text = await res.text();
    if (res.ok) {
      let body = null;
      try {
        body = JSON.parse(text);
      } catch {
        /* fall through to the failure line */
      }
      const cid = body?.data?.cid || body?.data?.IpfsHash || body?.IpfsHash;
      if (cid) return cid;
      attempts.push('v3 ' + filename + ' -> yanitta cid yok');
    } else {
      attempts.push('v3 ' + filename + ' -> HTTP ' + res.status + ' ' + text.slice(0, 160));
    }
  } catch (err) {
    attempts.push('v3 ' + filename + ' -> ' + err.message);
  }

  // Legacy pinning API: answers { IpfsHash }.
  try {
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: mime }), filename);
    form.append('pinataMetadata', JSON.stringify({ name: filename }));
    const res = await fetch(PINATA_LEGACY, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + jwt },
      body: form,
    });
    const text = await res.text();
    if (res.ok) {
      let body = null;
      try {
        body = JSON.parse(text);
      } catch {
        /* fall through to the failure line */
      }
      if (body?.IpfsHash) return body.IpfsHash;
      attempts.push('legacy ' + filename + ' -> yanitta IpfsHash yok');
    } else {
      attempts.push('legacy ' + filename + ' -> HTTP ' + res.status + ' ' + text.slice(0, 160));
    }
  } catch (err) {
    attempts.push('legacy ' + filename + ' -> ' + err.message);
  }

  throw new Error('Pinata yuklemesi basarisiz (' + filename + '):\n  ' + attempts.join('\n  '));
}

/** The JSON pump.fun reads at the uri: the repo metadata plus the live image url. */
function buildMetadataDoc(meta, imageUrl) {
  const doc = {
    name: meta.name,
    symbol: meta.symbol,
    description: meta.description,
    image: imageUrl,
    showName: true,
    createdOn: 'https://pump.fun',
  };
  if (meta.website) doc.website = meta.website;
  if (meta.twitter) doc.twitter = meta.twitter;
  if (meta.telegram) doc.telegram = meta.telegram;
  return doc;
}

/**
 * Image first, then the metadata JSON that points at it, the same two steps
 * pump.fun's own frontend runs. Returns the metadata uri the create names.
 */
async function uploadViaPinata(meta, logo, jwt) {
  const imageCid = await pinataPin(logo.bytes, logo.filename, logo.mime, jwt);
  const imageUrl = IPFS_GATEWAY + imageCid;
  const doc = buildMetadataDoc(meta, imageUrl);
  const json = Buffer.from(JSON.stringify(doc, null, 2), 'utf8');
  const metaCid = await pinataPin(json, 'metadata.json', 'application/json', jwt);
  return { uri: IPFS_GATEWAY + metaCid, endpoint: 'Pinata (IPFS)', image: imageUrl };
}

async function uploadViaPump(meta, logo, failures) {
  for (const url of PUMP_ENDPOINTS) {
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
        headers: BROWSER_HEADERS,
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
  return null;
}

/**
 * A metadata uri for the create, in order: the pre-pinned metadata uri
 * (--metadata-uri / --uri), then a pre-pinned image uri (--image-uri), where only
 * the JSON is pinned and the image is left where it is, then Pinata for both,
 * then pump.fun's own endpoints. The last route answers a plain multipart POST
 * with 400 "Invalid Server Action request", so it is best effort and every
 * failure is carried into the error message.
 */
async function uploadMetadata(opts, meta, logo) {
  if (opts.uri) {
    return { uri: opts.uri, endpoint: '(verilen metadata adresi)', image: opts.imageUri || null };
  }
  if (opts.imageUri) {
    const doc = buildMetadataDoc(meta, opts.imageUri);
    const json = Buffer.from(JSON.stringify(doc, null, 2), 'utf8');
    if (!opts.pinataJwt) {
      throw new Error(
        [
          '--image-uri verildi, yani gorsel yerinde; ama metadata JSON u hala bir adrese konmali.',
          'Biri yeterli:',
          '  1. PINATA_JWT=<jwt> node ' + relativeSelf() + ' --yes --image-uri ' + opts.imageUri,
          '  2. hazir JSON adresini verin: node ' + relativeSelf() + ' --yes --metadata-uri <url>',
        ].join('\n'),
      );
    }
    try {
      const cid = await pinataPin(json, 'metadata.json', 'application/json', opts.pinataJwt);
      return {
        uri: IPFS_GATEWAY + cid,
        endpoint: 'Pinata (IPFS, yalniz metadata JSON)',
        image: opts.imageUri,
      };
    } catch (err) {
      throw new Error('metadata JSON pinlenemedi:\n  ' + String(err.message).replace(/\n/g, '\n  '));
    }
  }
  const failures = [];
  if (opts.pinataJwt) {
    try {
      return await uploadViaPinata(meta, logo, opts.pinataJwt);
    } catch (err) {
      failures.push('Pinata -> ' + String(err.message).replace(/\n/g, '\n  '));
    }
  }
  const fromPump = await uploadViaPump(meta, logo, failures);
  if (fromPump) return fromPump;
  throw new Error(uploadFailureMessage(failures));
}

async function launch(opts, meta, logo, wallet) {
  const web3 = await loadModule('@solana/web3.js');
  const pump = await loadModule('@pump-fun/pump-sdk');

  const connection = new web3.Connection(opts.rpc, 'confirmed');
  const sdk = new pump.PumpSdk(connection);
  const signer = web3.Keypair.fromSecretKey(wallet.bytes);
  const mint = web3.Keypair.generate();

  const logoPath = logo.filename === IMAGE_FILENAME ? LOGO_PNG_PATH : path.join(HERE, logo.filename);
  await writeFile(logoPath, logo.bytes, { mode: 0o644 });
  console.log('logo yazildi: ' + logoPath);

  const uploaded = await uploadMetadata(opts, meta, logo);
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
  const plan = describeUploadPlan(opts);
  if (plan.source === 'metadata-uri') {
    r.ok('metadata-uri', 'metadata hazir: ' + plan.uri, 'hicbir yukleme yapilmayacak');
    if (plan.image) {
      r.ok('image-uri', 'gorsel hazir: ' + plan.image, 'metadata JSON u bu adresi gosteriyor');
    }
  } else if (plan.source === 'image-uri') {
    r.ok('image-uri', 'gorsel hazir: ' + plan.image, 'yalniz metadata JSON pinlenecek');
    if (!opts.pinataJwt) {
      r.fail(
        'metadata-uri',
        'metadata JSON icin yukleme yolu yok',
        '--image-uri verildi ama Pinata JWT yok.',
        'PINATA_JWT=<jwt> verin ya da hazir JSON adresini --metadata-uri <url> ile gecin.',
      );
    }
  } else if (plan.source === 'pinata') {
    r.ok('metadata-uri', 'metadata kaynagi: Pinata', 'gorsel + metadata JSON launch aninda IPFS e pinlenecek');
  } else {
    r.warn(
      'metadata-uri',
      'metadata kaynagi: pump.fun /api/ipfs',
      'bu uc duz multipart POST a "Invalid Server Action request" donebilir.',
      'PINATA_JWT=<jwt> ya da --uri <url> verin; ikisi de bu yolu atlar.',
    );
  }

  const blocking = r.blocking();
  if (opts.uploadOnly) {
    if (blocking.length || !meta || !logo) {
      printReport(r, opts, meta, wallet);
      console.error('');
      console.error('Yukleme yapilmadi: ' + (blocking.length ? blocking.length + ' engel var.' : 'metadata ya da logo hazir degil.'));
      process.exit(1);
    }
    try {
      const uploaded = await uploadMetadata(opts, meta, logo);
      console.log('metadata uri: ' + uploaded.uri + '  (' + uploaded.endpoint + ')');
      if (uploaded.image) console.log('gorsel uri:   ' + uploaded.image);
      console.log('');
      console.log(
        'Bu adresi launch a verin: node ' +
          relativeSelf() +
          ' --yes --metadata-uri ' +
          uploaded.uri +
          (uploaded.image ? ' --image-uri ' + uploaded.image : ''),
      );
    } catch (err) {
      console.error(err && err.message ? err.message : String(err));
      process.exit(1);
    }
    return;
  }
  if (!opts.yes) {
    printReport(r, opts, meta, wallet);
    return;
  }
  if (blocking.length || !meta || !logo || !wallet || (sol === null && !opts.offline)) {
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
