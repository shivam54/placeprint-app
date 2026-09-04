"""Natural-language neighborhood brief.

Grounded in Overture analysis + free nearby attractions (Wikipedia)
and SF Rec & Park events (DataSF). Optional Claude polish if ANTHROPIC_API_KEY is set.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from typing import Any

ATTRACTION_BUCKETS = {
    "parks",
    "outdoors",
    "museums",
    "galleries",
    "theatres",
    "cinemas",
    "cafes",
    "restaurants",
    "bakeries",
    "bars",
    "libraries",
    "bookstores",
}


def _http_get_json(url: str, headers: dict[str, str] | None = None, timeout: float = 6.0) -> Any:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "AroundHere/1.0 (Valid take-home; neighborhood brief)",
            **(headers or {}),
        },
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _overture_spotlights(dna: list[dict]) -> list[str]:
    names: list[str] = []
    # Prefer place-y categories first, then fall back to any named examples
    ranked = sorted(
        dna,
        key=lambda row: (0 if row.get("id") in ATTRACTION_BUCKETS else 1, -(row.get("count") or 0)),
    )
    for row in ranked:
        for ex in row.get("examples") or []:
            name = (ex.get("name") or "").strip()
            if not name or name.lower() == "unknown place":
                continue
            # Skip sterile medical/corporate sounding leftovers if they slipped in
            low = name.lower()
            if any(bad in low for bad in ("blood center", "davita", "dialysis", "plasma")):
                continue
            if name not in names:
                names.append(name)
            if len(names) >= 3:
                return names
    return names


def _wikipedia_attractions(lon: float, lat: float, limit: int = 4) -> list[str]:
    try:
        qs = urllib.parse.urlencode(
            {
                "action": "query",
                "list": "geosearch",
                "gscoord": f"{lat}|{lon}",
                "gsradius": 1800,
                "gslimit": limit + 4,
                "format": "json",
            }
        )
        data = _http_get_json(f"https://en.wikipedia.org/w/api.php?{qs}")
        titles: list[str] = []
        skip = ("street", "tunnel", "district", "neighborhood", "avenue", "road")
        for hit in data.get("query", {}).get("geosearch", []):
            title = (hit.get("title") or "").strip()
            if not title:
                continue
            low = title.lower()
            if any(s in low for s in skip) and "," not in title:
                # keep iconic neighborhoods only if nothing else - prefer landmarks
                if "san francisco" in low:
                    continue
            if title not in titles:
                titles.append(title)
            if len(titles) >= limit:
                break
        return titles
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError, KeyError):
        return []


def _sf_events_nearby(lon: float, lat: float, limit: int = 2) -> list[str]:
    """City of SF Our415 / Rec Park activities - free SODA API, no key required."""
    try:
        today = date.today().isoformat()
        where = (
            f"within_circle(point,{lat},{lon},2200) "
            f"AND event_end_date >= '{today}'"
        )
        qs = urllib.parse.urlencode(
            {
                "$where": where,
                "$order": "event_start_date ASC",
                "$limit": str(limit + 3),
            }
        )
        rows = _http_get_json(f"https://data.sfgov.org/resource/8i3s-ih2a.json?{qs}")
        out: list[str] = []
        for row in rows or []:
            name = (row.get("event_name") or "").strip()
            site = (row.get("site_location_name") or "").strip()
            if not name:
                continue
            label = f"{name} at {site}" if site else name
            if label not in out:
                out.append(label)
            if len(out) >= limit:
                break
        return out
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError, KeyError, TypeError):
        return []


def _compose_local_paragraph(
    place_name: str,
    place_count: int,
    strong: list[str],
    thin: list[str],
    attractions: list[str],
    events: list[str],
    lang: str,
) -> str:
    es = lang.lower().startswith("es")
    parts: list[str] = []

    if es:
        if strong and thin:
            parts.append(
                f"En {place_name}, el mix se siente fuerte en "
                f"{_join_es(strong)} y más flojo en {_join_es(thin)} "
                f"frente a bloques parecidos ({place_count} lugares en el radio)."
            )
        elif strong:
            parts.append(
                f"{place_name} destaca por {_join_es(strong)} "
                f"({place_count} lugares cerca)."
            )
        elif thin:
            parts.append(
                f"En {place_name} falta un poco de {_join_es(thin)} "
                f"comparado con zonas parecidas."
            )
        else:
            parts.append(
                f"{place_name} tiene un mix bastante equilibrado "
                f"({place_count} lugares en este paseo)."
            )
        if attractions:
            parts.append(f"Cerca conviene acercarse a {_join_es(attractions)}.")
        if events:
            parts.append(f"En la agenda local: {_join_es(events)}.")
    else:
        if strong and thin:
            parts.append(
                f"{place_name} feels strong on {_join_en(strong)} and a bit thin on "
                f"{_join_en(thin)} versus similar SF blocks "
                f"({place_count} places in this walk)."
            )
        elif strong:
            parts.append(
                f"{place_name} stands out for {_join_en(strong)} "
                f"({place_count} places nearby)."
            )
        elif thin:
            parts.append(
                f"{place_name} runs thin on {_join_en(thin)} compared with similar blocks."
            )
        else:
            parts.append(
                f"{place_name} has a fairly balanced mix "
                f"({place_count} places in this walk)."
            )
        if attractions:
            parts.append(f"Worth a detour: {_join_en(attractions)}.")
        if events:
            parts.append(f"On the local calendar: {_join_en(events)}.")

    return " ".join(parts)


def _join_en(items: list[str]) -> str:
    items = [i for i in items if i]
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    if len(items) == 2:
        return f"{items[0]} and {items[1]}"
    return f"{', '.join(items[:-1])}, and {items[-1]}"


def _join_es(items: list[str]) -> str:
    items = [i for i in items if i]
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    if len(items) == 2:
        return f"{items[0]} y {items[1]}"
    return f"{', '.join(items[:-1])} y {items[-1]}"


def _lab(row: dict[str, Any] | None, es: bool, key: str = "label") -> str:
    if not row:
        return ""
    if es:
        es_key = f"{key}_es" if not key.endswith("_es") else key
        return str(row.get(es_key) or row.get(key) or "")
    return str(row.get(key) or "")


def build_local_summary(
    analysis: dict[str, Any],
    place_name: str,
    lang: str = "en",
) -> dict[str, Any]:
    strengths = analysis.get("strengths") or []
    gaps = analysis.get("gaps") or []
    dna = analysis.get("dna") or []
    place_count = int(analysis.get("place_count") or 0)
    center = analysis.get("center") or {}
    lon = float(center.get("lon") or 0)
    lat = float(center.get("lat") or 0)
    es = lang.lower().startswith("es")

    strong_labels = [_lab(s, es) for s in strengths[:2] if s.get("label")]
    thin_labels = [_lab(g, es) for g in gaps[:2] if g.get("label")]

    overture_names = _overture_spotlights(dna)
    wiki = _wikipedia_attractions(lon, lat) if lon and lat else []
    events = _sf_events_nearby(lon, lat) if lon and lat else []

    # Merge attractions: Overture first, then Wikipedia landmarks not already covered
    attractions: list[str] = []
    for name in overture_names + wiki:
        if name not in attractions:
            attractions.append(name)
        if len(attractions) >= 3:
            break

    line = _compose_local_paragraph(
        place_name,
        place_count,
        strong_labels,
        thin_labels,
        attractions,
        events,
        lang,
    )

    return {
        "place_name": place_name,
        "place_count": place_count,
        "line": line,
        "strong": [
            {"id": s.get("id"), "emoji": s.get("emoji"), "label": _lab(s, es)}
            for s in strengths[:2]
        ],
        "thin": [
            {"id": g.get("id"), "emoji": g.get("emoji"), "label": _lab(g, es)}
            for g in gaps[:2]
        ],
        "spotlights": attractions,
        "events": events,
        "source": "local",
    }


def maybe_claude_line(local: dict[str, Any], lang: str = "en") -> str | None:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        return None

    es = lang.lower().startswith("es")
    facts = {
        "place": local["place_name"],
        "place_count": local["place_count"],
        "strong": [s["label"] for s in local.get("strong") or []],
        "thin": [t["label"] for t in local.get("thin") or []],
        "attractions": local.get("spotlights") or [],
        "events": local.get("events") or [],
        "draft": local.get("line"),
    }
    system = (
        "You write warm, human neighborhood blurbs for a walking map. "
        "Use ONLY the provided facts. Do not invent places, events, or stats. "
        "2 short sentences max. Natural prose - no labels like Strong/Thin, "
        "no bullet points, no hashtags."
    )
    user = (
        f"Language: {'Spanish' if es else 'English'}.\n"
        f"Facts JSON: {json.dumps(facts, ensure_ascii=False)}\n"
        "Rewrite as one flowing summary a friend would text you."
    )

    body = {
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 160,
        "system": system,
        "messages": [{"role": "user", "content": user}],
    }
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "content-type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=14) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        parts = payload.get("content") or []
        text = "".join(p.get("text", "") for p in parts if p.get("type") == "text").strip()
        return text or None
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError, KeyError):
        return None


def summarize(
    analysis: dict[str, Any],
    place_name: str,
    lang: str = "en",
) -> dict[str, Any]:
    """Build a brief. Claude polish is cached so we don't pay on every pin nudge.

    Events come from live DataSF at cache-miss time. While a brief is cached
    (default 12 minutes), the event line may lag new listings - intentional
    cost/latency tradeoff for the demo.
    """
    key = _cache_key(analysis, place_name, lang)
    cached = _cache_get(key)
    if cached is not None:
        out = dict(cached)
        out["cached"] = True
        return out

    local = build_local_summary(analysis, place_name, lang)
    polished = maybe_claude_line(local, lang)
    if polished:
        local["line"] = polished
        local["source"] = "claude"
    local["cached"] = False
    _cache_set(key, local)
    return local


# --- short TTL cache (Claude + DataSF event scrape) ---
_CACHE_TTL_SEC = int(os.environ.get("SUMMARY_CACHE_TTL_SEC", "720"))  # 12 minutes
_summary_cache: dict[str, tuple[float, dict[str, Any]]] = {}


def _cache_key(analysis: dict[str, Any], place_name: str, lang: str) -> str:
    center = analysis.get("center") or {}
    lon = round(float(center.get("lon") or 0), 4)
    lat = round(float(center.get("lat") or 0), 4)
    radius = int(float(analysis.get("radius_m") or 800))
    # fingerprint of the analysis story so cache invalidates when mix changes
    strong = ",".join(str(s.get("id")) for s in (analysis.get("strengths") or [])[:2])
    thin = ",".join(str(g.get("id")) for g in (analysis.get("gaps") or [])[:2])
    return f"{lang}|{place_name}|{lon}|{lat}|{radius}|{strong}|{thin}|{analysis.get('place_count')}"


def _cache_get(key: str) -> dict[str, Any] | None:
    hit = _summary_cache.get(key)
    if not hit:
        return None
    ts, payload = hit
    if time.time() - ts > _CACHE_TTL_SEC:
        _summary_cache.pop(key, None)
        return None
    return payload


def _cache_set(key: str, payload: dict[str, Any]) -> None:
    # Bound memory for a long-running demo process
    if len(_summary_cache) > 256:
        oldest = sorted(_summary_cache.items(), key=lambda kv: kv[1][0])[:64]
        for k, _ in oldest:
            _summary_cache.pop(k, None)
    _summary_cache[key] = (time.time(), dict(payload))
