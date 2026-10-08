"""Read-only editor research. External content is data, never agent instructions."""
import asyncio
import http.client
import ipaddress
import socket
import ssl
import time
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit
from urllib.robotparser import RobotFileParser

import httpx
from app.config import settings

USER_AGENT = "SkyClipEditor/1.0"
MAX_PAGE_BYTES = 2 * 1024 * 1024
MAX_PAGE_TEXT = 6000


class ResearchPageError(ValueError):
    pass


def _public_host(url: str) -> str:
    """Validate URL syntax; DNS is separately checked immediately before connect."""
    try:
        parsed = urlsplit(url)
        host = (parsed.hostname or "").lower().rstrip(".").encode("idna").decode()
        if (len(url) > 4096 or parsed.scheme != "https" or parsed.port not in (None, 443)
                or parsed.username is not None or parsed.password is not None
                or any(ord(c) <= 32 for c in url) or "\\" in url
                or not host or host == "localhost"
                or host.endswith((".localhost", ".local", ".internal", ".test", ".invalid"))):
            raise ValueError()
        try:
            address = ipaddress.ip_address(host)
        except ValueError:
            address = None
        if address is not None and not _is_public_address(address):
            raise ValueError()
        return host
    except (ValueError, UnicodeError):
        raise ResearchPageError("Only public HTTPS pages on the standard port can be read") from None


def _is_public_address(address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return address.is_global and not (address.is_reserved or address.is_multicast or address.is_loopback)


class _PinnedHTTPS(http.client.HTTPSConnection):
    """Pin validated DNS, retaining original host for TLS and certificate checks."""
    def __init__(self, host: str, address: str):
        super().__init__(host, timeout=8, context=ssl.create_default_context())
        self.address = address

    def connect(self):
        raw = socket.create_connection((self.address, 443), self.timeout)
        try:
            self.sock = self._context.wrap_socket(raw, server_hostname=self.host)
        except BaseException:
            raw.close()
            raise


def _get_public_page(url: str, limit: int, deadline: float) -> tuple[int, str, bytes]:
    host = _public_host(url)
    addresses = {entry[4][0] for entry in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)}
    if not addresses or any(not _is_public_address(ipaddress.ip_address(ip)) for ip in addresses):
        raise ResearchPageError("Page address is not public")
    connection = _PinnedHTTPS(host, sorted(addresses)[0])
    try:
        parsed = urlsplit(url)
        path = parsed.path or "/"
        if parsed.query:
            path += "?" + parsed.query
        connection.request("GET", path, headers={"User-Agent": USER_AGENT, "Accept-Encoding": "identity", "Accept": "text/html,text/plain"})
        response = connection.getresponse()
        if 300 <= response.status < 400:
            raise ResearchPageError("Page redirects are not followed; use the final public page URL")
        content_type = response.getheader("Content-Type", "").split(";")[0].strip().lower()
        if response.status == 200 and content_type not in ("text/html", "text/plain", "application/xhtml+xml"):
            raise ResearchPageError("Only HTML and plain-text pages can be read")
        if response.getheader("Content-Encoding", "identity").lower() not in ("", "identity"):
            raise ResearchPageError("Compressed page response was rejected")
        length = response.getheader("Content-Length")
        if length and int(length) > limit:
            raise ResearchPageError("Page exceeds the read limit")
        data = bytearray()
        while True:
            if time.monotonic() > deadline:
                raise ResearchPageError("Page read timed out")
            chunk = response.read(min(65536, limit + 1 - len(data)))
            if not chunk:
                break
            data.extend(chunk)
            if len(data) > limit:
                raise ResearchPageError("Page exceeds the read limit")
        return response.status, content_type, bytes(data)
    finally:
        connection.close()


class _PageText(HTMLParser):
    """Extract a small document excerpt without executing or loading page resources."""
    def __init__(self, url: str):
        super().__init__(convert_charrefs=True)
        self.url = url
        self.hidden: list[str] = []
        self.in_title = False
        self.in_head = False
        self.title: list[str] = []
        self.text: list[str] = []
        self.images: list[dict] = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ("script", "style", "noscript", "svg", "template"):
            self.hidden.append(tag)
        if self.hidden:
            return
        if tag == "head":
            self.in_head = True
        if tag == "title":
            self.in_title = True
        image = attrs.get("src") if tag == "img" else None
        if tag == "meta" and attrs.get("property") == "og:image":
            image = attrs.get("content")
        if image and len(self.images) < 8:
            image = urljoin(self.url, image)
            try:
                _public_host(image)
            except ResearchPageError:
                return
            if not any(item["url"] == image for item in self.images):
                self.images.append({"url": image, "label": (attrs.get("alt") or "Page image")[:200], "sourceUrl": self.url, "license": "unknown"})

    def handle_endtag(self, tag):
        if self.hidden:
            if tag == self.hidden[-1]:
                self.hidden.pop()
            return
        if tag == "title":
            self.in_title = False
        if tag == "head":
            self.in_head = False

    def handle_data(self, data):
        if self.hidden:
            return
        clean = " ".join(data.split())
        if clean:
            if self.in_title:
                self.title.append(clean)
            elif not self.in_head:
                self.text.append(clean)


