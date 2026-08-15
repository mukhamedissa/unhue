import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import * as esbuild from 'esbuild';
import { minify } from 'terser';

const LIMIT = 13312;
const DIST = 'dist';

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const deflated = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);

    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x2821, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);
    locals.push(local, deflated);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x2821, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(deflated.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(0, 30);
    central.writeUInt32LE(0, 34);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);
    centrals.push(central);

    offset += local.length + deflated.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, centralBuf, end]);
}

function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}

function minifyHtml(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<style>([\s\S]*?)<\/style>/g, (_, css) => `<style>${minifyCss(css)}</style>`)
    .replace(/>\s+</g, '><')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
}

const bundle = await esbuild.build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  charset: 'utf8',
  write: false,
  legalComments: 'none',
});

const minified = await minify(bundle.outputFiles[0].text, {
  ecma: 2020,
  module: false,
  toplevel: true,
  compress: {
    passes: 3,
    drop_console: true,
    drop_debugger: true,
    booleans_as_integers: true,
    unsafe: true,
    unsafe_arrows: true,
    unsafe_math: true,
    unsafe_methods: true,
    pure_getters: true,
  },
  mangle: { toplevel: true, properties: false },
  format: { comments: false },
});

if (!minified.code) throw new Error('terser produced no output');

const html = minifyHtml(readFileSync('index.html', 'utf8')).replace(
  /<script type="module" src="src\/main\.js"><\/script>/,
  `<script>${minified.code}</script>`
);

if (html.includes('src/main.js')) throw new Error('script tag was not inlined');

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
writeFileSync(`${DIST}/index.html`, html);

const archive = zip([{ name: 'index.html', data: Buffer.from(html, 'utf8') }]);
writeFileSync(`${DIST}/game.zip`, archive);

const size = archive.length;
const pct = ((size / LIMIT) * 100).toFixed(1);
const left = LIMIT - size;

console.log(`js  ${minified.code.length} B`);
console.log(`html ${Buffer.byteLength(html)} B`);
console.log(`zip  ${size} B / ${LIMIT} B  (${pct}%, ${left} B left)`);

if (size > LIMIT) {
  console.error(`over the js13k limit by ${-left} B`);
  process.exit(1);
}
