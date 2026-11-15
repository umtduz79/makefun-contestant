#!/usr/bin/env node
/**
 * Pin the contestant's logo and metadata to IPFS and print the two addresses,
 * with no account, no API key and no wallet. `launch-contestant.mjs --upload-only`
 * prints a plan; this script is the part that actually uploads.
 *
 *   node contestant/upload-metadata.mjs contestant/metadata.json path/to/logo.png
 *   node contestant/upload-metadata.mjs --metadata <json> --image <png> --json
 *
 * Why it does not use pump.fun's own uploader: pump.fun's frontend bundle calls
 * /api/ipfs "the retired /api/ipfs" and the route now only answers a Next.js
 * server action. A plain multipart POST to it, with or without a Next-Action
 * header, answers 400 "Invalid Server Action request", and the create page's
 * chunks carry no server-reference id to send. Verified 2026-11-15.
 *
 * What it uses instead: The Graph's keyless Kubo RPC (api.thegraph.com/ipfs),
 * whose content is served back through the public gateways below. If
 * $PINATA_JWT happens to be set that is tried first, because a Pinata account
 * pins until it is told to stop; it is never required and never printed.
 *
 * The Graph runs an IPFS node, not a pinning service: it does not promise to keep
 * the bytes. Content pinned this way was still served on every check made on
 * 2026-11-15, but the launch should use a fresh upload (re-run this script just
 * before it), and $PINATA_JWT is the durable path when one is available.
 *
 * The gateway is not assumed: each pinned CID is probed against the gateways in
 * order and the first one that serves the bytes is the one written into the
 * metadata. Nothing is printed as a success until the metadata URI is fetched
 * back, parsed, and compared byte for byte with what was uploaded.
 *
 * metadata.json is read, never written: the uploaded document is built in memory
 * from its fields, with `image` replaced by the pinned PNG's address.
 *
 * Exits 0 with the image uri and the metadata uri on stdout, 2 on a usage error,
 * 1 on any upload or verification failure, and on failure every endpoint that
 * refused is printed with its exact HTTP status and response body.
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const USAGE = [
  'kullanim: node contestant/upload-metadata.mjs <metadata.json> <logo.png>',
  '          node contestant/upload-metadata.mjs --metadata <json> --image <png> [--json]',
  '',
  '  --metadata <file>  metadata JSON (varsayilan: contestant/metadata.json)',
  '  --image <file>     logo PNG (zorunlu)',
  '  --json             iki uri yi tek satir JSON olarak bas',
  '  --help             bu metin',
  '',
  'PINATA_JWT ortam degiskeni ayarliysa once Pinata denenir; zorunlu degildir.',
].join('\n');

/** pump.fun's own limits, so a file it would reject is refused here instead. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 16_000_000;
const REQUEST_TIMEOUT_MS = 30000;

/** Keyless pinning endpoints, tried in order. */
const KEYLESS_ENDPOINTS = [
  {
    name: 'thegraph',
    url: 'https://api.thegraph.com/ipfs/api/v0/add',
    // Answers { Name, Hash, Size }; Hash is the CID of the file's own bytes.
    cidOf: (body) => body?.Hash,
  },
];

/**
 * pump.fun's uploader, kept last. Retired as a plain POST, kept so a run that
 * fails everywhere reports its refusal in the same list as the rest.
 */
const RETIRED_ENDPOINTS = [
  {
    name: 'pump.fun',
    url: 'https://pump.fun/api/ipfs',
    cidOf: (body) => body?.metadataUri || body?.uri || body?.metadata_uri,
  },
  {
    name: 'pump.fun frontend-api',
    url: 'https://frontend-api.pump.fun/api/ipfs',
    cidOf: (body) => body?.metadataUri || body?.uri || body?.metadata_uri,
  },
];

const PINATA_V3 = 'https://uploads.pinata.cloud/v3/files';
const PINATA_LEGACY = 'https://api.pinata.cloud/pinning/pinFileToIPFS';

/**
 * Gateways probed to serve the pinned bytes, best first. pump.mypinata.cloud is
 * left out on purpose: it only serves CIDs pinned to pump.fun's own account and
 * answers 403 for everybody else's. ipfs.io stays last because it rate-limits.
 */
const GATEWAYS = [
  'https://gateway.pinata.cloud/ipfs/',
  'https://api.thegraph.com/ipfs/',
  'https://ipfs.io/ipfs/',
];

