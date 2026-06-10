import sharp from 'sharp';
import { validatePersonPhoto } from '../../../../common/face-photo-validation';

export class ControlIdFaceImageError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

export class ControlIdFaceImageFormatError extends ControlIdFaceImageError {
  constructor(message: string) {
    super('FORMAT_INVALIDO', message);
  }
}

export class ControlIdFaceImageMinSizeError extends ControlIdFaceImageError {
  constructor(message: string) {
    super('DIMENSOES_MINIMAS', message);
  }
}

export class ControlIdFaceImagePixelLimitError extends ControlIdFaceImageError {
  constructor(message: string) {
    super('LIMITE_PIXELS', message);
  }
}

export class ControlIdFaceImageSizeLimitError extends ControlIdFaceImageError {
  constructor(message: string) {
    super('LIMITE_TAMANHO_MB', message);
  }
}

export class ControlIdFaceImageProcessingError extends ControlIdFaceImageError {
  constructor(message: string) {
    super('PROCESSAMENTO_FALHOU', message);
  }
}

export class ControlIdFaceImageNoFaceError extends ControlIdFaceImageError {
  constructor(message: string) {
    super('ROSTO_NAO_DETECTADO', message);
  }
}

export type ControlIdFaceImageResult = {
  buffer: Buffer;
  format: 'jpeg';
  width: number;
  height: number;
  bytes: number;
};

function detectFormatByMagic(input: Buffer): 'jpeg' | 'png' | null {
  if (input.length >= 8) {
    const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (input.subarray(0, 8).equals(pngMagic)) return 'png';
  }
  if (input.length >= 3) {
    if (input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff) return 'jpeg';
  }
  return null;
}

function parseMaxBytesFromEnv(): number | null {
  const raw = (process.env.CONTROLID_FACE_MAX_MB || '').trim();
  if (!raw) return null;
  const mb = Number(raw);
  if (!Number.isFinite(mb) || mb <= 0) return null;
  return Math.floor(mb * 1024 * 1024);
}

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export async function processControlIdFaceImage(input: Buffer): Promise<ControlIdFaceImageResult> {
  const minDim = 160;
  const maxPixels = 2073600;
  const maxBytes = parseMaxBytesFromEnv() ?? 1024 * 1024;

  const magic = detectFormatByMagic(input);
  if (!magic) {
    throw new ControlIdFaceImageFormatError(
      'Formato inválido. Apenas imagens JPG/JPEG ou PNG são aceitas.',
    );
  }

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(input, { failOn: 'error' }).metadata();
  } catch (e: any) {
    throw new ControlIdFaceImageProcessingError(
      `Falha ao ler metadados da imagem: ${e?.message || 'erro desconhecido'}`,
    );
  }

  const format = (metadata.format || '') as string;
  if (format !== 'jpeg' && format !== 'png') {
    throw new ControlIdFaceImageFormatError(
      `Formato inválido (${format || 'desconhecido'}). Apenas JPG/JPEG ou PNG são aceitas.`,
    );
  }

  const width = metadata.width ?? null;
  const height = metadata.height ?? null;
  if (!width || !height) {
    throw new ControlIdFaceImageProcessingError('Não foi possível obter dimensões da imagem.');
  }

  if (width < minDim || height < minDim) {
    throw new ControlIdFaceImageMinSizeError(
      `Dimensões mínimas não atendidas. Mínimo: ${minDim}x${minDim}. Recebido: ${width}x${height}.`,
    );
  }

  const validation = await validatePersonPhoto(input);
  if (!validation.valid) {
    throw new ControlIdFaceImageNoFaceError(
      validation.reason ?? 'Nenhum rosto detectado na imagem.',
    );
  }

  const pixels = width * height;
  const needsPixelResize = pixels > maxPixels;
  let targetWidth = width;
  let targetHeight = height;

  if (needsPixelResize) {
    const scale = Math.sqrt(maxPixels / pixels);
    targetWidth = clampInt(width * scale, 1, width);
    targetHeight = clampInt(height * scale, 1, height);
    while (targetWidth * targetHeight > maxPixels && targetWidth > 1 && targetHeight > 1) {
      targetWidth -= 1;
      targetHeight -= 1;
    }
    if (targetWidth < minDim || targetHeight < minDim) {
      throw new ControlIdFaceImagePixelLimitError(
        `Limite máximo de pixels excedido (${pixels}). Não é possível redimensionar mantendo ${minDim}x${minDim} (alvo: ${targetWidth}x${targetHeight}).`,
      );
    }
  }

  const base = sharp(input, { failOn: 'error' }).rotate();

  const render = async (opts: {
    w: number;
    h: number;
    jpegQuality?: number;
  }): Promise<{ buf: Buffer; w: number; h: number }> => {
    let img = base.clone();
    if (opts.w !== width || opts.h !== height) {
      img = img.resize(opts.w, opts.h, { fit: 'inside', withoutEnlargement: true });
    }
    const q = clampInt(opts.jpegQuality ?? 85, 40, 95);
    const buf = await img.jpeg({ quality: q, mozjpeg: true }).toBuffer();
    return { buf, w: opts.w, h: opts.h };
  };

  let currentW = targetWidth;
  let currentH = targetHeight;

  try {
    let out = await render({ w: currentW, h: currentH });
    if (out.buf.length <= maxBytes) {
      return { buffer: out.buf, format: 'jpeg', width: currentW, height: currentH, bytes: out.buf.length };
    }

    for (const q of [80, 70, 60, 50, 45, 40]) {
      out = await render({ w: currentW, h: currentH, jpegQuality: q });
      if (out.buf.length <= maxBytes) {
        return { buffer: out.buf, format: 'jpeg', width: currentW, height: currentH, bytes: out.buf.length };
      }
    }

    for (let i = 0; i < 8; i++) {
      const nextW = clampInt(currentW * 0.9, 1, currentW);
      const nextH = clampInt(currentH * 0.9, 1, currentH);
      if (nextW < minDim || nextH < minDim) break;
      if (nextW * nextH > maxPixels) break;
      currentW = nextW;
      currentH = nextH;
      out = await render({ w: currentW, h: currentH, jpegQuality: 60 });
      if (out.buf.length <= maxBytes) {
        return { buffer: out.buf, format: 'jpeg', width: currentW, height: currentH, bytes: out.buf.length };
      }
    }

    throw new ControlIdFaceImageSizeLimitError(
      `Imagem excede o limite de tamanho (${(maxBytes / (1024 * 1024)).toFixed(2)} MB) após processamento.`,
    );
  } catch (e: any) {
    if (e instanceof ControlIdFaceImageError) throw e;
    throw new ControlIdFaceImageProcessingError(
      `Falha ao processar imagem: ${e?.message || 'erro desconhecido'}`,
    );
  }
}
