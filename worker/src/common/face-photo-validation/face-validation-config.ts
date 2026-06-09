let cachedEnabled: boolean | null = null;

export class FaceValidationConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FaceValidationConfigError';
  }
}

export function isFaceValidationEnabled(): boolean {
  if (cachedEnabled !== null) {
    return cachedEnabled;
  }

  const raw = process.env.FACE_VALIDATION_ENABLED?.trim();
  if (raw !== '0' && raw !== '1') {
    throw new FaceValidationConfigError(
      'FACE_VALIDATION_ENABLED inválido ou ausente; use 0 ou 1',
    );
  }

  cachedEnabled = raw === '1';
  return cachedEnabled;
}