const BROWSER_HEADERS = {
  accept: '*/*',
  'accept-language': 'en-US,en;q=0.9',
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

class UploadError extends Error {
  constructor(message, attempts) {
    super(message);
    this.attempts = attempts || [];
  }
}

function usageError(message) {
  console.error(message);
  console.error('');
  console.error(USAGE);
  process.exit(2);
}

function parseArgs(argv) {
  const opts = {
    metadata: path.join(path.dirname(new URL(import.meta.url).pathname), 'metadata.json'),
    image: null,
    json: false,
  };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) usageError(arg + ' bir deger bekliyor');
      return value;
    };
    if (arg === '--metadata') opts.metadata = next();
    else if (arg === '--image') opts.image = next();
    else if (arg === '--json') opts.json = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(USAGE);
      process.exit(0);
    } else if (arg.startsWith('-')) usageError('bilinmeyen secenek: ' + arg);
    else positional.push(arg);
  }
  if (positional.length > 2) usageError('fazla arguman: ' + positional.slice(2).join(' '));
  if (positional[0]) opts.metadata = positional[0];
  if (positional[1]) opts.image = positional[1];
  if (!opts.image) usageError('logo PNG verilmedi (--image <file>)');
  opts.metadata = path.resolve(opts.metadata);
  opts.image = path.resolve(opts.image);
  return opts;
}

/** Reject anything that is not a PNG pump.fun would accept, before uploading it. */
function checkPng(bytes, filename) {
  if (bytes.length < 33) throw new Error(filename + ': PNG cok kucuk (' + bytes.length + ' bayt)');
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(filename + ': PNG imzasi yok; pump.fun bu dosyayi gorsel olarak kabul etmez');
  }
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new Error(filename + ': ' + bytes.length + ' bayt, sinir ' + MAX_IMAGE_BYTES + ' bayt (5 MiB)');
  }
  // IHDR is the first chunk: width and height are big-endian u32 at 16 and 20.
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (!width || !height) throw new Error(filename + ': PNG boyutu okunamadi (0)');
  const pixels = width * height;
  if (pixels > MAX_IMAGE_PIXELS) {
    throw new Error(filename + ': ' + width + 'x' + height + ', sinir ' + MAX_IMAGE_PIXELS + ' piksel');
  }
  return { width, height };
}

function readMetadata(bytes, filename) {
  let meta;
  try {
    meta = JSON.parse(bytes.toString('utf8'));
  } catch (err) {
    throw new Error(filename + ': gecerli JSON degil (' + err.message + ')');
  }
  for (const key of ['name', 'symbol', 'description']) {
    if (typeof meta[key] !== 'string' || !meta[key].trim()) {
      throw new Error(filename + ': "' + key + '" alani eksik ya da metin degil');
    }
  }
  if (typeof meta.image !== 'string' || !meta.image.trim()) {
    throw new Error(filename + ': "image" alani eksik');
  }
  return meta;
}

async function request(url, init) {
  return await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

function clip(text) {
  const flat = String(text).replace(/\s+/g, ' ').trim();
  return flat.length > 400 ? flat.slice(0, 400) + '…' : flat;
}

/**
 * Pin one file. Returns { cid, endpoint }. Every refusal is carried out in the
 * thrown error as "<endpoint> -> HTTP <status> <body>", so a failed run says
 * exactly which endpoint said what.
 */
async function pin(bytes, filename, mime, attempts) {
  const endpoints = [];
  if (process.env.PINATA_JWT) {
    endpoints.push({ name: 'pinata', url: PINATA_V3, pinata: true, cidOf: (b) => b?.data?.cid });
  }
  endpoints.push(...KEYLESS_ENDPOINTS, ...RETIRED_ENDPOINTS);

  for (const endpoint of endpoints) {
    const label = endpoint.name + ' ' + filename;
    try {
      const res = endpoint.pinata
        ? await pinataUpload(endpoint.url, bytes, filename, mime)
        : await upload(endpoint.url, bytes, filename, mime);
      const text = await res.text();
      if (!res.ok) {
        attempts.push(label + ' -> HTTP ' + res.status + ' ' + clip(text));
        continue;
      }
      let body = null;
      try {
        body = JSON.parse(text);
      } catch {
        attempts.push(label + ' -> HTTP ' + res.status + ' ama JSON degil: ' + clip(text));
        continue;
      }
      const cid = endpoint.cidOf(body);
      if (!cid) {
        attempts.push(label + ' -> HTTP ' + res.status + ' ama yanitta cid yok (' + Object.keys(body).join(',') + ')');
        continue;
      }
      return { cid: cid, endpoint: endpoint.name };
    } catch (err) {
      attempts.push(label + ' -> ' + err.message);
    }
  }
  return null;
}

async function upload(url, bytes, filename, mime) {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mime }), filename);
  return await request(url, { method: 'POST', headers: BROWSER_HEADERS, body: form });
}

async function pinataUpload(url, bytes, filename, mime) {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mime }), filename);
  form.append('network', 'public');
  // The header carries the token; the token is never logged.
  return await request(url, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + process.env.PINATA_JWT },
    body: form,
  });
}

/**
 * The first gateway that serves `cid` with the bytes we pinned. Probing with the
 * same path the metadata will name, so a gateway that only answered HEAD or a
 * redirect never ends up in the metadata.
 */
