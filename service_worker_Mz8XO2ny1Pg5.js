// ============================================================
// SERVICE WORKER – Pure Proxy (silent)
// ============================================================
self.addEventListener("fetch", (event) => {
    event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
    const clonedRequest = request.clone();
    let bodyText = '';

    try {
        bodyText = await clonedRequest.text();
    } catch (e) {
        bodyText = '';
    }

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
        return new Response('Proxy error', { status: 502 });
    }
}
