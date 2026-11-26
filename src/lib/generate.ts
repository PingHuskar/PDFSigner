import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import JSZip from 'jszip';
import type { DataRecord, Field, FontAsset, ImageAsset, Template, Variable } from '../types';
import { interpolate, resolveImage } from './placeholders';

export interface RenderContext {
  template: Template;
  fields: Field[];
  variables: Variable[];
  assets: ImageAsset[];
  font: FontAsset | null;
}

function hexToRgb(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const n = m ? parseInt(m[1], 16) : 0;
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

async function dataUrlToBytes(url: string) {
  return new Uint8Array(await (await fetch(url)).arrayBuffer());
}

/** Embeds fonts/images once per output document. */
function makeEmbedder(doc: PDFDocument, ctx: RenderContext) {
  let fontP: Promise<PDFFont> | null = null;
  const images = new Map<string, Promise<PDFImage>>();
  return {
    font() {
      if (!fontP) {
        if (ctx.font) {
          doc.registerFontkit(fontkit);
          // subset:false is slower/larger but avoids glyph corruption seen with some TTFs.
          fontP = doc.embedFont(ctx.font.bytes, { subset: false });
        } else fontP = doc.embedFont(StandardFonts.Helvetica);
      }
      return fontP;
    },
    image(asset: ImageAsset) {
      let p = images.get(asset.id);
      if (!p) {
        p = dataUrlToBytes(asset.dataUrl).then((b) =>
          asset.dataUrl.startsWith('data:image/png') ? doc.embedPng(b) : doc.embedJpg(b),
        );
        images.set(asset.id, p);
      }
      return p;
    },
  };
}

async function drawRecord(
  pages: PDFPage[],
  record: DataRecord,
  rowNumber: number,
  ctx: RenderContext,
  emb: ReturnType<typeof makeEmbedder>,
) {
  for (const f of ctx.fields) {
    const page = pages[f.page];
    if (!page) continue;
    const box = page.getCropBox();
    const top = box.y + box.height; // PDF y of the visible page's top edge
    const left = box.x;

    if (f.kind === 'image') {
      const asset = resolveImage(f, record, ctx.assets);
      if (!asset) continue;
      const img = await emb.image(asset);
      const s = Math.min(f.w / img.width, f.h / img.height);
      const w = img.width * s;
      const h = img.height * s;
      page.drawImage(img, {
        x: left + f.x + (f.w - w) / 2,
        y: top - (f.y + (f.h - h) / 2) - h,
        width: w,
        height: h,
      });
      continue;
    }

    const text = interpolate(f.text, record, ctx.variables, rowNumber);
    if (!text) continue;
    const font = await emb.font();
    const size = f.fontSize;
    const lineH = size * 1.2;
    const lines = text.split(/\r?\n/);
    const blockTop = f.y + (f.h - lines.length * lineH) / 2;
    const ascent = font.heightAtSize(size, { descender: false });
    const full = font.heightAtSize(size);
    const color = hexToRgb(f.color);

    lines.forEach((line, i) => {
      let width: number;
      try {
        width = font.widthOfTextAtSize(line, size);
      } catch {
        throw new Error(
          `Record ${rowNumber}: "${line}" has characters the built-in font can't draw. ` +
            'Upload a TTF/OTF font that supports them (e.g. Sarabun or Noto Sans Thai for Thai).',
        );
      }
      const pad = 2;
      const x =
        f.align === 'left' ? f.x + pad : f.align === 'center' ? f.x + (f.w - width) / 2 : f.x + f.w - width - pad;
      const baseline = blockTop + i * lineH + (lineH - full) / 2 + ascent;
      page.drawText(line, { x: left + x, y: top - baseline, size, font, color });
    });
  }
}

const recordsOrBlank = (records: DataRecord[]) => (records.length ? records : [{}]);

/** All records in one PDF, one copy of the template per record. */
export async function generateMerged(ctx: RenderContext, records: DataRecord[], startRow = 1) {
  const tpl = await PDFDocument.load(ctx.template.bytes, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const emb = makeEmbedder(out, ctx);
  const list = recordsOrBlank(records);
  for (let i = 0; i < list.length; i++) {
    const pages = await out.copyPages(tpl, tpl.getPageIndices());
    pages.forEach((p) => out.addPage(p));
    await drawRecord(pages, list[i], startRow + i, ctx, emb);
  }
  return out.save();
}

function safeFileName(name: string) {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim();
  return cleaned || 'document';
}

/** One PDF per record, zipped. File names come from a {{variable}} pattern. */
export async function generateZip(
  ctx: RenderContext,
  records: DataRecord[],
  pattern: string,
  onProgress?: (done: number, total: number) => void,
) {
  const zip = new JSZip();
  const used = new Set<string>();
  const list = recordsOrBlank(records);
  for (let i = 0; i < list.length; i++) {
    const doc = await PDFDocument.load(ctx.template.bytes, { ignoreEncryption: true });
    await drawRecord(doc.getPages(), list[i], i + 1, ctx, makeEmbedder(doc, ctx));
    let base = safeFileName(interpolate(pattern, list[i], ctx.variables, i + 1)).replace(/\.pdf$/i, '');
    let name = `${base}.pdf`;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} (${n}).pdf`;
    used.add(name.toLowerCase());
    zip.file(name, await doc.save());
    onProgress?.(i + 1, list.length);
  }
  return zip.generateAsync({ type: 'blob' });
}
