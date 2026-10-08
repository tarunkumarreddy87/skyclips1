"""Opt-in SerpAPI image discovery with bounded, public-only media downloads.

Search results are untrusted and have UNKNOWN licensing, never stock licensing.
No website HTML, scripts, watch pages, credentials, or cookies are downloaded.
"""
from __future__ import annotations

import asyncio
import hashlib
import http.client
import ipaddress
import socket
import ssl
import time
from urllib.parse import urljoin, urlsplit
from urllib.robotparser import RobotFileParser
from typing import Callable

import serpapi

from src.config import settings

USER_AGENT = "SkyClipMediaBot/1.0"
MAX_BYTES = 12 * 1024 * 1024


class WebMediaError(RuntimeError):
    pass


def public_host(url: str, blocked: list[str]) -> str:
    try:
        parsed = urlsplit(url)
        host = (parsed.hostname or "").lower().rstrip(".").encode("idna").decode()
        if parsed.scheme != "https" or parsed.port not in (None, 443) or parsed.username or parsed.password:
            raise ValueError()
        if not host or any(ord(c) < 33 for c in url) or "\\" in url:
            raise ValueError()
        for entry in blocked:
            domain = (urlsplit(entry if "://" in entry else "https://" + entry.lstrip("*." )).hostname or "").lower().rstrip(".").encode("idna").decode()
            if domain and (host == domain or host.endswith("." + domain)):
                raise ValueError()
        if host == "localhost" or host.endswith((".localhost", ".local", ".internal")):
            raise ValueError()
        try:
            address = ipaddress.ip_address(host)
        except ValueError:
            address = None
        if address is not None and not address.is_global:
            raise ValueError()
        return host
    except (ValueError, UnicodeError):
        raise WebMediaError("Unsafe or blocked web media URL") from None


class _PinnedHTTPS(http.client.HTTPSConnection):
    """Connect to the validated IP, while verifying TLS for the original host."""
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


def _get(url: str, blocked: list[str], limit: int, *, same_host: str | None = None, allowed: Callable[[str], bool] | None = None) -> tuple[int, str, bytes, str]:
    deadline = time.monotonic() + 20
    for _ in range(4):
        host = public_host(url, blocked)
        if same_host is not None and host != same_host:
            raise WebMediaError("Cross-host media redirect rejected")
        if allowed is not None and not allowed(url):
            raise WebMediaError("Media host disallows crawling")
        addresses = {item[4][0] for item in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)}
        if not addresses or any(not ipaddress.ip_address(ip).is_global for ip in addresses):
            raise WebMediaError("Web media resolved to a non-public address")
        connection = _PinnedHTTPS(host, sorted(addresses)[0])
        try:
            parsed = urlsplit(url)
            path = parsed.path or "/"
            if parsed.query:
                path += "?" + parsed.query
            connection.request("GET", path, headers={"User-Agent": USER_AGENT, "Accept-Encoding": "identity"})
            response = connection.getresponse()
            if response.status in (301, 302, 303, 307, 308):
                url = urljoin(url, response.getheader("Location", ""))
                continue
            length = response.getheader("Content-Length")
            if length and int(length) > limit:
                raise WebMediaError("Web media exceeds size limit")
            data = bytearray()
            while True:
                if time.monotonic() > deadline:
                    raise WebMediaError("Web media download timed out")
                chunk = response.read(min(65536, limit + 1 - len(data)))
                if not chunk:
                    break
                data.extend(chunk)
                if len(data) > limit:
                    raise WebMediaError("Web media exceeds size limit")
            return response.status, response.getheader("Content-Type", "").split(";")[0], bytes(data), url
        finally:
            connection.close()
    raise WebMediaError("Too many web media redirects")


def _download(url: str, blocked: list[str]) -> tuple[bytes, str, str]:
    host = public_host(url, blocked)
    allowed = None
    status, _, rules, _ = _get(f"https://{host}/robots.txt", blocked, 256 * 1024)
    if status == 200:
        robot = RobotFileParser()
        robot.parse(rules.decode("utf-8", errors="replace").splitlines())
        allowed = lambda target: robot.can_fetch(USER_AGENT, target)
        if not robot.can_fetch(USER_AGENT, url):
            raise WebMediaError("Media host disallows crawling")
    elif status not in (404, 410):
        raise WebMediaError("Cannot establish media host crawling permission")
    status, content_type, data, final_url = _get(url, blocked, MAX_BYTES, same_host=host, allowed=allowed)
    # Do not follow a media redirect into a different robots policy.
    if public_host(final_url, blocked) != host:
        raise WebMediaError("Cross-host media redirect rejected")
    if status != 200:
        raise WebMediaError("Web media unavailable")
    if content_type == "image/jpeg" and data.startswith(b"\xff\xd8\xff"):
        return data, "jpg", final_url
    if content_type == "image/png" and data.startswith(b"\x89PNG\r\n\x1a\n"):
        return data, "png", final_url
    raise WebMediaError("Only JPEG and PNG web images are supported")


async def search_images(query: str, blocked: list[str]) -> list[dict]:
    if not settings.serpapi_api_key.strip():
        raise WebMediaError("Web sourcing requires SERPAPI_API_KEY on the generation worker")
    # Never propagate an HTTP exception URL: it would contain the API key.
    try:
        client = serpapi.Client(api_key=settings.serpapi_api_key, timeout=25)
        payload = await asyncio.to_thread(client.search, {
                "engine": "google_images", "google_domain": "google.com",
                "q": query[:300], "hl": "en", "gl": "us", "safe": "active",
            })
        if payload.get("error"):
            raise WebMediaError("Web search provider rejected the request")
    except Exception:
        raise WebMediaError("Web search provider unavailable") from None
    results = []
    seen = set()
    for item in payload.get("images_results", [])[:30]:
        if not isinstance(item, dict):
            continue
        source = str(item.get("link") or "")
        media = str(item.get("original") or "")
        try:
            public_host(source, blocked)
            public_host(media, blocked)
        except WebMediaError:
            continue
        if media in seen:
            continue
        seen.add(media)
        results.append({"id": "web:" + hashlib.sha256(media.encode()).hexdigest(),
                        "source_url": source, "url": media,
                        "title": str(item.get("title") or "")[:300]})
    # Try different hosts first: one crawler-blocked CDN must not consume the
    # entire bounded download budget when Google returns many of its images.
    hosts = set()
    distinct, repeated = [], []
    for result in results:
        host = urlsplit(result["url"]).hostname
        (repeated if host in hosts else distinct).append(result)
        hosts.add(host)
    return (distinct + repeated)[:8]


async def fetch_web_image(query: str, blocked: list[str], used: set, lock: asyncio.Lock) -> dict | None:
    for candidate in (await search_images(query, blocked))[:4]:
        async with lock:
            if candidate["id"] in used:
                continue
            used.add(candidate["id"])
        try:
            data, extension, final_url = await asyncio.to_thread(_download, candidate["url"], blocked)
            return {**candidate, "url": final_url, "data": data, "extension": extension,
                    "license": "unknown", "provider": "serpapi", "requires_license_review": True}
        except (WebMediaError, OSError, ValueError, http.client.HTTPException):
            continue
    return None
