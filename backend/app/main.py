from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import chat as chat_mod
from . import observability as obs
from . import summary as summary_mod
from . import weather as weather_mod
from .engine import FabricEngine
from .taxonomy import BUCKETS, bucket_meta

# Project root .env (Valid/.env) - local Claude key, etc.
ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")

DATA_PATH = ROOT / "data" / "sf_places.json"
DIST_PATH = ROOT / "frontend" / "dist"

app = FastAPI(title="Placeprint", version="0.3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    lon: float = Field(..., ge=-180, le=180)
    lat: float = Field(..., ge=-90, le=90)
    radius_m: float = Field(800, ge=300, le=2000)
    priorities: list[str] = Field(default_factory=list)


class ChatHistoryTurn(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=1000)
    lang: str = Field("en")
    analysis: dict[str, Any] | None = None
    history: list[ChatHistoryTurn] = Field(default_factory=list)
    # Optional: browser-fetched Open-Meteo (Render often cannot reach Open-Meteo server-side)
    weather: dict[str, Any] | None = None


class SummaryRequest(BaseModel):
    analysis: dict[str, Any]
    place_name: str = Field(..., min_length=1, max_length=120)
    lang: str = Field("en")


class TrackEventRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)
    props: dict[str, Any] = Field(default_factory=dict)


@lru_cache(maxsize=1)
def get_engine() -> FabricEngine:
    if not DATA_PATH.exists():
        raise FileNotFoundError(
            f"Missing {DATA_PATH}. Run: python scripts/download_places.py"
        )
    return FabricEngine.load(DATA_PATH)


@app.on_event("startup")
def startup() -> None:
    get_engine()
    obs.incr("startup")
    obs.logger.info("startup places=%s", get_engine().city_total)


def _in_sf(lon: float, lat: float) -> bool:
    return -122.55 <= lon <= -122.35 and 37.70 <= lat <= 37.85


@app.get("/api/health")
def health() -> dict:
    eng = get_engine()
    return {
        "ok": True,
        "places": eng.city_total,
        "live": "analysis",
        "uptime_sec": obs.snapshot()["uptime_sec"],
    }


@app.get("/api/weather")
def weather(
    lat: float = Query(..., ge=37.4, le=38.0),
    lon: float = Query(..., ge=-123.0, le=-122.0),
    lang: str = Query("en"),
) -> dict:
    """Live Open-Meteo conditions for the current pin (panel badge + Scout share the same fetch/cache)."""
    wx = weather_mod.fetch_current(lat, lon)
    if not wx:
        raise HTTPException(502, "Weather unavailable")
    out = dict(wx)
    if lang.lower().startswith("es"):
        out["condition"] = weather_mod.condition_es(out.get("condition"))
    return {"ok": True, **out}


@app.get("/api/metrics")
def metrics() -> dict:
    """Demo observability snapshot - counters + latency percentiles."""
    eng = get_engine()
    snap = obs.snapshot()
    return {"ok": True, "places": eng.city_total, **snap}


@app.post("/api/events")
def track_event(body: TrackEventRequest) -> dict:
    # Allow only short product event names
    allowed = {
        "explore_sf",
        "use_location",
        "outside_sf",
        "category_tap",
        "category_clear",
        "scout_open",
        "twin_jump",
        "pin_drag",
        "lang_toggle",
        "intro_done",
        "intro_skip",
    }
    name = body.name.strip().lower().replace("-", "_")
    if name not in allowed:
        raise HTTPException(400, "Unknown event")
    safe_props = {
        k: v
        for k, v in body.props.items()
        if isinstance(k, str)
        and len(k) <= 32
        and k not in {"message", "text", "reply", "address"}
        and isinstance(v, (str, int, float, bool))
    }
    obs.track_event(name, safe_props)
    return {"ok": True}


@app.get("/api/meta")
def meta() -> dict:
    eng = get_engine()
    return {
        "name": "Placeprint",
        "city": "San Francisco",
        "places": eng.city_total,
        "buckets": bucket_meta(),
        "priorities": [
            {"id": "groceries", "label": "Groceries", "label_es": "Compras"},
            {"id": "kids", "label": "Kids", "label_es": "Niños"},
            {"id": "carfree", "label": "Car-free", "label_es": "Sin auto"},
            {"id": "gym", "label": "Gym", "label_es": "Gimnasio"},
            {"id": "quiet", "label": "Quiet", "label_es": "Tranquilo"},
            {"id": "food", "label": "Food & nightlife", "label_es": "Comida y noche"},
            {"id": "green", "label": "Green space", "label_es": "Áreas verdes"},
        ],
        "radii": [
            {"id": 500, "label": "5 min walk", "label_es": "5 min a pie"},
            {"id": 800, "label": "10 min walk", "label_es": "10 min a pie"},
            {"id": 1200, "label": "15 min walk", "label_es": "15 min a pie"},
        ],
    }


