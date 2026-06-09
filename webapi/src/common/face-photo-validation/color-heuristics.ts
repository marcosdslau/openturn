import sharp from 'sharp';

export type ColorHeuristicResult = {
  looksLikeAvatar: boolean;
  reason?: string;
};

export async function analyzeColorHeuristics(
  buffer: Buffer,
): Promise<ColorHeuristicResult> {
  const { data, info } = await sharp(buffer)
    .resize(64, 64, { fit: 'cover' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const buckets = new Map<string, number>();
  const channels = info.channels || 3;
  const totalPixels = info.width * info.height;

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i] >> 3;
    const g = data[i + 1] >> 3;
    const b = data[i + 2] >> 3;
    const key = `${r},${g},${b}`;
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }

  let maxCount = 0;
  for (const count of buckets.values()) {
    if (count > maxCount) {
      maxCount = count;
    }
  }

  const dominantRatio = maxCount / totalPixels;
  const uniqueColors = buckets.size;
  const isSquare = info.width === info.height;
  const lowPalette = uniqueColors < 80;
  const highDominance = dominantRatio > 0.35;

  if (isSquare && lowPalette && highDominance) {
    return {
      looksLikeAvatar: true,
      reason:
        'Imagem com padrão de avatar (fundo uniforme e paleta reduzida).',
    };
  }

  return { looksLikeAvatar: false };
}
