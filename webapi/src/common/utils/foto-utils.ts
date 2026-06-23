import sharp from 'sharp';
import { validatePersonPhoto } from '../face-photo-validation';

export type PrepararFotoOpcoes = {
  extensaoPadrao?: string;
  resolucaoMinima?: string;
  resolucaoMaxima?: string;
};

export type PrepararFotoImageError = {
  codigo: string;
  mensagem: string;
  detalhes?: Record<string, unknown>;
};

export type PrepararFotoResult = {
  foto: string | null;
  extencao: string | null;
  imageError: PrepararFotoImageError | null;
};

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function parseResolution(
  s: string,
  fallbackW: number,
  fallbackH: number,
): { w: number; h: number } {
  const parts = (s || '').split('x').map(Number);
  const w = Number.isFinite(parts[0]) && parts[0] > 0 ? parts[0] : fallbackW;
  const h = Number.isFinite(parts[1]) && parts[1] > 0 ? parts[1] : fallbackH;
  return { w, h };
}

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

function parseMaxBytesFromEnv(): number {
  const raw = (process.env.CONTROLID_FACE_MAX_MB || '').trim();
  if (!raw) return 1024 * 1024;
  const mb = Number(raw);
  if (!Number.isFinite(mb) || mb <= 0) return 1024 * 1024;
  return Math.floor(mb * 1024 * 1024);
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

async function ensureSupportedInput(input: Buffer): Promise<Buffer | null> {
  const magic = detectFormatByMagic(input);
  if (magic) return input;
  return tryNormalizeToJpeg(input);
}

async function tryUpscaleToMinDimensions(
  input: Buffer,
  width: number,
  height: number,
  minW: number,
  minH: number,
): Promise<{ buffer: Buffer; width: number; height: number } | null> {
  try {
    const scale = Math.max(minW / width, minH / height);
    const newW = Math.max(minW, Math.round(width * scale));
    const newH = Math.max(minH, Math.round(height * scale));
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
  minW: number,
  minH: number,
  maxPixels: number,
): { w: number; h: number } | null {
  const scaleDown = Math.sqrt(maxPixels / (width * height));
  let w = clampInt(width * scaleDown, 1, width);
  let h = clampInt(height * scaleDown, 1, height);
  while (w * h > maxPixels && w > 1 && h > 1) {
    w -= 1;
    h -= 1;
  }
  if (w < minW || h < minH) return null;
  return { w, h };
}

async function tryDownscaleToMaxPixels(
  input: Buffer,
  width: number,
  height: number,
  minW: number,
  minH: number,
  maxPixels: number,
): Promise<{ buffer: Buffer; width: number; height: number } | null> {
  if (width * height <= maxPixels) return { buffer: input, width, height };
  const dims = computeDimensionsWithinPixelLimit(width, height, minW, minH, maxPixels);
  if (!dims) return null;
  try {
    const buf = await sharp(input, { failOn: 'error' })
      .rotate()
      .resize(dims.w, dims.h, { fit: 'fill' })
      .jpeg({ quality: 95, mozjpeg: true })
      .toBuffer();
    return { buffer: buf, width: dims.w, height: dims.h };
  } catch {
    return null;
  }
}

async function comprimirParaMaxBytes(
  input: Buffer,
  width: number,
  height: number,
  minW: number,
  minH: number,
  maxPixels: number,
  maxBytes: number,
): Promise<Buffer | null> {
  const base = sharp(input, { failOn: 'error' }).rotate();

  const render = async (w: number, h: number, quality?: number): Promise<Buffer> => {
    let img = base.clone();
    if (w !== width || h !== height) {
      img = img.resize(w, h, { fit: 'inside', withoutEnlargement: true });
    }
    const q = clampInt(quality ?? 85, 40, 95);
    return img.jpeg({ quality: q, mozjpeg: true }).toBuffer();
  };

  try {
    let buf = await render(width, height);
    if (buf.length <= maxBytes) return buf;

    for (const q of [80, 70, 60, 50, 45, 40]) {
      buf = await render(width, height, q);
      if (buf.length <= maxBytes) return buf;
    }

    let currentW = width;
    let currentH = height;
    for (let i = 0; i < 8; i++) {
      const nextW = clampInt(currentW * 0.9, 1, currentW);
      const nextH = clampInt(currentH * 0.9, 1, currentH);
      if (nextW < minW || nextH < minH) break;
      if (nextW * nextH > maxPixels) break;
      currentW = nextW;
      currentH = nextH;
      buf = await render(currentW, currentH, 60);
      if (buf.length <= maxBytes) return buf;
    }

    return null;
  } catch {
    return null;
  }
}

export async function prepararFoto(
  response: { data: ArrayBuffer | Buffer; headers?: Record<string, string> },
  opcoes?: PrepararFotoOpcoes,
): Promise<PrepararFotoResult> {
  const extensaoPadrao = opcoes?.extensaoPadrao ?? null;
  const minRes = parseResolution(opcoes?.resolucaoMinima ?? '160x160', 160, 160);
  const maxRes = parseResolution(opcoes?.resolucaoMaxima ?? '1920x1080', 1920, 1080);
  const maxPixels = maxRes.w * maxRes.h;
  const maxBytes = parseMaxBytesFromEnv();

  const falha = (err: PrepararFotoImageError): PrepararFotoResult =>
    ({ foto: null, extencao: extensaoPadrao, imageError: err });

  const semRosto = (err: PrepararFotoImageError): PrepararFotoResult =>
    ({ foto: null, extencao: null, imageError: err });

  // Step 1: converter para formato suportado (JPEG/PNG), se necessário
  const rawBuffer = Buffer.from(response.data as ArrayBuffer);
  let buffer = await ensureSupportedInput(rawBuffer);
  if (!buffer) {
    return falha({
      codigo: 'FORMAT_INVALIDO',
      mensagem: 'Formato de imagem não suportado e não foi possível converter.',
      detalhes: { bufferSize: rawBuffer.length },
    });
  }

  // Step 2: ler metadados
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(buffer, { failOn: 'error' }).metadata();
  } catch {
    return falha({
      codigo: 'PROCESSAMENTO_FALHOU',
      mensagem: 'Falha ao ler metadados da imagem.',
      detalhes: { bufferSize: buffer.length },
    });
  }

  const fmt = metadata.format || '';
  if (fmt !== 'jpeg' && fmt !== 'png') {
    return falha({
      codigo: 'FORMAT_INVALIDO',
      mensagem: `Formato detectado (${fmt || 'desconhecido'}) não é JPEG ou PNG.`,
      detalhes: { formatDetectado: fmt || null },
    });
  }

  let width = metadata.width;
  let height = metadata.height;
  if (!width || !height) {
    return falha({
      codigo: 'PROCESSAMENTO_FALHOU',
      mensagem: 'Não foi possível obter dimensões da imagem.',
    });
  }

  // Step 3: upscale se abaixo da resolução mínima
  if (width < minRes.w || height < minRes.h) {
    const up = await tryUpscaleToMinDimensions(buffer, width, height, minRes.w, minRes.h);
    if (!up) {
      return falha({
        codigo: 'DIMENSOES_MINIMAS',
        mensagem: `Dimensões insuficientes e não foi possível fazer upscale. Recebido: ${width}x${height}, mínimo: ${minRes.w}x${minRes.h}.`,
        detalhes: { largura: width, altura: height, minimoLargura: minRes.w, minimoAltura: minRes.h },
      });
    }
    buffer = up.buffer;
    width = up.width;
    height = up.height;
  }

  // Step 4: downscale se acima do limite de pixels
  const down = await tryDownscaleToMaxPixels(buffer, width, height, minRes.w, minRes.h, maxPixels);
  if (!down) {
    return falha({
      codigo: 'LIMITE_PIXELS',
      mensagem: `Resolução acima do limite (${width}x${height}) e não foi possível redimensionar mantendo mínimo de ${minRes.w}x${minRes.h}.`,
      detalhes: { largura: width, altura: height, maxPixels },
    });
  }
  buffer = down.buffer;
  width = down.width;
  height = down.height;

  // Step 5: validar presença de rosto
  const validation = await validatePersonPhoto(buffer);
  if (!validation.valid) {
    return semRosto({
      codigo: 'ROSTO_NAO_DETECTADO',
      mensagem: validation.reason ?? 'Nenhum rosto detectado na imagem.',
      detalhes: { motivo: validation.reason ?? null, etapa: validation.stage ?? null },
    });
  }

  // Step 6: comprimir até caber em maxBytes
  const compressed = await comprimirParaMaxBytes(
    buffer,
    width,
    height,
    minRes.w,
    minRes.h,
    maxPixels,
    maxBytes,
  );
  if (!compressed) {
    return falha({
      codigo: 'LIMITE_TAMANHO_MB',
      mensagem: 'Imagem excede o limite de tamanho após processamento.',
      detalhes: { largura: width, altura: height },
    });
  }

  return { foto: compressed.toString('base64'), extencao: 'jpg', imageError: null };
}

export function createRotinaUtils() {
  return { prepararFoto };
}
