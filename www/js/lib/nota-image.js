// Nota berkop dalam bentuk gambar JPG.
// Tata letak TIDAK ditulis ulang: buildNotaPDF() (pdf.js) menggambar ke
// CanvasDoc — tiruan kecil API jsPDF yang dipakai pdf.js — sehingga nota JPG
// identik dengan nota PDF, hanya saja satu halaman memanjang setinggi isinya.
import { buildNotaPDF, kopLogo } from './pdf.js';

const PT = 25.4 / 72;                 // 1 pt dalam mm
const LINE_HEIGHT = 1.15;             // lineHeightFactor bawaan jsPDF
const FAMILY = 'Helvetica, Arial, "Liberation Sans", Roboto, sans-serif';
const PAGE_W = { a4: 210, a5: 148 };
const MEASURE_SCALE = 10;             // px per mm saat mengukur teks

/** Lebar gambar nota (px). ±1240 px = tajam di layar HP & cukup kecil untuk WhatsApp. */
export const JPG_WIDTH = 1240;

/**
 * Buat kelas mirip jsPDF yang merekam perintah gambar lalu memutarnya ke canvas.
 * @param {object} env
 *   createCanvas(w, h) → canvas dengan getContext('2d')  (browser: elemen <canvas>)
 *   images: Map dataURL → { img, width, height }  (gambar sudah dimuat sebelumnya)
 */
export function makeCanvasDoc({ createCanvas, images = new Map() }) {
  const measureCtx = createCanvas(4, 4).getContext('2d');

  return class CanvasDoc {
    constructor(o = {}) {
      const fmt = String(o.format || 'a5').toLowerCase();
      this.width = PAGE_W[fmt] || PAGE_W.a5;
      this.height = fmt === 'a4' ? 297 : 210;
      this.pages = [[]];
      this.cur = 0;
      this.st = { text: [0, 0, 0], draw: [0, 0, 0], fill: [0, 0, 0], lw: 0.2, style: 'normal', size: 16 };
    }

    // ---- Status
    setProperties() { return this; }
    setTextColor(r, g, b) { this.st.text = [r, g, b]; return this; }
    setDrawColor(r, g, b) { this.st.draw = [r, g, b]; return this; }
    setFillColor(r, g, b) { this.st.fill = [r, g, b]; return this; }
    setLineWidth(w) { this.st.lw = w; return this; }
    setFont(_family, style = 'normal') { this.st.style = style || 'normal'; return this; }
    setFontSize(size) { this.st.size = size; return this; }
    setPageHeight(h) { this.height = h; return this; }
    addPage() { this.pages.push([]); this.cur = this.pages.length - 1; return this; }
    setPage(n) { this.cur = Math.min(Math.max(n, 1), this.pages.length) - 1; return this; }
    getNumberOfPages() { return this.pages.length; }

    // ---- Teks
    fontCss(scale, st = this.st) {
      const s = st.style.toLowerCase();
      const italic = s.includes('italic') ? 'italic ' : '';
      const bold = s.includes('bold') ? 'bold ' : '';
      return `${italic}${bold}${st.size * PT * scale}px ${FAMILY}`;
    }
    getTextWidth(text) {
      measureCtx.font = this.fontCss(MEASURE_SCALE);
      return measureCtx.measureText(String(text)).width / MEASURE_SCALE;
    }
    splitTextToSize(text, maxWidth) {
      const out = [];
      for (const para of String(text ?? '').split(/\r?\n/)) {
        const words = para.split(/\s+/).filter(Boolean);
        if (!words.length) { out.push(''); continue; }
        let line = '';
        for (let w of words) {
          // Kata yang lebih panjang dari baris dipotong per huruf.
          while (this.getTextWidth(w) > maxWidth && w.length > 1) {
            let k = w.length - 1;
            while (k > 1 && this.getTextWidth(w.slice(0, k)) > maxWidth) k--;
            if (line) { out.push(line); line = ''; }
            out.push(w.slice(0, k));
            w = w.slice(k);
          }
          const cand = line ? `${line} ${w}` : w;
          if (line && this.getTextWidth(cand) > maxWidth) { out.push(line); line = w; } else line = cand;
        }
        out.push(line);
      }
      return out;
    }
    text(text, x, y, o = {}) {
      let lines = Array.isArray(text) ? text.map(String) : String(text ?? '').split(/\r?\n/);
      if (o.maxWidth) lines = lines.flatMap((l) => this.splitTextToSize(l, o.maxWidth));
      const st = { ...this.st };
      const charSpace = Number(o.charSpace) || 0;
      const align = o.align || 'left';
      const lineH = st.size * PT * LINE_HEIGHT;
      const self = this;
      this.op((ctx, s) => {
        ctx.font = self.fontCss(s, st);
        ctx.fillStyle = rgb(st.text);
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
        lines.forEach((line, i) => {
          const yy = (y + i * lineH) * s;
          const chars = [...line];
          const w = ctx.measureText(line).width + (charSpace ? charSpace * s * chars.length : 0);
          let xx = x * s;
          if (align === 'center') xx -= w / 2;
          else if (align === 'right') xx -= w;
          if (!charSpace) { ctx.fillText(line, xx, yy); return; }
          for (const ch of chars) { ctx.fillText(ch, xx, yy); xx += ctx.measureText(ch).width + charSpace * s; }
        });
      });
      return this;
    }

    // ---- Bentuk
    line(x1, y1, x2, y2) {
      const { draw, lw } = this.st;
      this.op((ctx, s) => {
        ctx.strokeStyle = rgb(draw); ctx.lineWidth = lw * s;
        ctx.beginPath(); ctx.moveTo(x1 * s, y1 * s); ctx.lineTo(x2 * s, y2 * s); ctx.stroke();
      });
      return this;
    }
    rect(x, y, w, h, style = 'S') { return this.roundedRect(x, y, w, h, 0, 0, style); }
    roundedRect(x, y, w, h, rx, _ry, style = 'S') {
      const { draw, fill, lw } = this.st;
      const mode = String(style || 'S').toUpperCase();
      this.op((ctx, s) => {
        ctx.beginPath();
        const r = Math.min(rx, w / 2, h / 2) * s;
        const X = x * s; const Y = y * s; const Wd = w * s; const Ht = h * s;
        ctx.moveTo(X + r, Y);
        ctx.arcTo(X + Wd, Y, X + Wd, Y + Ht, r);
        ctx.arcTo(X + Wd, Y + Ht, X, Y + Ht, r);
        ctx.arcTo(X, Y + Ht, X, Y, r);
        ctx.arcTo(X, Y, X + Wd, Y, r);
        ctx.closePath();
        if (mode.includes('F')) { ctx.fillStyle = rgb(fill); ctx.fill(); }
        if (mode.includes('D') || mode === 'S') { ctx.strokeStyle = rgb(draw); ctx.lineWidth = lw * s; ctx.stroke(); }
      });
      return this;
    }

    // ---- Gambar (harus sudah dimuat lewat env.images)
    getImageProperties(data) {
      const im = images.get(data);
      if (!im) throw new Error('Gambar belum dimuat.');
      return { width: im.width, height: im.height, fileType: /^data:image\/jpe?g/i.test(data) ? 'JPEG' : 'PNG' };
    }
    addImage(data, _type, x, y, w, h) {
      const im = images.get(data);
      if (!im) throw new Error('Gambar belum dimuat.');
      this.op((ctx, s) => ctx.drawImage(im.img, x * s, y * s, w * s, h * s));
      return this;
    }

    // ---- Keluaran
    op(fn) { this.pages[this.cur].push(fn); }
    /** Gambar semua halaman (bersusun ke bawah) ke satu canvas selebar widthPx. */
    toCanvas(widthPx = JPG_WIDTH) {
      const s = widthPx / this.width;
      const pageH = Math.ceil(this.height * s);
      const canvas = createCanvas(Math.round(widthPx), pageH * this.pages.length);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      this.pages.forEach((ops, i) => {
        ctx.save();
        ctx.translate(0, i * pageH);
        ctx.beginPath(); ctx.rect(0, 0, canvas.width, pageH); ctx.clip();
        for (const fn of ops) fn(ctx, s);
        ctx.restore();
      });
      return canvas;
    }
  };
}

