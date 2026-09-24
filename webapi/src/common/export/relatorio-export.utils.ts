import type * as ExcelJS from 'exceljs';
import sharp from 'sharp';

/** Utilitários compartilhados pelos relatórios exportados (CSV / XLSX / PDF). */

export const REPORT_COLORS = {
  brand: '#465FFF',
  text: '#1D2939',
  muted: '#667085',
  border: '#E4E7EC',
  zebra: '#F9FAFB',
  headBg: '#F2F4F7',
  green: '#027A48',
  red: '#B42318',
  amber: '#B54708',
} as const;

export type ReportExportFormat = 'csv' | 'xlsx' | 'pdf';

export const REPORT_CONTENT_TYPES: Record<ReportExportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

/** Fotos já redimensionadas (JPEG), indexadas por `PESCodigo`. */
export type FotoMap = Map<number, Buffer>;

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Desloca a data para o fuso da instituição (`INSFusoHorario`, em horas) e lê via getUTC*. */
function shift(d: Date, fusoHorario: number): Date {
  return new Date(d.getTime() + fusoHorario * 3_600_000);
}

/** dd/MM/yyyy HH:mm:ss no fuso da instituição, independente do fuso do servidor. */
export function formatDataHora(d: Date, fusoHorario: number): string {
  const s = shift(d, fusoHorario);
  return (
    `${pad2(s.getUTCDate())}/${pad2(s.getUTCMonth() + 1)}/${s.getUTCFullYear()} ` +
    `${pad2(s.getUTCHours())}:${pad2(s.getUTCMinutes())}:${pad2(s.getUTCSeconds())}`
  );
}

/** HH:mm no fuso da instituição. */
export function formatHora(d: Date, fusoHorario: number): string {
  const s = shift(d, fusoHorario);
  return `${pad2(s.getUTCHours())}:${pad2(s.getUTCMinutes())}`;
}