@app.post("/api/analyze")
def analyze(body: AnalyzeRequest) -> dict:
    if not _in_sf(body.lon, body.lat):
        obs.incr("analyze.outside_sf")
        raise HTTPException(400, "Drop a pin inside San Francisco for this demo.")
    eng = get_engine()
    with obs.timed(
        "analyze",
        lon=obs.round_coord(body.lon),
        lat=obs.round_coord(body.lat),
        radius_m=int(body.radius_m),
    ) as meta:
        result = eng.analyze(body.lon, body.lat, body.radius_m, body.priorities)
        meta["place_count"] = result.get("place_count")
        return result


@app.get("/api/places")
def places(
    lon: float = Query(...),
    lat: float = Query(...),
    radius_m: float = Query(800, ge=300, le=2000),
    bucket: str = Query(..., description="Life-category id - required so the map never dumps every place"),
    limit: int = Query(120, ge=1, le=300),
) -> dict:
    if bucket not in BUCKETS:
        raise HTTPException(400, f"Unknown bucket: {bucket}")
    if not _in_sf(lon, lat):
        raise HTTPException(400, "Outside SF demo bounds.")
    eng = get_engine()
    with obs.timed(
        "places",
        lon=obs.round_coord(lon),
        lat=obs.round_coord(lat),
        bucket=bucket,
        radius_m=int(radius_m),
    ) as meta:
        items = eng.places_in_radius(lon, lat, radius_m, bucket, limit)
        meta["count"] = len(items)
        return {"count": len(items), "places": items, "bucket": bucket}


@app.post("/api/chat")
def chat(body: ChatRequest) -> dict:
    history = [{"role": t.role, "content": t.content} for t in body.history[-8:]]
    center = (body.analysis or {}).get("center") or {}
    with obs.timed(
        "chat",
        lang=body.lang,
        lon=obs.round_coord(float(center["lon"])) if center.get("lon") is not None else None,
        lat=obs.round_coord(float(center["lat"])) if center.get("lat") is not None else None,
        history_len=len(history),
    ) as meta:
        out = chat_mod.reply(body.message, body.analysis, body.lang, history, body.weather)
        meta["source"] = out.get("source")
        if out.get("source") == "claude":
            obs.incr("chat.claude")
        else:
            obs.incr("chat.local")
        return out


@app.post("/api/summary")
def summary(body: SummaryRequest) -> dict:
    center = (body.analysis or {}).get("center") or {}
    with obs.timed(
        "summary",
        lang=body.lang,
        lon=obs.round_coord(float(center["lon"])) if center.get("lon") is not None else None,
        lat=obs.round_coord(float(center["lat"])) if center.get("lat") is not None else None,
        radius_m=int(float((body.analysis or {}).get("radius_m") or 0)),
    ) as meta:
        out = summary_mod.summarize(body.analysis, body.place_name, body.lang)
        meta["source"] = out.get("source")
        meta["cached"] = bool(out.get("cached"))
        if out.get("cached"):
            obs.incr("summary.cache_hit")
        else:
            obs.incr("summary.cache_miss")
        if out.get("source") == "claude":
            obs.incr("summary.claude")
        else:
            obs.incr("summary.local")
        return out


@app.get("/api/has")
def has_nearby(
    lon: float = Query(...),
    lat: float = Query(...),
    bucket: str = Query(...),
    radius_m: float = Query(800, ge=300, le=2000),
) -> dict:
    if bucket not in BUCKETS:
        raise HTTPException(400, f"Unknown bucket: {bucket}")
    eng = get_engine()
    return eng.has_bucket_nearby(lon, lat, radius_m, bucket)


# --- Production: serve the Vite build from the same origin as /api ---
if DIST_PATH.is_dir():
    assets_dir = DIST_PATH / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/")
    def spa_index() -> FileResponse:
        return FileResponse(DIST_PATH / "index.html")

    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str) -> FileResponse:
        # Never shadow API / docs
        if full_path.startswith("api") or full_path in {"docs", "openapi.json", "redoc"}:
            raise HTTPException(404, "Not found")
        candidate = DIST_PATH / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(DIST_PATH / "index.html")
