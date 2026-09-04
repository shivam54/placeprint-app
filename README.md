# Placeprint

**Pitch:** Placeprint turns any San Francisco map pin into a clear neighborhood read - a simple chart of what’s around you (Block DNA), a short AI-written story of the area, similar “twin” blocks elsewhere in the city, and **Scout**, an AI chat assistant that answers questions about that pin using live map data and weather.

## Why this

“What’s nearby?” is usually just a list of pins. Placeprint answers **what this block feels like**.

- **Block DNA** - a visual breakdown of the place mix within a short walk (how much is cafes vs parks vs clinics vs shops, and so on) so you can see the character of the block at a glance - and tap a category to show those places on the map.
- **Short story** - a plain-language brief of what’s strong or thin here versus similar SF pockets.
- **Twin blocks** - other parts of the city with a similar mix (pins 1–5).
- **Scout** - an AI assistant bot for the current pin. Ask about weather, cafes, or what’s missing; it only uses this block’s data and live weather, so it doesn’t invent places from the open web.

Facts come from open map data first; AI polishes the story and powers Scout inside that context. One pin, under a minute: story → Block DNA → twins → Scout.

## Key trade-offs and cuts


| Shipped                                                    | Cut / later                                |
| ---------------------------------------------------------- | ------------------------------------------ |
| SF-only demo on an Overture extract                        | Multi-city / live GeoParquet               |
| Fact-first brief + grounded Scout (Claude optional polish) | Open-web LLM that can invent places        |
| DataSF Rec/Our415 activities                               | Ticketmaster-style nightlife               |
| Crow-flies walk radius + one FastAPI monolith              | Walk/drive isochrones (OSRM/Valhalla) + k8s |
| Debounced + TTL-cached briefs                              | Claude on every pin nudge                  |


**Stack:** FastAPI + React / MapLibre · Overture SF places · DataSF · Open-Meteo · Claude Haiku (recommended)

**Try it:** Explore SF or use location → adjust radius → tap DNA → jump twins 1–5 → ask Scout about weather or cafes → toggle EN ↔ ES.

For the full picture - features, architecture diagrams, constraints, edge cases, and future work - see **[WRITEUP.md](./WRITEUP.md)**.

## Data extraction

The SF places file is built from Overture Maps with:

- **`scripts/download_places.py`** - downloads / filters Overture `place` data for San Francisco and writes `data/sf_places.json`
- **`backend/requirements-download.txt`** - extra deps for that script (`overturemaps`)

`data/sf_places.json` is already in the repo so the app runs without re-downloading. To rebuild:

```bash
pip install -r backend/requirements-download.txt
python scripts/download_places.py
```

---



## Setup

Use **two terminals**. The API stays running while you start the frontend.

**1. Backend** (from the repo root):

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt

# data/sf_places.json is already in the repo (see Data extraction above to rebuild).

# Recommended for polished briefs + Scout:
# cp .env.example .env   # then set ANTHROPIC_API_KEY=

uvicorn backend.app.main:app --reload --port 8000
```

**2. Frontend** (new terminal):

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** — Vite proxies `/api` to port 8000.  
(Port 8000 alone is the API; the full app UI is on 5173 in local dev.)

---

## Observability

Light in-process metrics (no Datadog). Coordinates in logs are rounded; **chat text is never stored**. Counters reset if the server restarts.

### `GET /api/metrics`

Open in a browser while the API is running (e.g. `http://127.0.0.1:8000/api/metrics`). Returns uptime, place count, counters, and latency percentiles for analyze / summary / chat / places.

Sample shape:

```json
{
  "ok": true,
  "places": 58340,
  "uptime_sec": 120,
  "counters": {
    "startup": 1,
    "analyze.ok": 3,
    "summary.claude": 1,
    "event.explore_sf": 2
  },
  "timings": {
    "analyze": { "count": 3, "p50_ms": 1.1, "p95_ms": 1.1, "last_ms": 0.9 },
    "summary": { "count": 1, "p50_ms": 2521.2, "p95_ms": 2521.2, "last_ms": 2521.2 }
  }
}
```

### `POST /api/events`

Product beacons from the UI (explore SF, location, category tap, Scout open, twin jump, intro, …). **POST only** - opening the URL in a browser (GET) returns Method Not Allowed.

Sample:

```bash
curl -X POST http://127.0.0.1:8000/api/events \
  -H 'Content-Type: application/json' \
  -d '{"name":"explore_sf","props":{}}'
```

Response: `{"ok":true}` — then refresh `/api/metrics` to see `event.explore_sf` increase.

---

## Attribution

Places © [Overture Maps Foundation](https://overturemaps.org/) · Basemap [OpenFreeMap](https://openfreemap.org/) © [OpenMapTiles](https://openmaptiles.org/) · © [OpenStreetMap](https://www.openstreetmap.org/copyright) · Events [DataSF](https://data.sfgov.org/) · Weather [Open-Meteo](https://open-meteo.com/)