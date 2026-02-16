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

export async function api<T = any>(
    path: string,
    options: RequestInit = {},
): Promise<T> {
    const token = getToken();
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    // Inject tenant context automatically
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

    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
    });

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
            errorMessage = error.message || errorMessage;
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

export const apiPost = <T = any>(path: string, body: any) =>
    api<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const apiPut = <T = any>(path: string, body: any) =>
    api<T>(path, { method: 'PUT', body: JSON.stringify(body) });

export const apiPatch = <T = any>(path: string, body: any) =>
    api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });

export const apiDelete = <T = any>(path: string, body?: any) =>
    api<T>(path, {
        method: 'DELETE',
        ...(body ? { body: JSON.stringify(body) } : {})
    });
