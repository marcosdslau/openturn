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
    let target = location;

    // If it's an absolute URL (from the device), extract just the path
    if (/^https?:\/\//i.test(target)) {
        try {
            const parsed = new URL(target);
            target = parsed.pathname + parsed.search + parsed.hash;
        } catch {
            return location; // Can't parse, leave untouched
        }
    }

    // Already prefixed
    if (target.startsWith(sessionPrefix)) {
        return target;
    }

    // Ensure leading slash
    const path = target.startsWith('/') ? target : '/' + target;
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
    <script data-openturn-proxy="true">
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

            // Safe assignment wrappers exposed globally for rewritten JS logic
            window.__assignLocation = function(url) {
                window.location.assign(enforcePrefix(url));
            };
            window.__replaceLocation = function(url) {
                window.location.replace(enforcePrefix(url));
            };
            
            // Note: We do NOT override document.createElement because using
            // Object.defineProperty to override native src/href property descriptors
            // breaks jQuery's internal element handling and prevents Bootstrap modals.
            
            // MutationObserver to rewrite src/href/action on dynamically added elements
            var observer = new MutationObserver(function(mutations) {
                var attrsToWatch = ['src', 'href', 'action'];
                mutations.forEach(function(mutation) {
                    mutation.addedNodes.forEach(function(node) {
                        if (node.nodeType !== 1) return;
                        var el = node;

                        attrsToWatch.forEach(function(attr) {
                            if (el.hasAttribute && el.hasAttribute(attr)) {
                                var newAttr = enforcePrefix(el.getAttribute(attr));
                                if (newAttr !== el.getAttribute(attr)) el.setAttribute(attr, newAttr);
                            }
                            if (el.querySelectorAll) {
                                el.querySelectorAll('[' + attr + ']').forEach(function(child) {
                                    var newChildAttr = enforcePrefix(child.getAttribute(attr));
                                    if (newChildAttr !== child.getAttribute(attr)) child.setAttribute(attr, newChildAttr);
                                });
                            }
                        });
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

    // Rewrite <meta http-equiv="refresh" content="0;url=/...">
    processedHtml = processedHtml.replace(
        /(<meta[^>]+http-equiv=["']?refresh["']?[^>]+content=["']\s*\d+\s*;\s*url=)(['"]?)\/([^"'>]+)\2/gi,
        (match, metaStart, quote, path) => {
            if (path.startsWith('remote/s/')) return match;
            return `${metaStart}${quote}${sessionPrefix}${path}${quote}`;
        }
    );

    // Rewrite <meta http-equiv="refresh" content="0;url=/...">
    processedHtml = processedHtml.replace(
        /(<meta[^>]+http-equiv=["']?refresh["']?[^>]+content=["']\s*\d+\s*;\s*url=)(['"]?)\/([^"'>]+)\2/gi,
        (match, metaStart, quote, path) => {
            if (path.startsWith('remote/s/')) return match;
            return `${metaStart}${quote}${sessionPrefix}${path}${quote}`;
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

    // Rewrite Javascript logic inside <script> blocks to catch explicit location.href assignments
    processedHtml = processedHtml.replace(
        /(<script[^>]*>)([\s\S]*?)(<\/script>)/gi,
        (match, openTag, content, closeTag) => {
            // Skip empty scripts or our own injected proxy script
            if (!content.trim() || openTag.includes('data-openturn-proxy')) return match;
            const rewrittenJs = rewriteJs(content, sessionPrefix);
            return `${openTag}${rewrittenJs}${closeTag}`;
        }
    );

    return processedHtml;
}

/**
 * Parse JSON and rewrite top-level paths for known redirect/url keys.
 */
export function rewriteJson(
    jsonString: string,
    sessionPrefix: string
): string {
    if (!jsonString || typeof jsonString !== 'string') return jsonString;

    try {
        const parsed = JSON.parse(jsonString);
        let modified = false;

        // Common keys that might contain a redirect path
        const keysToCheck = ['redirect', 'url', 'path', 'location'];

        const traverse = (obj: any) => {
            if (obj && typeof obj === 'object') {
                for (const key of Object.keys(obj)) {
                    if (keysToCheck.includes(key.toLowerCase()) && typeof obj[key] === 'string') {
                        const val = obj[key] as string;
                        // If it's an absolute path but not a full URI or already prefixed
                        if (val.startsWith('/') && !val.startsWith('//') && !val.startsWith(sessionPrefix)) {
                            obj[key] = sessionPrefix + val.substring(1);
                            modified = true;
                        } else if (val.startsWith('./')) {
                            obj[key] = sessionPrefix + val.substring(2);
                            modified = true;
                        }
                    } else if (typeof obj[key] === 'object') {
                        traverse(obj[key]);
                    }
                }
            }
        };

        traverse(parsed);

        if (modified) {
            return JSON.stringify(parsed);
        }
    } catch (e) {
        // Ignorar se não for JSON válido
    }

    return jsonString;
}

/**
 * Rewrite Javascript files and inline scripts.
 * Replaces string literals representing absolute paths with prefixed paths.
 * Replaces window.location assignments with our safe wrapper.
 */
export function rewriteJs(js: string, sessionPrefix: string): string {
    let processed = js;

    // We MUST NOT replace string literals `"/path"` directly.
    // If Katraca JS does `"/" + lang + url`, rewriting string literals yields `"/pt_BR/remote/s/.../url"`.
    // The interceptor `window.__assignLocation` handles dynamic inputs correctly natively.

    // Replace JS assignments ONLY when assigned to a string literal (safest approach)
    // Matches: location.href = "/..." or window.location = "/..."
    processed = processed.replace(
        /\b(?:window\.)?location(?:\.href)?\s*=\s*(["'][^"']+["'])/gi,
        (match, expr) => {
            return `(window.__assignLocation ? window.__assignLocation(${expr}) : window.location.assign(${expr}))`;
        }
    );

    // Replace JS method calls SAFELY by substituting the function reference,
    // avoiding the need to parse nested arguments and parenthesis which causes SyntaxErrors.
    // window.location.replace("...") becomes (window.__replaceLocation || window.location.replace)("...")
    processed = processed.replace(
        /\b(?:window\.)?location\.(replace|assign)\b/gi,
        (match, method) => {
            const isReplace = method.toLowerCase() === 'replace';
            const wrapper = isReplace ? '__replaceLocation' : '__assignLocation';
            return `(window.${wrapper} || window.location.${method})`;
        }
    );

    return processed;
}
