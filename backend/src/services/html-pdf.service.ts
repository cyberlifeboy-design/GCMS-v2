import type { Browser } from 'puppeteer-core';

// Lazily launched, kept warm across requests — relaunching headless Chromium per
// PDF would dominate render time. Runs as root inside the container, hence
// --no-sandbox; safe here since every page rendered is our own server-built HTML,
// never third-party or user-supplied markup with scripts.
let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    const puppeteer = await import('puppeteer-core');
    browserPromise = puppeteer.default.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    // A failed launch must not be cached forever — clear it so the next request retries.
    browserPromise.catch(() => { browserPromise = null; });
  }
  return browserPromise;
}

/** Renders a self-contained HTML document (inline CSS, no external network calls) to an A4 PDF buffer. */
export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

/** Decode a "data:image/png;base64,AAAA" string, or wrap a raw Buffer, as an <img> src. Falls back to null when unusable. */
export function toImgSrc(source: string | Buffer | null | undefined, mime = 'image/png'): string | null {
  if (!source) return null;
  if (Buffer.isBuffer(source)) return `data:${mime};base64,${source.toString('base64')}`;
  return source.startsWith('data:') ? source : null;
}

function esc(value: unknown): string {
  if (value == null || value === '') return '—';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Shared brand shell: gradient header (matches the on-screen forms), reference/date strip, one-page-oriented print CSS. */
export function reportShell(opts: {
  title: string;
  subtitle?: string;
  reference: string;
  bodyHtml: string;
  accent?: string; // header gradient end color, per-report-type accent
}): string {
  const accent = opts.accent ?? '#1787b5';
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(opts.title)}</title>
<style>
  * { box-sizing: border-box; }
  @page { size: A4; margin: 10mm 12mm; }
  body { font-family: 'Segoe UI', Helvetica, Arial, sans-serif; color: #1f2937; margin: 0; font-size: 10.5px; }
  .hdr { background: linear-gradient(135deg, #143b66, ${accent}); color: #fff; padding: 14px 18px; border-radius: 8px; margin-bottom: 10px; }
  .hdr h1 { margin: 2px 0 0; font-size: 18px; font-weight: 800; }
  .hdr .sub { font-size: 11px; opacity: 0.9; margin-top: 2px; }
  .hdr .meta { display: flex; justify-content: space-between; font-size: 9.5px; opacity: 0.85; margin-top: 8px; }
  .section { margin-bottom: 8px; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; }
  .section .bar { background: #1f2937; color: #fff; font-weight: 700; font-size: 10.5px; padding: 4px 10px; text-transform: uppercase; letter-spacing: 0.03em; }
  .section .content { padding: 8px 10px; }
  .kv { display: grid; grid-template-columns: 180px 1fr; gap: 2px 8px; margin-bottom: 2px; }
  .kv .l { font-weight: 700; color: #4b5563; }
  .kv .v { color: #111827; }
  .badge { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 9px; font-weight: 700; margin-right: 4px; }
  .sig-box { border: 1px solid #ccc; border-radius: 4px; width: 220px; height: 64px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .sig-box img { max-width: 100%; max-height: 100%; }
  .sig-cap { font-size: 8.5px; color: #666; margin-top: 2px; }
  .footer { text-align: center; font-size: 8px; color: #9ca3af; margin-top: 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5px; }
  th, td { text-align: left; padding: 3px 6px; border-bottom: 1px solid #eee; }
  th { background: #f3f4f6; font-size: 9px; text-transform: uppercase; }
</style></head>
<body>
  <div class="hdr">
    <div style="font-size:10px; font-weight:700; letter-spacing:0.05em; opacity:0.85;">GCMS</div>
    <h1>${esc(opts.title)}</h1>
    ${opts.subtitle ? `<div class="sub">${esc(opts.subtitle)}</div>` : ''}
    <div class="meta"><span>Ref: ${esc(opts.reference)}</span><span>Generated: ${new Date().toLocaleString()}</span></div>
  </div>
  ${opts.bodyHtml}
  <div class="footer">Golf Cart Management System</div>
</body></html>`;
}

/** One bordered, dark-barred section — the HTML analog of pdf.service's old sectionBox. */
export function section(title: string, innerHtml: string): string {
  return `<div class="section"><div class="bar">${esc(title)}</div><div class="content">${innerHtml}</div></div>`;
}

/** One label/value row. */
export function kv(label: string, value: unknown): string {
  return `<div class="kv"><div class="l">${esc(label)}</div><div class="v">${esc(value)}</div></div>`;
}

/** A signature block: image (from a data URI) or a placeholder box, plus who/when signed it. */
export function sigBlock(label: string, dataUri: string | null | undefined, at?: string | null, by?: string | null): string {
  const src = toImgSrc(dataUri);
  const inner = src ? `<img src="${src}" />` : `<span style="color:#999;font-size:9px;">Not signed</span>`;
  const caption = (by || at) ? `<div class="sig-cap">${esc(by)}${by && at ? ' · ' : ''}${at ? new Date(at).toLocaleString() : ''}</div>` : '';
  return `<div style="margin-bottom:6px;"><div style="font-weight:700;font-size:9.5px;color:#4b5563;margin-bottom:2px;">${esc(label)}</div><div class="sig-box">${inner}</div>${caption}</div>`;
}

export { esc };
