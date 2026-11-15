// contestant/logo.mjs — the $CONTEST logo asset and a PNG renderer for it.
//
// Exports:
//   LOGO_SVG_PATH   absolute path of contestant/contestant-logo.svg
//   renderLogoPng(outPath, size) -> Promise<string>  the absolute path written
//
// renderLogoPng writes a real 1024x1024 PNG when sharp or @resvg/resvg-js is
// installed. When neither is available it copies the SVG to outPath instead and
// says so on stderr, so a caller never gets a silent no-op.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Absolute path of the source SVG (1024x1024, square, no external references). */
export const LOGO_SVG_PATH = resolve(HERE, 'contestant-logo.svg');

/** Native size of the artwork, in pixels. */
export const LOGO_SIZE = 1024;

const FALLBACK_WARNING = 'PNG dönüştürücü yok, SVG kullanıldı';

async function loadRenderer() {
  try {
    const sharp = (await import('sharp')).default;
    if (sharp) return { name: 'sharp', sharp };
  } catch {
    // sharp is not installed here; try the next renderer.
  }
  try {
    const resvg = await import('@resvg/resvg-js');
    const Resvg = resvg.Resvg ?? resvg.default?.Resvg;
    if (Resvg) return { name: 'resvg', Resvg };
  } catch {
    // @resvg/resvg-js is not installed here either.
  }
  return null;
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

  const renderer = await loadRenderer();

  if (renderer?.name === 'sharp') {
    const svg = readFileSync(LOGO_SVG_PATH);
    await renderer.sharp(svg)
      .resize(size, size, { fit: 'cover' })
      .png()
      .toFile(target);
    return target;
  }

  if (renderer?.name === 'resvg') {
    const svg = readFileSync(LOGO_SVG_PATH, 'utf8');
    const png = new renderer.Resvg(svg, {
      fitTo: { mode: 'width', value: size },
      background: 'rgba(0,0,0,0)',
    }).render().asPng();
    writeFileSync(target, png);
    return target;
  }

  // No rasteriser available: hand back the SVG bytes at the requested path.
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
