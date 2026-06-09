import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-cpu';
import * as blazeface from '@tensorflow-models/blazeface';
import sharp from 'sharp';

let modelPromise: Promise<blazeface.BlazeFaceModel> | null = null;
let backendReadyPromise: Promise<void> | null = null;

async function ensureBackendReady(): Promise<void> {
  if (!backendReadyPromise) {
    backendReadyPromise = (async () => {
      await tf.setBackend('cpu');
      await tf.ready();
    })();
  }
  await backendReadyPromise;
}

async function getBlazeFaceModel(): Promise<blazeface.BlazeFaceModel> {
  await ensureBackendReady();
  if (!modelPromise) {
    modelPromise = blazeface.load();
  }
  return modelPromise;
}

async function bufferToTensor3D(buffer: Buffer): Promise<tf.Tensor3D> {
  const { data, info } = await sharp(buffer)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels || 3;
  return tf.tensor3d(new Uint8Array(data), [info.height, info.width, channels]);
}

export async function detectFaceInBuffer(buffer: Buffer): Promise<boolean> {
  const model = await getBlazeFaceModel();
  const tensor = await bufferToTensor3D(buffer);

  try {
    const faces = await model.estimateFaces(tensor, false);
    return faces.length > 0;
  } finally {
    tensor.dispose();
  }
}
