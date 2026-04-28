const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

function getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('openturn_token');
}

export function setToken(token: string) {
    localStorage.setItem('openturn_token', token);
}

export function clearToken() {
    localStorage.removeItem('openturn_token');
}

export type ApiExtra = { timeoutMs?: number };

function attachTenantHeaders(headers: Record<string, string>): void {
    const scopeStr = typeof window !== 'undefined' ? localStorage.getItem('openturn_active_scope') : null;
    if (scopeStr) {
        try {
            const scope = JSON.parse(scopeStr);
            if (scope.instituicaoId) {
                headers['x-tenant-id'] = String(scope.instituicaoId);
            }
        } catch {
            // ignore parse errors
        }
    }
}

function attachAuthHeaders(headers: Record<string, string>): void {
    const token = getToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    attachTenantHeaders(headers);
}

function parseContentDispositionFilename(header: string | null): string | null {
    if (!header) return null;
    const utf8 = /filename\*=(?:UTF-8'')?([^;\s]+)/i.exec(header);
    if (utf8?.[1]) {
        try {
            const raw = utf8[1].replace(/^"(.*)"$/, '$1').trim();
            return decodeURIComponent(raw);
        } catch {
            return utf8[1];
        }
    }
    const ascii = /filename=(?:"([^"]+)"|([^;\s]+))/i.exec(header);
    if (ascii?.[1]) return ascii[1];
    if (ascii?.[2]) return ascii[2].replace(/^"(.*)"$/, '$1').trim();
    return null;
}

/** GET que retorna corpo binário (ex.: exportação). Não faz JSON.parse na resposta OK. */
export async function apiFetchBlob(
    path: string,
    extra?: ApiExtra,
): Promise<{ blob: Blob; suggestedFilename: string | null }> {
    const headers: Record<string, string> = {};
    attachAuthHeaders(headers);

    let abortController: AbortController | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (extra?.timeoutMs && extra.timeoutMs > 0) {
        abortController = new AbortController();
        timeoutId = setTimeout(() => abortController!.abort(), extra.timeoutMs);
    }

    let res: Response;
    try {
        res = await fetch(`${API_BASE}${path}`, {
            method: 'GET',
            headers,
            signal: abortController?.signal,
        });
    } catch (err) {
        if (timeoutId) clearTimeout(timeoutId);
        throw err;
    }
    if (timeoutId) clearTimeout(timeoutId);

    if (res.status === 401) {
        clearToken();
        if (typeof window !== 'undefined') {
            window.location.href = '/signin';
        }
        throw new Error('Unauthorized');
    }

    if (!res.ok) {
        let errorMessage = `API Error: ${res.status}`;
        try {
            const error = await res.json();
            const m = error.message;
            errorMessage = Array.isArray(m)
                ? m.join(', ')
                : (typeof m === 'string' ? m : errorMessage);
        } catch {
            const text = await res.text().catch(() => '');
            if (text) errorMessage = text;
        }
        throw new Error(errorMessage);
    }

    const blob = await res.blob();
    const suggestedFilename = parseContentDispositionFilename(
        res.headers.get('Content-Disposition'),
    );
    return { blob, suggestedFilename };
}

/** Dispara download no navegador para um Blob (ex.: resultado de apiFetchBlob). */
export function triggerBlobDownload(blob: Blob, fallbackFilename: string): void {
    const url = URL.createObjectURL(blob);
    try {
        const a = document.createElement('a');
        a.href = url;
        a.download = fallbackFilename;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } finally {
        URL.revokeObjectURL(url);
    }
}

export async function api<T = any>(
    path: string,
    options: RequestInit = {},
    extra?: ApiExtra,
): Promise<T> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
    };

    attachAuthHeaders(headers);

    let abortController: AbortController | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (extra?.timeoutMs && extra.timeoutMs > 0 && !options.signal) {
        abortController = new AbortController();
        timeoutId = setTimeout(() => abortController!.abort(), extra.timeoutMs);
    }

    let res: Response;
    try {
        res = await fetch(`${API_BASE}${path}`, {
            ...options,
            headers,
            signal: options.signal ?? abortController?.signal,
        });
    } catch (err) {
        if (timeoutId) clearTimeout(timeoutId);
        throw err;
    }
    if (timeoutId) clearTimeout(timeoutId);

    if (res.status === 401) {
        clearToken();
        if (typeof window !== 'undefined') {
            window.location.href = '/signin';
        }
        throw new Error('Unauthorized');
    }

    if (!res.ok) {
        let errorMessage = `API Error: ${res.status}`;
        try {
            const error = await res.json();
            const m = error.message;
            errorMessage = Array.isArray(m)
                ? m.join(', ')
                : (typeof m === 'string' ? m : errorMessage);
        } catch {
            // Se falhar ao ler JSON, tenta ler como texto
            const text = await res.text().catch(() => '');
            if (text) errorMessage = text;
        }
        throw new Error(errorMessage);
    }

    const text = await res.text();
    return text ? JSON.parse(text) : ({} as T);
}

export const apiGet = <T = any>(path: string) => api<T>(path);

export const apiPost = <T = any>(path: string, body: any, extra?: ApiExtra) =>
    api<T>(path, { method: 'POST', body: JSON.stringify(body) }, extra);

export const apiPut = <T = any>(path: string, body: any) =>
    api<T>(path, { method: 'PUT', body: JSON.stringify(body) });

export const apiPatch = <T = any>(path: string, body: any) =>
    api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });

export const apiDelete = <T = any>(path: string, body?: any) =>
    api<T>(path, {
        method: 'DELETE',
        ...(body ? { body: JSON.stringify(body) } : {})
    });
