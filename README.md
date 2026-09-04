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
| Crow-flies walk radius + one FastAPI monolith              | True walk isochrones + microservices / k8s |
| Debounced + TTL-cached briefs                              | Claude on every pin nudge                  |


**Stack:** FastAPI + React / MapLibre · Overture SF places · DataSF · Open-Meteo · Claude Haiku (recommended)  
**Data script:** `scripts/download_places.py` (rebuilds `data/sf_places.json`)

**Try it:** Explore SF or use location → adjust radius → tap DNA → jump twins 1–5 → ask Scout about weather or cafes → toggle EN ↔ ES.

For the full picture - features, architecture diagrams, constraints, edge cases, and future work - see **[WRITEUP.md](./WRITEUP.md)**.

---



## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt

# data/sf_places.json should already be present. To rebuild it:
# pip install -r backend/requirements-download.txt
# python scripts/download_places.py

# Recommended for polished briefs + Scout:
# cp .env.example .env   # then set ANTHROPIC_API_KEY=

uvicorn backend.app.main:app --reload --port 8000

cd frontend && npm install && npm run dev
```

Open [http://localhost:5173](http://localhost:5173) (Vite proxies `/api` → port 8000).

---



## Attribution

Places © [Overture Maps Foundation](https://overturemaps.org/) · Basemap [OpenFreeMap](https://openfreemap.org/) © [OpenMapTiles](https://openmaptiles.org/) · © [OpenStreetMap](https://www.openstreetmap.org/copyright) · Events [DataSF](https://data.sfgov.org/) · Weather [Open-Meteo](https://open-meteo.com/)