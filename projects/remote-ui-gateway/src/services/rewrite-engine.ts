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
    // Replace Path=/ (exact, at end of string or followed by ; or space) with Path=/remote/s/{sessionId}/
    // Do NOT replace Path=/something (e.g., Path=/pt_BR)
    return setCookie.replace(
        /Path=\/(?=[;\s]|$)/gi,
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
    downstreamPath: string,
): string {
    // Determine if this is a full HTML document or just a fragment
    // Use word boundary checks to avoid matching <header> as <head>
    const isDocument = /<html[\s>]/i.test(html) || /<body[\s>]/i.test(html) || /<!DOCTYPE/i.test(html);

    // Calculate the directory of the current request to set the base tag
    // e.g. /pt_BR/html/index.html -> /remote/s/SESSAO/pt_BR/html/
    const pathParts = downstreamPath.split('/').filter(Boolean);
    if (!downstreamPath.endsWith('/')) {
        pathParts.pop(); // remove filename if current path doesn't end with slash
    }
    const currentDir = pathParts.length > 0 ? pathParts.join('/') + '/' : '';
    const baseHref = `${sessionPrefix}${currentDir}`;
    const baseTag = `<base href="${baseHref}">`;

    // Client-side interceptor to force session prefix on all navigations
    const interceptorScript = `
    <script>
        (function() {
            var prefix = "${sessionPrefix}";
            
            function enforcePrefix(url) {
                if (!url || typeof url !== 'string') return url;
                if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('#') || url.startsWith('javascript:')) return url;
                if (url.startsWith(prefix)) return url;
                // Guard: if the path already contains /remote/s/ somewhere, don't prefix it again
                if (url.indexOf('/remote/s/') !== -1) return url;
                
                // Handle absolute paths (/path) and relative paths (path or ./path)
                var cleanUrl = url.startsWith('/') ? url.slice(1) : url;
                if (cleanUrl.startsWith('./')) cleanUrl = cleanUrl.slice(2);
                
                return prefix + cleanUrl;
            }

            // Intercept History API
            var originalPushState = history.pushState;
            history.pushState = function(state, title, url) {
                return originalPushState.apply(this, [state, title, enforcePrefix(url)]);
            };
            var originalReplaceState = history.replaceState;
            history.replaceState = function(state, title, url) {
                return originalReplaceState.apply(this, [state, title, enforcePrefix(url)]);
            };

            // Intercept window.location assignments
            var originalAssign = window.location.assign;
            window.location.assign = function(url) {
                originalAssign.call(window.location, enforcePrefix(url));
            };
            var originalReplace = window.location.replace;
            window.location.replace = function(url) {
                originalReplace.call(window.location, enforcePrefix(url));
            };

            // Intercept fetch
            var originalFetch = window.fetch;
            window.fetch = function() {
                if (arguments[0] && typeof arguments[0] === 'string') {
                    arguments[0] = enforcePrefix(arguments[0]);
                }
                return originalFetch.apply(this, arguments);
            };

            // Intercept XMLHttpRequest
            var originalOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url) {
                var args = Array.prototype.slice.call(arguments);
                if (typeof url === 'string') {
                    args[1] = enforcePrefix(url);
                }
                return originalOpen.apply(this, args);
            };
            
            // Intercept dynamic element creation
            var originalCreateElement = document.createElement;
            document.createElement = function(tagName) {
                var el = originalCreateElement.call(document, tagName);
                var tag = tagName.toLowerCase();
                if (tag === 'script' || tag === 'img') {
                    var originalSet = Object.getOwnPropertyDescriptor(Element.prototype, tag === 'script' ? 'src' : 'src')?.set;
                    Object.defineProperty(el, 'src', {
                        set: function(val) { el.setAttribute('src', enforcePrefix(val)); },
                        get: function() { return el.getAttribute('src'); }
                    });
                }
                if (tag === 'link' || tag === 'a') {
                    Object.defineProperty(el, 'href', {
                        set: function(val) { el.setAttribute('href', enforcePrefix(val)); },
                        get: function() { return el.getAttribute('href'); }
                    });
                }
                return el;
            };
            
            // MutationObserver to try and catch any elements added to the DOM with bad paths
            var observer = new MutationObserver(function(mutations) {
                mutations.forEach(function(mutation) {
                    mutation.addedNodes.forEach(function(node) {
                        if (node.nodeType === 1) { // ELEMENT_NODE
                            var el = node;
                            if (el.hasAttribute('href')) el.setAttribute('href', enforcePrefix(el.getAttribute('href')));
                            if (el.hasAttribute('src')) el.setAttribute('src', enforcePrefix(el.getAttribute('src')));
                            if (el.hasAttribute('action')) el.setAttribute('action', enforcePrefix(el.getAttribute('action')));
                        }
                    });
                });
            });
            
            document.addEventListener("DOMContentLoaded", function() {
                if (document.body) observer.observe(document.body, { childList: true, subtree: true });
            });

            console.log("[RemoteUI] Client interceptors active for prefix:", prefix);
        })();
    </script>`;

    let processedHtml = html;

    if (isDocument) {
        // Try to inject after <head> tag
        if (/<head[^>]*>/i.test(processedHtml)) {
            processedHtml = processedHtml.replace(/<head[^>]*>/i, (match) => `${match}\n    ${baseTag}\n${interceptorScript}`);
        } else {
            // Fallback: prepend
            processedHtml = `${baseTag}\n${interceptorScript}\n${processedHtml}`;
        }

        // Inject toolbar after <body> tag
        if (toolbarHtml && /<body[^>]*>/i.test(processedHtml)) {
            processedHtml = processedHtml.replace(/<body[^>]*>/i, (match) => `${match}\n${toolbarHtml}`);
        }
    }

    // Rewrite root-relative paths in src, href, action
    processedHtml = processedHtml.replace(
        /(src|href|action)=(["'])\/([^/"'][^"']*)\2/gi,
        (match, attr, quote, path) => {
            // Skip paths that already have the session prefix
            if (path.startsWith('remote/s/')) return match;
            return `${attr}=${quote}${sessionPrefix}${path}${quote}`;
        }
    );

    // Also handle root-relative paths starting with ./
    processedHtml = processedHtml.replace(
        /(src|href|action)=(["'])\.\/([^"']*)\2/gi,
        (match, attr, quote, path) => {
            if (path.startsWith('remote/s/')) return match;
            return `${attr}=${quote}${sessionPrefix}${path}${quote}`;
        }
    );

    return processedHtml;
}
