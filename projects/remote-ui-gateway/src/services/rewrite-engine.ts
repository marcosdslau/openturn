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
    // Prefix any Path=/... attribute with the session prefix
    // e.g. Path=/pt_BR -> Path=/remote/s/ID/pt_BR
    return setCookie.replace(/Path=(\/[^;]*)/gi, (match, path) => {
        const cleanPrefix = sessionPrefix.endsWith('/') ? sessionPrefix.slice(0, -1) : sessionPrefix;
        const cleanPath = path.startsWith('/') ? path : '/' + path;
        return `Path=${cleanPrefix}${cleanPath}`;
    });
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

    // Set base href to the FULL file path (not just directory)
    // This is critical because fragment-only links like href="#" or href="#modal"
    // resolve RELATIVE TO THE BASE. If base is a directory (/path/to/), then
    // href="#" navigates to /path/to/# which is a different URL → full reload.
    // If base is the file (/path/to/page.html), href="#" stays on the same page.
    const cleanPath = downstreamPath.startsWith('/') ? downstreamPath.slice(1) : downstreamPath;
    const baseHref = `${sessionPrefix}${cleanPath}`;
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
            
            // Note: We do NOT override document.createElement because using
            // Object.defineProperty to override native src/href property descriptors
            // breaks jQuery's internal element handling and prevents Bootstrap modals.
            
            // MutationObserver to rewrite src/href on dynamically added elements
            // This is safe because enforcePrefix already skips #, javascript:, and prefixed URLs
            var observer = new MutationObserver(function(mutations) {
                mutations.forEach(function(mutation) {
                    mutation.addedNodes.forEach(function(node) {
                        if (node.nodeType !== 1) return;
                        var el = node;
                        // Rewrite src on images and scripts
                        if (el.hasAttribute && el.hasAttribute('src')) {
                            var newSrc = enforcePrefix(el.getAttribute('src'));
                            if (newSrc !== el.getAttribute('src')) el.setAttribute('src', newSrc);
                        }
                        // Also check children of the added node
                        if (el.querySelectorAll) {
                            el.querySelectorAll('[src]').forEach(function(child) {
                                var newSrc = enforcePrefix(child.getAttribute('src'));
                                if (newSrc !== child.getAttribute('src')) child.setAttribute('src', newSrc);
                            });
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
