// contestant/logo.mjs — the $CONTEST logo asset and a PNG renderer for it.
//
// Exports:
//   LOGO_SVG_PATH   absolute path of contestant/contestant-logo.svg
//   LOGO_SIZE       native edge length of the artwork (1024)
//   renderLogoPng(outPath, size) -> Promise<string>  the absolute path written
//
// renderLogoPng rasterises the SVG with the first renderer it finds, in order:
//   1. sharp            (if installed in the project or globally)
//   2. @resvg/resvg-js  (if installed)
//   3. rsvg-convert     (librsvg, if on PATH)
//   4. qlmanage         (macOS QuickLook, ships with the OS)
// With none of them it copies the SVG to outPath and says so on stderr, so a
// caller never gets a silent no-op. Every attempt is checked for real PNG bytes
// before it is accepted, so a half-written or non-PNG file never passes.
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Absolute path of the source SVG (1024x1024, square, no external references). */
export const LOGO_SVG_PATH = resolve(HERE, 'contestant-logo.svg');

/** Native size of the artwork, in pixels. */
export const LOGO_SIZE = 1024;

const FALLBACK_WARNING = 'PNG dönüştürücü yok, SVG kullanıldı';
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function isPng(path) {
  try {
    return readFileSync(path).subarray(0, 8).equals(PNG_MAGIC);
  } catch {
    return false;
  }
}

function hasBinary(name, probeArg = '--version') {
  try {
    execFileSync(name, [probeArg], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function loadModuleRenderer() {
  try {
    const sharp = (await import('sharp')).default;
    if (sharp) {
      return async (target, size) => {
        await sharp(readFileSync(LOGO_SVG_PATH))
          .resize(size, size, { fit: 'cover' })
          .png()
          .toFile(target);
      };
    }
  } catch {
    // sharp is not installed here; try the next renderer.
  }
  try {
    const resvg = await import('@resvg/resvg-js');
    const Resvg = resvg.Resvg ?? resvg.default?.Resvg;
    if (Resvg) {
      return async (target, size) => {
        const svg = readFileSync(LOGO_SVG_PATH, 'utf8');
        const png = new Resvg(svg, {
          fitTo: { mode: 'width', value: size },
          background: 'rgba(0,0,0,0)',
        })
          .render()
          .asPng();
        writeFileSync(target, png);
      };
    }
  } catch {
    // @resvg/resvg-js is not installed here either.
  }
  return null;
}

function rsvgRenderer() {
  if (!hasBinary('rsvg-convert')) return null;
  return async (target, size) => {
    execFileSync(
      'rsvg-convert',
      ['-w', String(size), '-h', String(size), '-o', target, LOGO_SVG_PATH],
      { stdio: 'pipe' },
    );
  };
}

function quickLookRenderer() {
  // macOS only: qlmanage writes <basename>.png into the output directory and
  // renders a square SVG at exactly the requested edge length.
  if (process.platform !== 'darwin' || !hasBinary('/usr/bin/qlmanage', '-h')) return null;
  return async (target, size) => {
    const dir = mkdtempSync(join(tmpdir(), 'contestant-logo-'));
    try {
      execFileSync(
        '/usr/bin/qlmanage',
        ['-t', '-s', String(size), '-o', dir, LOGO_SVG_PATH],
        { stdio: 'ignore' },
      );
      const produced = readdirSync(dir).find((name) => name.toLowerCase().endsWith('.png'));
      if (!produced) throw new Error('qlmanage produced no PNG');
      copyFileSync(join(dir, produced), target);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

/**
 * Render the logo to outPath.
 * @param {string} outPath where to write the image (relative paths resolve against the cwd)
 * @param {number} [size] square edge length for a PNG, default 1024
 * @returns {Promise<string>} the absolute path written
 */
export async function renderLogoPng(outPath, size = LOGO_SIZE) {
  if (!outPath) throw new TypeError('renderLogoPng(outPath): outPath is required');
  const target = resolve(outPath);
  mkdirSync(dirname(target), { recursive: true });

  const renderers = [await loadModuleRenderer(), rsvgRenderer(), quickLookRenderer()].filter(
    Boolean,
  );

  for (const render of renderers) {
    try {
      await render(target, size);
      if (isPng(target)) return target;
    } catch {
      // This renderer failed; fall through to the next one.
    }
  }

  // No working rasteriser: hand back the SVG bytes at the requested path.
  copyFileSync(LOGO_SVG_PATH, target);
  console.warn(FALLBACK_WARNING);
  return target;
}

// `node contestant/logo.mjs [out.png]` renders the logo once, for a quick check.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const out = process.argv[2] ?? 'contestant/logo.png';
  const written = await renderLogoPng(out);
  console.log(written);
}