async function chooseGateway(cid, expectedSha, attempts, what) {
  for (const gateway of GATEWAYS) {
    const url = gateway + cid;
    try {
      const res = await request(url, { headers: BROWSER_HEADERS });
      if (!res.ok) {
        attempts.push(what + ' ' + gateway + ' -> HTTP ' + res.status + ' ' + clip(await res.text()));
        continue;
      }
      const body = Buffer.from(await res.arrayBuffer());
      const sha = sha256(body);
      if (sha !== expectedSha) {
        attempts.push(what + ' ' + gateway + ' -> HTTP ' + res.status + ' ama baska baytlar (' + body.length + ' bayt)');
        continue;
      }
      return gateway;
    } catch (err) {
      attempts.push(what + ' ' + gateway + ' -> ' + err.message);
    }
  }
  return null;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** The document pump.fun reads: metadata.json's fields, with the pinned image. */
function buildDocument(meta, imageUrl) {
  const doc = {
    name: meta.name,
    symbol: meta.symbol,
    description: meta.description,
    image: imageUrl,
    showName: true,
    createdOn: 'https://pump.fun',
  };
  for (const key of ['website', 'twitter', 'telegram']) {
    if (typeof meta[key] === 'string' && meta[key].trim()) doc[key] = meta[key];
  }
  return doc;
}

function sameJson(a, b) {
  const canon = (value) => {
    if (Array.isArray(value)) return value.map(canon);
    if (value && typeof value === 'object') {
      const out = {};
      for (const key of Object.keys(value).sort()) out[key] = canon(value[key]);
      return out;
    }
    return value;
  };
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}

function reportFailure(what, attempts) {
  const lines = [what + ' basarisiz:'];
  for (const line of attempts) lines.push('  ' + line);
  if (attempts.some((line) => /Invalid Server Action/.test(line))) {
    lines.push('');
    lines.push('  pump.fun /api/ipfs emekli bir rotadir: Next.js sunucu aksiyonu bekliyor,');
    lines.push('  duz POST "Invalid Server Action request" aliyor. Sunucu aksiyonu kimligi');
    lines.push('  create sayfasinin chunk larinda yok, bu yuzden bu betik onu hic kullanmiyor.');
  }
  console.error(lines.join('\n'));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  let imageBytes;
  let meta;
  try {
    imageBytes = await readFile(opts.image);
    checkPng(imageBytes, path.basename(opts.image));
    meta = readMetadata(await readFile(opts.metadata), path.basename(opts.metadata));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const attempts = [];

  // 1. Image first, so the metadata can name it.
  const imagePin = await pin(imageBytes, path.basename(opts.image), 'image/png', attempts);
  if (!imagePin) {
    reportFailure('gorsel yuklenemedi', attempts);
    process.exit(1);
  }
  const imageGateway = await chooseGateway(imagePin.cid, sha256(imageBytes), attempts, 'gorsel');
  if (!imageGateway) {
    reportFailure('gorsel bir gateway den sunulamiyor', attempts);
    process.exit(1);
  }
  const imageUri = imageGateway + imagePin.cid;

  // 2. Then the metadata JSON that points at it.
  const doc = buildDocument(meta, imageUri);
  const json = Buffer.from(JSON.stringify(doc, null, 2) + '\n', 'utf8');
  const metaPin = await pin(json, 'metadata.json', 'application/json', attempts);
  if (!metaPin) {
    reportFailure('metadata yuklenemedi', attempts);
    process.exit(1);
  }
  const metaGateway = await chooseGateway(metaPin.cid, sha256(json), attempts, 'metadata');
  if (!metaGateway) {
    reportFailure('metadata bir gateway den sunulamiyor', attempts);
    process.exit(1);
  }
  const metadataUri = metaGateway + metaPin.cid;

  // 3. Read it back the way a buyer's wallet will, and refuse to call it done
  //    unless the bytes on the wire are the bytes we uploaded.
  try {
    const res = await request(metadataUri, { headers: BROWSER_HEADERS });
    const text = await res.text();
    if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + clip(text));
    const back = JSON.parse(text);
    if (!sameJson(back, doc)) throw new Error('geri gelen JSON yuklenenle ayni degil');
    if (back.image !== imageUri) throw new Error('image alani ' + JSON.stringify(back.image));
  } catch (err) {
    console.error('dogrulama basarisiz: ' + metadataUri + ' -> ' + err.message);
    process.exit(1);
  }

  if (opts.json) {
    console.log(
      JSON.stringify({
        image_uri: imageUri,
        metadata_uri: metadataUri,
        image_cid: imagePin.cid,
        metadata_cid: metaPin.cid,
        image_pin: imagePin.endpoint,
        metadata_pin: metaPin.endpoint,
      }),
    );
    return;
  }

  // stdout carries the two addresses and nothing else, so a caller can read them.
  console.log('image uri: ' + imageUri);
  console.log('metadata uri: ' + metadataUri);
  console.error('');
  console.error('dogrulandi: metadata URI geri cekildi, JSON ayni, image alani ' + imageUri);
  console.error('metadata.json degistirilmedi. Launch: node contestant/launch-contestant.mjs --yes --uri ' + metadataUri);
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
