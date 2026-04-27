/** Substitui `BadRequestException` do Nest em rotinas do worker. */
export function badRequest(message: string | object): Error {
  if (typeof message === 'string') return new Error(message);
  try {
    return new Error(JSON.stringify(message));
  } catch {
    return new Error(String(message));
  }
}
