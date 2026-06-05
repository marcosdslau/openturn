import sharp from 'sharp';
import {
  processControlIdFaceImage,
  ControlIdFaceImageFormatError,
  ControlIdFaceImageMinSizeError,
  ControlIdFaceImagePixelLimitError,
} from './controlid-face-image';

type Case = { name: string; run: () => Promise<void> };

async function makeImage(format: 'jpeg' | 'png' | 'bmp', width: number, height: number): Promise<Buffer> {
  const base = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 120, g: 120, b: 120 },
    },
  });

  if (format === 'jpeg') return await base.jpeg({ quality: 90 }).toBuffer();
  if (format === 'png') return await base.png({ compressionLevel: 6 }).toBuffer();
  return await base.bmp().toBuffer();
}

async function shouldPass(buf: Buffer) {
  const out = await processControlIdFaceImage(buf);
  if (out.width < 160 || out.height < 160) {
    throw new Error(`Saída abaixo do mínimo: ${out.width}x${out.height}`);
  }
  if (out.width * out.height > 2073600) {
    throw new Error(`Saída acima do limite de pixels: ${out.width}x${out.height}`);
  }
  if (out.format !== 'jpeg' && out.format !== 'png') {
    throw new Error(`Formato inválido na saída: ${out.format}`);
  }
}

async function shouldThrow<T extends Error>(
  buf: Buffer,
  ctor: new (...args: any[]) => T,
) {
  let ok = false;
  try {
    await processControlIdFaceImage(buf);
  } catch (e: any) {
    if (e instanceof ctor) ok = true;
    else throw e;
  }
  if (!ok) throw new Error(`Esperava erro ${ctor.name}`);
}

const cases: Case[] = [
  {
    name: 'válida 300x300 jpeg',
    run: async () => shouldPass(await makeImage('jpeg', 300, 300)),
  },
  {
    name: 'válida 600x600 png',
    run: async () => shouldPass(await makeImage('png', 600, 600)),
  },
  {
    name: 'válida 2000x1000 jpeg (<= 2.073.600 px)',
    run: async () => shouldPass(await makeImage('jpeg', 2000, 1000)),
  },
  {
    name: 'resize 2500x1500 jpeg (> limite px)',
    run: async () => shouldPass(await makeImage('jpeg', 2500, 1500)),
  },
  {
    name: 'resize 4000x3000 png (> limite px)',
    run: async () => shouldPass(await makeImage('png', 4000, 3000)),
  },
  {
    name: 'inválida 100x100 png (mínimo)',
    run: async () =>
      shouldThrow(await makeImage('png', 100, 100), ControlIdFaceImageMinSizeError),
  },
  {
    name: 'inválida bmp (formato)',
    run: async () =>
      shouldThrow(await makeImage('bmp', 300, 300), ControlIdFaceImageFormatError),
  },
  {
    name: 'inválida pixel-limit sem resize possível (muito estreita)',
    run: async () => {
      const buf = await makeImage('jpeg', 20000, 160);
      await shouldThrow(buf, ControlIdFaceImagePixelLimitError);
    },
  },
];

async function main() {
  const failures: { name: string; error: string }[] = [];
  for (const c of cases) {
    try {
      await c.run();
      process.stdout.write(`OK: ${c.name}\n`);
    } catch (e: any) {
      failures.push({ name: c.name, error: e?.message || String(e) });
      process.stdout.write(`FAIL: ${c.name} -> ${e?.message || e}\n`);
    }
  }
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

void main();

