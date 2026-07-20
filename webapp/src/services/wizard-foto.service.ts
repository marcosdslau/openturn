const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api";

async function wizardFetch<T>(
  path: string,
  options: RequestInit & { wizardToken?: string } = {},
): Promise<T> {
  const { wizardToken, ...rest } = options;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(rest.headers as Record<string, string>),
  };
  if (wizardToken) {
    headers["Authorization"] = `Bearer ${wizardToken}`;
  }

  const res = await fetch(`${API_BASE}/${path}`, { ...rest, headers });

  if (!res.ok) {
    let message = `Erro ${res.status}`;
    try {
      const body = await res.json();
      message = body?.message ?? message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

export async function verificarEmail(
  codigoInstituicao: number,
  email: string,
): Promise<{ encontrado: boolean; wizardToken?: string }> {
  return wizardFetch(
    `instituicao/${codigoInstituicao}/wizard-foto/verificar-email`,
    { method: "POST", body: JSON.stringify({ email }) },
  );
}

export async function enviarOtp(
  codigoInstituicao: number,
  wizardToken: string,
): Promise<{ enviado: boolean; proximoReenvioEm: number }> {
  return wizardFetch(
    `instituicao/${codigoInstituicao}/wizard-foto/enviar-otp`,
    { method: "POST", wizardToken },
  );
}

export async function verificarOtp(
  codigoInstituicao: number,
  wizardToken: string,
  codigo: string,
): Promise<{ valido: boolean; wizardToken?: string }> {
  return wizardFetch(
    `instituicao/${codigoInstituicao}/wizard-foto/verificar-otp`,
    { method: "POST", body: JSON.stringify({ codigo }), wizardToken },
  );
}

export async function salvarFoto(
  codigoInstituicao: number,
  wizardToken: string,
  fotoBase64: string,
): Promise<{ sucesso: boolean }> {
  return wizardFetch(
    `instituicao/${codigoInstituicao}/wizard-foto/salvar-foto`,
    { method: "POST", body: JSON.stringify({ fotoBase64 }), wizardToken },
  );
}
