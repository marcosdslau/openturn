import { analyzeColorHeuristics } from './color-heuristics';
import { detectFaceInBuffer } from './face-detector';
import { isFaceValidationEnabled } from './face-validation-config';

export type ValidatePersonPhotoResult = {
  valid: boolean;
  reason?: string;
  stage?: 'heuristic' | 'face';
  skipped?: boolean;
};

export async function validatePersonPhoto(
  buffer: Buffer,
): Promise<ValidatePersonPhotoResult> {
  const enabled = isFaceValidationEnabled();
  if (!enabled) {
    return { valid: true, skipped: true };
  }

  const heuristic = await analyzeColorHeuristics(buffer);
  if (heuristic.looksLikeAvatar) {
    return {
      valid: false,
      reason:
        heuristic.reason ??
        'Imagem rejeitada pela heurística de avatar.',
      stage: 'heuristic',
    };
  }

  const hasFace = await detectFaceInBuffer(buffer);
  if (!hasFace) {
    return {
      valid: false,
      reason: 'Nenhum rosto detectado na imagem.',
      stage: 'face',
    };
  }

  return { valid: true };
}