def _read_web_page(url: str) -> dict:
    host = _public_host(url)
    authority = f"[{host}]" if ":" in host else host
    deadline = time.monotonic() + 20
    status, _, rules = _get_public_page(f"https://{authority}/robots.txt", 128 * 1024, deadline)
    if status == 200:
        robot = RobotFileParser()
        robot.parse(rules.decode("utf-8", errors="replace").splitlines())
        if not robot.can_fetch(USER_AGENT, url):
            raise ResearchPageError("This site disallows automated page reading")
    elif status not in (404, 410):
        raise ResearchPageError("This site's automated-reading policy could not be established")
    status, content_type, data = _get_public_page(url, MAX_PAGE_BYTES, deadline)
    if status != 200:
        raise ResearchPageError("The public page is unavailable")
    raw = data.decode("utf-8", errors="replace")
    parser = _PageText(url)
    if content_type in ("text/html", "application/xhtml+xml"):
        parser.feed(raw)
        body = " ".join(parser.text)
    else:
        body = " ".join(raw.split())
    return {"tool": "read_web_page", "untrusted": True, "sources": [{"url": url, "title": " ".join(parser.title)[:300] or host, "text": body[:MAX_PAGE_TEXT], "truncated": len(body) > MAX_PAGE_TEXT}], "images": parser.images}


async def _search_web(query: str) -> dict:
    if not settings.serpapi_api_key.strip():
        return {"tool": "search_web", "error": "Web search is unavailable; try read_topic or search_commons"}
    # Provider request URLs contain a secret. Never propagate or log HTTP exceptions.
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=False) as client:
            response = await client.get("https://serpapi.com/search.json", params={"engine": "google", "q": query, "num": 8, "safe": "active", "api_key": settings.serpapi_api_key})
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict) or payload.get("error"):
                raise ValueError()
    except (httpx.HTTPError, ValueError):
        return {"tool": "search_web", "error": "Web search provider is unavailable"}
    sources = []
    for item in (payload.get("organic_results") or [])[:8]:
        if not isinstance(item, dict):
            continue
        url = str(item.get("link") or "")
        try:
            host = _public_host(url)
        except ResearchPageError:
            continue
        sources.append({"url": url, "title": str(item.get("title") or host)[:300], "snippet": str(item.get("snippet") or "")[:1200], "source": str(item.get("source") or host)[:200]})
    return {"tool": "search_web", "untrusted": True, "sources": sources}


async def research_editor_media(request: dict) -> dict:
    kind = request.get('tool')
    if kind == 'read_web_page':
        try:
            return await asyncio.wait_for(asyncio.to_thread(_read_web_page, str(request.get('url') or '')), timeout=30)
        except ResearchPageError as exc:
            return {'tool': kind, 'error': str(exc)}
        except (TimeoutError, OSError, ValueError, http.client.HTTPException):
            return {'tool': kind, 'error': 'Public page could not be read'}
    query = str(request.get('query', '')).strip()[:120]
    if not query:
        return {'error': 'A subject-specific query is required'}
    if kind == 'search_web':
        return await _search_web(query)
    async with httpx.AsyncClient(timeout=20, headers={'User-Agent': 'SkyClipEditor/1.0'}, follow_redirects=False) as client:
        if kind == 'search_stock':
            if not settings.pexels_api_key:
                return {'tool': kind, 'error': 'Stock provider unavailable; try search_commons'}
            response = await client.get('https://api.pexels.com/v1/search', params={'query':query,'per_page':8}, headers={'Authorization':settings.pexels_api_key})
            response.raise_for_status()
            return {'tool':kind,'items':[{'label':p.get('alt','Photo'),'url':p.get('src',{}).get('large2x'),'sourceUrl':p.get('url'),'credit':p.get('photographer'),'license':'Pexels'} for p in response.json().get('photos',[])]}
        if kind == 'search_commons':
            response = await client.get('https://commons.wikimedia.org/w/api.php',params={'action':'query','format':'json','generator':'search','gsrsearch':query,'gsrnamespace':6,'gsrlimit':8,'prop':'imageinfo','iiprop':'url|extmetadata','iiurlwidth':1600})
            response.raise_for_status()
            items=[]
            for page in response.json().get('query',{}).get('pages',{}).values():
                info=(page.get('imageinfo') or [{}])[0]; meta=info.get('extmetadata',{})
                url=info.get('thumburl') or info.get('url','')
                if url.startswith('https://upload.wikimedia.org/'):
                    items.append({'label':page.get('title'), 'url':url,'sourceUrl':info.get('descriptionurl'),'license':meta.get('LicenseShortName',{}).get('value'),'credit':meta.get('Artist',{}).get('value','')[:500]})
            return {'tool':kind,'items':items}
        if kind == 'read_topic':
            response=await client.get('https://en.wikipedia.org/w/api.php',params={'action':'query','format':'json','generator':'search','gsrsearch':query,'gsrlimit':3,'prop':'extracts|info','explaintext':1,'exintro':1,'exchars':3000,'inprop':'url'})
            response.raise_for_status()
            return {'tool':kind,'sources':[{'title':p.get('title'),'url':p.get('fullurl'),'text':p.get('extract','')[:3000]} for p in response.json().get('query',{}).get('pages',{}).values()]}
    return {'error':'Unknown research tool'}