/** dd/MM/yyyy de uma coluna `@db.Date` (meia-noite UTC, sem fuso). */
export function formatDataUtc(d: Date): string {
  return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

/** yyyy-MM-dd (query string) → dd/MM/yyyy. */
export function formatIsoDateOnly(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v;
}

function escapeCsvCell(value: string | number | null | undefined): string {
  const s = String(value ?? '');
  if (/[;"\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** CSV separado por `;` com BOM (abre acentuado no Excel pt-BR). */
export function buildCsv(lines: (string | number)[][]): Buffer {
  const body = lines.map((line) => line.map(escapeCsvCell).join(';'));
  return Buffer.from(`\ufeff${body.join('\r\n')}`, 'utf8');
}

export function styleXlsxHeaderRow(row: ExcelJS.Row): void {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.eachCell((c) => {
    c.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF465FFF' },
    };
  });
}

/** Duas linhas em branco + notas em itálico ao fim da planilha. */
export function appendXlsxNotas(ws: ExcelJS.Worksheet, notas: string[]): void {
  ws.addRow([]);
  ws.addRow([]);
  for (const linha of notas) {
    const row = ws.addRow([linha]);
    row.font = { italic: true, color: { argb: 'FF667085' } };
  }
}

/** Corta o texto com reticências para caber em `width` na fonte atual. */
export function fitText(
  doc: PDFKit.PDFDocument,
  text: string,
  width: number,
): string {
  if (doc.widthOfString(text) <= width) return text;
  let s = text;
  while (s.length > 0 && doc.widthOfString(`${s}…`) > width) {
    s = s.slice(0, -1);
  }
  return `${s.trimEnd()}…`;
}

/**
 * Marca SchoolGuard (vetorial, cor da identidade do sistema) + subtítulo.
 * Não há logo em arquivo no projeto; a marca segue o "SG" da sidebar.
 */
export function drawSchoolGuardBrand(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  subtitulo: string,
  size = 34,
): void {
  doc.save();
  doc.roundedRect(x, y, size, size, size * 0.24).fill(REPORT_COLORS.brand);
  doc
    .fillColor('#FFFFFF')
    .font('Helvetica-Bold')
    .fontSize(size * 0.38)
    .text('SG', x, y + size * 0.32, {
      width: size,
      align: 'center',
      lineBreak: false,
    });
  doc.restore();

  const tx = x + size + 10;
  doc
    .fillColor(REPORT_COLORS.text)
    .font('Helvetica-Bold')
    .fontSize(size * 0.47)
    .text('SchoolGuard', tx, y + size * 0.06, { lineBreak: false });
  doc
    .fillColor(REPORT_COLORS.muted)
    .font('Helvetica')
    .fontSize(9)
    .text(subtitulo, tx, y + size * 0.62, { lineBreak: false });
}

/** Instituição + "Gerado em" alinhados à direita. */
export function drawInstituicaoGeradoEm(
  doc: PDFKit.PDFDocument,
  right: number,
  y: number,
  instituicaoNome: string,
  geradoEm: string,
  width = 260,
): void {
  doc.fillColor(REPORT_COLORS.text).font('Helvetica-Bold').fontSize(10);
  doc.text(fitText(doc, instituicaoNome, width), right - width, y + 4, {
    width,
    align: 'right',
    lineBreak: false,
  });
  doc
    .fillColor(REPORT_COLORS.muted)
    .font('Helvetica')
    .fontSize(8)
    .text(`Gerado em ${geradoEm}`, right - width, y + 20, {
      width,
      align: 'right',
      lineBreak: false,
    });
}

/**
 * Rodapé com "Página X de Y" em todas as páginas.
 * Exige `bufferPages: true`; chamar depois de todo o conteúdo e antes de `doc.end()`.
 */
export function drawPageFooters(
  doc: PDFKit.PDFDocument,
  opts: { margin: number; footerH: number; texto: string },
): void {
  const range = doc.bufferedPageRange();
  const total = range.count;
  for (let i = range.start; i < range.start + total; i++) {
    doc.switchToPage(i);
    const left = opts.margin;
    const right = doc.page.width - opts.margin;
    const width = right - left;
    // Evita que o texto abaixo da margem inferior gere página nova.
    const originalBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const fy = doc.page.height - opts.margin - opts.footerH + 10;
    doc
      .moveTo(left, fy)
      .lineTo(right, fy)
      .lineWidth(0.5)
      .strokeColor(REPORT_COLORS.border)
      .stroke();
    doc.fillColor(REPORT_COLORS.muted).font('Helvetica').fontSize(7.5);
    doc.text(fitText(doc, opts.texto, width - 90), left, fy + 8, {
      width: width - 90,
      lineBreak: false,
    });
    doc
      .fillColor(REPORT_COLORS.text)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(`Página ${i - range.start + 1} de ${total}`, right - 90, fy + 8, {
        width: 90,
        align: 'right',
        lineBreak: false,
      });
    doc.page.margins.bottom = originalBottom;
  }
}

/** Avatar circular com a foto; sem foto (ou foto inválida), círculo com a inicial. */
export function drawAvatar(
  doc: PDFKit.PDFDocument,
  cx: number,
  cy: number,
  diameter: number,
  foto: Buffer | undefined,
  nome: string | null | undefined,
): void {
  const r = diameter / 2;
  if (foto) {
    try {
      doc.save();
      doc.circle(cx, cy, r).clip();
      doc.image(foto, cx - r, cy - r, { width: diameter, height: diameter });
      doc.restore();
      doc
        .circle(cx, cy, r)
        .lineWidth(0.5)
        .strokeColor(REPORT_COLORS.border)
        .stroke();
      return;
    } catch {
      doc.restore();
    }
  }
  doc.circle(cx, cy, r).fill(REPORT_COLORS.border);
  const inicial = (nome ?? '?').trim().charAt(0).toUpperCase() || '?';
  doc
    .fillColor('#475467')
    .font('Helvetica-Bold')
    .fontSize(diameter * 0.4)
    .text(inicial, cx - r, cy - diameter * 0.18, {
      width: diameter,
      align: 'center',
      lineBreak: false,
    });
}

/**
 * Carrega e reduz as fotos das pessoas (uma vez por pessoa, em lotes), convertendo
 * para JPEG — formato aceito pelo PDFKit (webp/gif não são).
 */
export async function loadFotosJpeg(
  pessoaIds: number[],
  px: number,
  fetchLote: (
    ids: number[],
  ) => Promise<{ PESCodigo: number; PESFotoBase64: string | null }[]>,
  loteSize = 200,
): Promise<FotoMap> {
  const ids = [...new Set(pessoaIds)];
  const fotos: FotoMap = new Map();
  for (let i = 0; i < ids.length; i += loteSize) {
    const lote = await fetchLote(ids.slice(i, i + loteSize));
    await Promise.all(
      lote.map(async (p) => {
        if (!p.PESFotoBase64) return;
        try {
          const jpeg = await sharp(Buffer.from(p.PESFotoBase64, 'base64'))
            .resize(px, px, { fit: 'cover', position: 'center' })
            .jpeg({ quality: 80 })
            .toBuffer();
          fotos.set(p.PESCodigo, jpeg);
        } catch {
          // Foto inválida: o PDF usa a inicial do nome.
        }
      }),
    );
  }
  return fotos;
}
