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

async function tryNormalizeToJpeg(input: Buffer): Promise<Buffer | null> {
  try {
    const meta = await sharp(input, { failOn: 'error' }).rotate().metadata();
    if (!meta.width || !meta.height) return null;
    return await sharp(input, { failOn: 'error' })
      .rotate()
      .jpeg({ quality: 95, mozjpeg: true })
      .toBuffer();
  } catch {
    return null;
  }
}

async function ensureSupportedInput(input: Buffer): Promise<Buffer> {
  const magic = detectFormatByMagic(input);
  if (magic) {
    return input;
  }
  const normalized = await tryNormalizeToJpeg(input);
  if (!normalized) {
    throw new ControlIdFaceImageFormatError(
      'Formato inválido. Apenas imagens JPG/JPEG ou PNG são aceitas.',
    );
  }
  return normalized;
}

async function tryUpscaleToMinDimensions(
  input: Buffer,
  width: number,
  height: number,
  minDim: number,
): Promise<{ buffer: Buffer; width: number; height: number } | null> {
  try {
    const scale = Math.max(minDim / width, minDim / height);
    const newW = Math.max(minDim, Math.round(width * scale));
    const newH = Math.max(minDim, Math.round(height * scale));
    const buf = await sharp(input, { failOn: 'error' })
      .rotate()
      .resize(newW, newH, { fit: 'fill' })
      .jpeg({ quality: 95, mozjpeg: true })
      .toBuffer();
    return { buffer: buf, width: newW, height: newH };
  } catch {
    return null;
  }
}

function computeDimensionsWithinPixelLimit(
  width: number,
  height: number,
  minDim: number,
  maxPixels: number,
): { w: number; h: number } | null {
  const scaleDown = Math.sqrt(maxPixels / (width * height));
  let w = clampInt(width * scaleDown, 1, width);
  let h = clampInt(height * scaleDown, 1, height);
  while (w * h > maxPixels && w > 1 && h > 1) {
    w -= 1;
    h -= 1;
  }
  if (w < minDim || h < minDim) return null;
  return { w, h };
}

async function tryDownscaleToMaxPixels(
  input: Buffer,
  width: number,
  height: number,
  minDim: number,
  maxPixels: number,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  if (width * height <= maxPixels) {
    return { buffer: input, width, height };
  }
  const pixels = width * height;
  const dims = computeDimensionsWithinPixelLimit(width, height, minDim, maxPixels);
  if (!dims) {
    throw new ControlIdFaceImagePixelLimitError(
      `Limite máximo de pixels excedido (${pixels}). Não é possível redimensionar mantendo ${minDim}x${minDim}.`,
    );
  }
  try {
    const buf = await sharp(input, { failOn: 'error' })
      .rotate()
      .resize(dims.w, dims.h, { fit: 'fill' })
      .jpeg({ quality: 95, mozjpeg: true })
      .toBuffer();
    return { buffer: buf, width: dims.w, height: dims.h };
  } catch (e: any) {
    throw new ControlIdFaceImageProcessingError(
      `Falha ao redimensionar imagem: ${e?.message || 'erro desconhecido'}`,
    );
  }
}

export async function processControlIdFaceImage(input: Buffer): Promise<ControlIdFaceImageResult> {
  const minDim = 160;
  const maxPixels = 2073600;
  const maxBytes = parseMaxBytesFromEnv() ?? 1024 * 1024;

  // Step 1: ensure JPEG or PNG, converting other formats via Sharp when possible
  let buffer = await ensureSupportedInput(input);

  // Step 2: read metadata
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(buffer, { failOn: 'error' }).metadata();
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

  let width = metadata.width ?? null;
  let height = metadata.height ?? null;
  if (!width || !height) {
    throw new ControlIdFaceImageProcessingError('Não foi possível obter dimensões da imagem.');
  }

  // Step 3: upscale if below minimum dimensions
  if (width < minDim || height < minDim) {
    const upscaled = await tryUpscaleToMinDimensions(buffer, width, height, minDim);
    if (!upscaled) {
      throw new ControlIdFaceImageMinSizeError(
        `Dimensões mínimas não atendidas. Mínimo: ${minDim}x${minDim}. Recebido: ${width}x${height}.`,
      );
    }
    buffer = upscaled.buffer;
    width = upscaled.width;
    height = upscaled.height;
  }

  // Step 4: downscale if exceeds pixel limit
  const downscaled = await tryDownscaleToMaxPixels(buffer, width, height, minDim, maxPixels);
  buffer = downscaled.buffer;
  width = downscaled.width;
  height = downscaled.height;

  // Step 5: validate face on the final-dimensioned buffer
  const validation = await validatePersonPhoto(buffer);
  if (!validation.valid) {
    throw new ControlIdFaceImageNoFaceError(
      validation.reason ?? 'Nenhum rosto detectado na imagem.',
    );
  }

  // Step 6: compress to fit maxBytes
  const base = sharp(buffer, { failOn: 'error' }).rotate();

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

  let currentW = width;
  let currentH = height;

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
