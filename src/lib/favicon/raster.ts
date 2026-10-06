/**
 * Favicon generation — the raster half.
 *
 * `sharp` is a native Node module. It cannot load in workerd, so nothing here
 * may be imported by a page or by a prerendered endpoint when building for
 * Cloudflare. These are called from the `favicon-assets` integration in
 * `astro.config.mjs`, which runs in `astro:build:done` — always in Node, on
 * every adapter.
 */
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { buildFaviconSvg } from './svg.ts';

/** Rasterise the favicon SVG to a square PNG buffer of the given pixel size. */
export async function renderFaviconPng(
  letter: string,
  bgColor: string,
  size: number,
  fgColor = '#ffffff'
): Promise<Buffer> {
  const svg = buildFaviconSvg(letter, bgColor, fgColor, size);
  return sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
}

/** Build a multi-size favicon.ico (16/32/48) from the outlined SVG. */
export async function renderFaviconIco(
  letter: string,
  bgColor: string,
  fgColor = '#ffffff'
): Promise<Buffer> {
  const pngs = await Promise.all(
    [16, 32, 48].map((s) => renderFaviconPng(letter, bgColor, s, fgColor))
  );
  return pngToIco(pngs);
}

/** The square of the source image a favicon is drawn from. */
export interface FaviconCrop {
  left: number;
  top: number;
  size: number;
}

/** A square PNG of `size` pixels, cut from `crop` of the image at `path`. */
export async function renderImageFaviconPng(path: string, crop: FaviconCrop, size: number): Promise<Buffer> {
  return sharp(path)
    .extract({ left: crop.left, top: crop.top, width: crop.size, height: crop.size })
    .resize(size, size, { kernel: 'lanczos3' })
    // Palette PNG: a photo-like image as a full-colour PNG weighs several
    // times more, and favicon.svg embeds one in every page's first load.
    .png({ palette: true, quality: 90, compressionLevel: 9 })
    .toBuffer();
}

/** A multi-size favicon.ico (16/32/48) from the image. */
export async function renderImageFaviconIco(path: string, crop: FaviconCrop): Promise<Buffer> {
  const pngs = await Promise.all([16, 32, 48].map((s) => renderImageFaviconPng(path, crop, s)));
  return pngToIco(pngs);
}

/**
 * favicon.svg for an image favicon: the 128px PNG embedded in an SVG wrapper,
 * so the `image/svg+xml` link, the manifest and the Organization logo keep
 * resolving to the same file name whichever kind of favicon the site uses.
 */
export async function renderImageFaviconSvg(path: string, crop: FaviconCrop): Promise<string> {
  const png = await renderImageFaviconPng(path, crop, 128);
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ' +
    'width="128" height="128" viewBox="0 0 128 128">' +
    `<image width="128" height="128" href="data:image/png;base64,${png.toString('base64')}"/>` +
    '</svg>'
  );
}
