"""Live weather for the map pin via Open-Meteo (free, no API key)."""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

# WMO weather interpretation codes (Open-Meteo)
_WMO = {
    0: "Clear",
    1: "Mostly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Foggy",
    48: "Icy fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Heavy drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    71: "Light snow",
    73: "Snow",
    75: "Heavy snow",
    80: "Light showers",
    81: "Showers",
    82: "Heavy showers",
    95: "Thunderstorm",
    96: "Thunderstorm with hail",
    99: "Thunderstorm with heavy hail",
}

_WMO_ES = {
    "Clear": "Despejado",
    "Mostly clear": "Mayormente despejado",
    "Partly cloudy": "Parcialmente nublado",
    "Overcast": "Nublado",
    "Foggy": "Con niebla",
    "Icy fog": "Niebla helada",
    "Light drizzle": "Llovizna ligera",
    "Drizzle": "Llovizna",
    "Heavy drizzle": "Llovizna fuerte",
    "Light rain": "Lluvia ligera",
    "Rain": "Lluvia",
    "Heavy rain": "Lluvia fuerte",
    "Light snow": "Nieve ligera",
    "Snow": "Nieve",
    "Heavy snow": "Nieve fuerte",
    "Light showers": "Chubascos ligeros",
    "Showers": "Chubascos",
    "Heavy showers": "Chubascos fuertes",
    "Thunderstorm": "Tormenta",
    "Thunderstorm with hail": "Tormenta con granizo",
    "Thunderstorm with heavy hail": "Tormenta con granizo fuerte",
    "Unknown": "Desconocido",
}


def condition_es(condition: str | None) -> str:
    if not condition:
        return _WMO_ES["Unknown"]
    return _WMO_ES.get(condition, condition)


def format_line(weather: dict[str, Any], es: bool = False) -> str:
    cond = weather.get("condition")
    if es:
        # Translate English WMO labels; leave already-Spanish strings alone
        cond = condition_es(cond) if cond in _WMO_ES else cond
        return (
            f"Ahora mismo cerca del pin: {cond}, "
            f"{weather.get('temp_f')}°F (sensación {weather.get('feels_like_f')}°F), "
            f"viento {weather.get('wind_mph')} mph, humedad {weather.get('humidity_pct')}%."
        )
    return (
        f"Right now near this pin: {weather.get('condition')}, "
        f"{weather.get('temp_f')}°F (feels like {weather.get('feels_like_f')}°F), "
        f"wind {weather.get('wind_mph')} mph, humidity {weather.get('humidity_pct')}%."
    )


_CACHE_TTL_SEC = 600  # 10 minutes
_cache: dict[str, tuple[float, dict[str, Any]]] = {}


def fetch_current(lat: float, lon: float) -> dict[str, Any] | None:
    """Current conditions at lat/lon. Returns None if the request fails."""
    key = f"{round(lat, 3)}|{round(lon, 3)}"
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < _CACHE_TTL_SEC:
        return dict(hit[1])

    params = urllib.parse.urlencode(
        {
            "latitude": lat,
            "longitude": lon,
            "current": "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m",
            "temperature_unit": "fahrenheit",
            "wind_speed_unit": "mph",
            "timezone": "America/Los_Angeles",
        }
    )
    url = f"https://api.open-meteo.com/v1/forecast?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": "Placeprint/0.3"})
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError):
        return None

    cur = payload.get("current") or {}
    code = int(cur.get("weather_code") or 0)
    out = {
        "source": "Open-Meteo",
        "temp_f": round(float(cur.get("temperature_2m") or 0), 1),
        "feels_like_f": round(float(cur.get("apparent_temperature") or 0), 1),
        "condition": _WMO.get(code, "Unknown"),
        "weather_code": code,
        "wind_mph": round(float(cur.get("wind_speed_10m") or 0), 1),
        "humidity_pct": int(cur.get("relative_humidity_2m") or 0),
        "observed_at": cur.get("time"),
    }
    _cache[key] = (time.time(), out)
    return dict(out)
