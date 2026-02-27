/**
 * Rewrite engine for the Remote UI Gateway.
 * Handles Location headers, Set-Cookie Path, and HTML base tag injection.
 */

/**
 * Rewrite Location header to include the session prefix.
 */
export function rewriteLocationHeader(
    location: string,
    sessionPrefix: string,
): string {
    // Absolute URLs to external hosts are left untouched
    if (/^https?:\/\//i.test(location)) {
        return location;
    }

    // Already prefixed
    if (location.startsWith(sessionPrefix)) {
        return location;
    }

    // Ensure leading slash
    const path = location.startsWith('/') ? location : '/' + location;
    return sessionPrefix + path.slice(1);
}

/**
 * Rewrite Set-Cookie Path to scope cookies to the session.
 */
export function rewriteSetCookiePath(
    setCookie: string,
    sessionPrefix: string,
): string {
    // Replace Path=/ with Path=/remote/s/{sessionId}/
    // Be careful not to replace Path=/something (only exact Path=/)
    return setCookie.replace(
        /Path=\//gi,
        `Path=${sessionPrefix}`,
    );
}

/**
 * Inject <base href> into HTML <head> so relative resources resolve correctly.
 * Also injects a floating toolbar for navigation.
 */
export function rewriteHtml(
    html: string,
    sessionPrefix: string,
    toolbarHtml: string,
): string {
    const baseTag = `<base href="${sessionPrefix}">`;

    // Try to inject after <head> tag
    if (/<head[^>]*>/i.test(html)) {
        html = html.replace(/<head[^>]*>/i, (match) => `${match}\n    ${baseTag}`);
    } else {
        // Fallback: prepend
        html = `${baseTag}\n${html}`;
    }

    // Inject toolbar after <body> tag
    if (toolbarHtml && /<body[^>]*>/i.test(html)) {
        html = html.replace(/<body[^>]*>/i, (match) => `${match}\n${toolbarHtml}`);
    }

    return html;
}
