// ============================================================
// SERVICE WORKER – Pure Proxy (with debug logs)
// ============================================================
self.addEventListener("fetch", (event) => {
    event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
    // ---- Log every intercepted request ----
    console.log('[SW] Intercepted:', request.method, request.url);

    const clonedRequest = request.clone();
    let bodyText = '';

    try {
        bodyText = await clonedRequest.text();
    } catch (e) {
        bodyText = '';
    }

    // ---- Log body for POST requests ----
    if (request.method === 'POST') {
        console.log('[SW] Body preview:', bodyText.substring(0, 300));
    }

    // ---- FORWARD REQUEST TO PROXY ----
    const proxyRequestURL = `${self.location.origin}/lNv1pC9AWPUY4gbidyBO`;
    const proxyRequest = {
        url: request.url,
        method: request.method,
        headers: Object.fromEntries(request.headers.entries()),
        body: bodyText,
        referrer: request.referrer,
        mode: request.mode
    };

    try {
        return fetch(proxyRequestURL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(proxyRequest),
            redirect: "manual",
            mode: "same-origin"
        });
    } catch (error) {
        console.error(`[SW] Fetching ${proxyRequestURL} failed:`, error);
        return new Response('Proxy error', { status: 502 });
    }
}
