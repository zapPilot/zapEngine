import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { format } from 'prettier';
const pkg = fileURLToPath(new URL('../', import.meta.url));
const repo = path.resolve(process.argv[2] ?? path.resolve(pkg, '../..'));
const tokens = JSON.parse(
  await readFile(path.join(pkg, 'tokens.json'), 'utf8'),
);
const glyphs = JSON.parse(
  await readFile(path.join(pkg, 'brand/glyphs.json'), 'utf8'),
);
// Mirrors self-hosting in zap-pilot-story. Flip it with SELF_HOSTING_LABEL in fonts.py, then regenerate (see BRAND.md).
const SELF_HOSTING_STATUS = 'planned';
const outputs = [];
async function save(relative, data) {
  const target = path.join(repo, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(
    target,
    relative.endsWith('.ts')
      ? await format(data, { parser: 'typescript', singleQuote: true })
      : data,
  );
  outputs.push(relative);
}
function mark(mode, adaptive = false, template = false) {
  const color = (role) =>
    template
      ? '#000000'
      : adaptive
        ? `var(--${role})`
        : tokens.mode[mode][role];
  return tokens.mark.layers
    .map((layer) =>
      layer.kind === 'path'
        ? `<path d="${layer.d}" fill="none" stroke="${color(layer.role)}" stroke-width="${layer.strokeWidth}" stroke-linecap="round"/>`
        : `<circle cx="${layer.cx}" cy="${layer.cy}" r="${layer.r}" fill="${color(layer.role)}"/>`,
    )
    .join('');
}
function icon(
  mode,
  { adaptive = false, background = false, template = false } = {},
) {
  const themes = adaptive
    ? `<style>:root{--ink:${tokens.mode.paper.ink};--sign-ink:${tokens.mode.paper['sign-ink']}}@media(prefers-color-scheme:dark){:root{--ink:${tokens.mode.night.ink};--sign-ink:${tokens.mode.night['sign-ink']}}}</style>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -6 44 44">${themes}${background ? `<rect x="-6" y="-6" width="44" height="44" fill="${tokens.mode[mode].ground}"/>` : ''}${mark(mode, adaptive, template)}</svg>`;
}
function outline(model, x, centerY, height, fill) {
  const scale = height / model.viewBox[3];
  const top = -model.viewBox[1],
    bottom = top - model.viewBox[3];
  const baseline = centerY + ((top + bottom) / 2) * scale;
  return `<g fill="${fill}" transform="translate(${x - model.viewBox[0] * scale} ${baseline}) scale(${scale} ${-scale})">${model.paths.map((glyph) => `<path d="${glyph.d}" transform="translate(${glyph.x} ${glyph.y})"/>`).join('')}</g>`;
}
function run(model, x, baseline, scale, mode) {
  const style = model.style;
  const color = tokens.mode[mode][style === 's' ? 'sign-ink' : 'ink'];
  const paths = model.paths
    .map(
      (glyph) =>
        `<path d="${glyph.d}" transform="translate(${glyph.x} ${glyph.y})"/>`,
    )
    .join('');
  let content = paths;
  if (style === 'o') {
    // The black union of glyph fills masks all interior stroke seams, including
    // overlapping contours. Only the outer half of the doubled stroke remains;
    // counters stay open and the exported SVG stays transparent.
    const stroke = 3 / scale;
    const [left, top, width, height] = model.viewBox;
    const id = `outline-${model.word}`;
    content = `<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="${left - stroke}" y="${-top - height - stroke}" width="${width + stroke * 2}" height="${height + stroke * 2}"><g fill="none" stroke="white" stroke-width="${stroke}" stroke-linejoin="round">${paths}</g><g fill="black">${paths}</g></mask></defs><g fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linejoin="round" mask="url(#${id})">${paths}</g>`;
  }
  return `<g transform="translate(${x} ${baseline}) scale(${scale} ${-scale})" fill="${color}">${content}</g>`;
}
function slogan(mode, x, y, height) {
  const scale = height / glyphs.slogan[0][0].viewBox[3];
  return glyphs.slogan
    .map((line, index) => {
      let cursor = x;
      return line
        .map((word) => {
          const result = run(
            word,
            cursor,
            y + index * height * 1.3,
            scale,
            mode,
          );
          cursor += (word.advance + word.unitsPerEm * 0.2) * scale;
          return result;
        })
        .join('');
    })
    .join('');
}
function sloganWidth(height) {
  const scale = height / glyphs.slogan[0][0].viewBox[3];
  return (
    Math.max(
      ...glyphs.slogan.map(
        (line) =>
          line.reduce((width, word) => width + word.advance, 0) +
          line[0].unitsPerEm * 0.2,
      ),
    ) * scale
  );
}
function statusMarker(mode, x, y, height) {
  const color = tokens.mode[mode].ink;
  const shape = tokens.status[SELF_HOSTING_STATUS];
  const fill = shape.glyph === 'filled' ? color : 'none';
  const dash = shape.line === 'dashed' ? '3 3' : 'none';
  return `<g data-capability="self-hosting" data-status="${SELF_HOSTING_STATUS}"><circle cx="${x + height / 2}" cy="${y}" r="${height / 2}" fill="${fill}" stroke="${color}" stroke-width="1.5" stroke-dasharray="${dash}"/>${outline(glyphs.status, x + height * 1.5, y, height, color)}</g>`;
}
function logo(mode, tagline = false) {
  const h = tagline ? 208 : 64;
  const wordHeight = 31;
  const wordWidth =
    (glyphs.wordmark.viewBox[2] / glyphs.wordmark.viewBox[3]) * wordHeight;
  const width = 76 + Math.max(wordWidth, tagline ? sloganWidth(24) : 0) + 8;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${h}"><g transform="translate(6 4) scale(1.75)">${mark(mode)}</g>${outline(glyphs.wordmark, 76, 32, wordHeight, tokens.mode[mode].ink)}${tagline ? slogan(mode, 76, 94, 24) + statusMarker(mode, 76, 185, 10) : ''}</svg>`;
}
const png = (svg, width) =>
  new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng();
const landing = 'apps/landing-page/public/';
await save(landing + 'zap-pilot-icon.svg', icon('paper', { adaptive: true }));
await save(landing + 'zap-pilot-icon.png', png(icon('paper'), 512));
for (const mode of ['paper', 'night']) {
  const stem = 'zap-pilot-logo' + (mode === 'night' ? '-night' : '');
  const svg = logo(mode);
  await save(landing + stem + '.svg', svg);
  await save(landing + stem + '.png', png(svg, 1200));
}
const tagline = logo('paper', true);
await save(landing + 'zap-pilot-logo-tagline.svg', tagline);
await save(landing + 'zap-pilot-logo-tagline.png', png(tagline, 1200));
await save(
  landing + 'apple-touch-icon.png',
  png(icon('paper', { background: true }), 180),
);
for (const ext of ['svg', 'png'])
  await rm(path.join(repo, landing, 'zap-pilot-logo-dark.' + ext), {
    force: true,
  });
const icoPng = png(icon('paper', { background: true }), 256);
const ico = Buffer.alloc(22);
ico.writeUInt16LE(1, 2);
ico.writeUInt16LE(1, 4);
ico.writeUInt16LE(1, 10);
ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(icoPng.length, 14);
ico.writeUInt32LE(22, 18);
await save(
  'apps/landing-page/src/app/favicon.ico',
  Buffer.concat([ico, icoPng]),
);
const app = 'apps/app/assets/brand/';
await save(app + 'icon.svg', icon('night', { background: true }));
await save(app + 'icon.png', png(icon('night', { background: true }), 1024));
await save(app + 'adaptive-foreground.svg', icon('night'));
await save(app + 'adaptive-icon.png', png(icon('night'), 1024));
await save(app + 'splash-icon.png', png(icon('night'), 512));
await save(app + 'favicon.png', png(icon('night', { background: true }), 32));
for (const size of [192, 512])
  await save(
    app + `maskable-${size}.png`,
    png(icon('night', { background: true }), size),
  );
await save(
  'apps/desktop/build/icon.png',
  png(icon('night', { background: true }), 1024),
);
const chunks = await Promise.all(
  [
    [16, 'icp4'],
    [32, 'icp5'],
    [64, 'icp6'],
    [128, 'ic07'],
    [256, 'ic08'],
    [512, 'ic09'],
    [1024, 'ic10'],
  ].map(async ([size, tag]) => {
    const bitmap = await sharp(png(icon('night', { background: true }), size))
      .png()
      .toBuffer();
    const header = Buffer.alloc(8);
    header.write(tag);
    header.writeUInt32BE(bitmap.length + 8, 4);
    return Buffer.concat([header, bitmap]);
  }),
);
const icns = Buffer.alloc(8);
icns.write('icns');
icns.writeUInt32BE(
  chunks.reduce((sum, b) => sum + b.length, 8),
  4,
);
await save('apps/desktop/build/icon.icns', Buffer.concat([icns, ...chunks]));
await save(
  'apps/desktop/src/main/tray-icon.ts',
  `// Generated from tokens.mark by design-tokens/scripts/brand.mjs.\nexport const TRAY_ICON_DATA_URL =\n// eslint-disable-next-line no-secrets/no-secrets -- Branded PNG data URL, not a secret.\n'data:image/png;base64,${png(icon('paper', { template: true }), 16).toString('base64')}';\n`,
);
await save(
  'apps/control-center/public/favicon.svg',
  icon('paper', { adaptive: true }),
);
await save('apps/video/public/brand/zap-pilot-logo-night.svg', logo('night'));
await rm(path.join(repo, 'apps/video/public/brand/zap-pilot-logo.svg'), {
  force: true,
});
await save(
  'apps/podcast-pipeline/assets/video/brand/zap-pilot-logo.svg',
  logo('night'),
);
function signoff(width, height, fontHeight, footer = 0) {
  const x = (width - sloganWidth(fontHeight)) / 2;
  const center = (height - footer) / 2;
  const wordHeight = fontHeight * 0.9;
  const wordWidth =
    (glyphs.wordmark.viewBox[2] / glyphs.wordmark.viewBox[3]) * wordHeight;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${tokens.mode.night.ground}"/><g transform="translate(${(width - fontHeight * 2) / 2} ${center - fontHeight * 6.3}) scale(${fontHeight / 16})">${mark('night')}</g>${outline(glyphs.wordmark, (width - wordWidth) / 2, center - fontHeight * 3.2, wordHeight, tokens.mode.night.ink)}${slogan('night', x, center - fontHeight * 0.8, fontHeight)}${statusMarker('night', x, center + fontHeight * 3.5, fontHeight * 0.3)}${outline(glyphs.site, x, center + fontHeight * 4.4, fontHeight * 0.3, tokens.mode.night['ink-2'])}</svg>`;
}
await save(
  'apps/podcast-pipeline/assets/video/brand/zap-pilot-outro.png',
  png(signoff(720, 640, 32), 2880),
);
await save(
  'apps/podcast-pipeline/assets/video/brand/zap-pilot-signoff.svg',
  signoff(1080, 1920, 74, 200),
);
await mkdir(path.join(repo, 'packages/design-tokens/brand'), {
  recursive: true,
});
await writeFile(
  path.join(repo, 'packages/design-tokens/brand/outputs.json'),
  JSON.stringify(outputs, null, 2) + '\n',
);
console.log(
  `Generated ${outputs.length} brand outputs from tokens.mark and glyphs.`,
);