function rgb([r, g, b]) { return `rgb(${r},${g},${b})`; }

/** Nama file gambar, mis. "Nota-HB-2611001.jpg" */
export function notaImageFileName(order) {
  return `Nota-${String(order.invoice_number || 'baru').replace(/[^A-Za-z0-9-]/g, '')}.jpg`;
}

// ======================================================================
// Helper browser
// ======================================================================
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ img, width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Gambar tidak bisa dimuat.'));
    img.src = src;
  });
}

/** Hasilkan Blob JPG nota berkop. */
export async function notaJpgBlob(order, settings, { width = JPG_WIDTH, quality = 0.92 } = {}) {
  let logo = await kopLogo(settings);
  const images = new Map();
  if (logo) {
    try { images.set(logo, await loadImage(logo)); } catch { logo = null; }
  }
  const CanvasDoc = makeCanvasDoc({
    createCanvas: (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h }),
    images,
  });
  const doc = buildNotaPDF(CanvasDoc, order, settings, { logo, continuous: true });
  const canvas = doc.toCanvas(width);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('Gagal membuat gambar nota.');
  return blob;
}

/** Unduh nota JPG ke HP/komputer. */
export async function downloadNotaJPG(order, settings) {
  const blob = await notaJpgBlob(order, settings);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = notaImageFileName(order);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return blob;
}

/**
 * Bagikan nota JPG lewat menu berbagi HP (WhatsApp, dsb.).
 * @returns {'shared'|'cancelled'|'downloaded'}
 */
export async function shareNotaJPG(order, settings) {
  const blob = await notaJpgBlob(order, settings);
  const file = new File([blob], notaImageFileName(order), { type: 'image/jpeg' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `Nota ${order.invoice_number}` });
      return 'shared';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelled';
    }
  }
  await downloadNotaJPG(order, settings);
  return 'downloaded';
}
