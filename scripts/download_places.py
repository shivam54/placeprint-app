#!/usr/bin/env python3
"""Download San Francisco Overture places and write a compact JSON for the API."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
RAW = DATA / "sf_places_raw.geojson"
OUT = DATA / "sf_places.json"

# Greater San Francisco
BBOX = "-122.515,37.708,-122.357,37.832"


def download() -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    cmd = [
        sys.executable,
        "-m",
        "overturemaps",
        "download",
        f"--bbox={BBOX}",
        "-f",
        "geojson",
        "--type=place",
        "-o",
        str(RAW),
    ]
    print("Downloading Overture places for SF…")
    subprocess.check_call(cmd)


def primary_name(props: dict) -> str | None:
    names = props.get("names") or {}
    if isinstance(names, dict):
        if names.get("primary"):
            return names["primary"]
        common = names.get("common") or {}
        if isinstance(common, dict) and common.get("en"):
            return common["en"]
    return None


def primary_category(props: dict) -> str | None:
    cats = props.get("categories") or {}
    if isinstance(cats, dict):
        return cats.get("primary")
    return None


def coords_of(geom: dict) -> tuple[float, float] | None:
    if not geom:
        return None
    gtype = geom.get("type")
    coords = geom.get("coordinates")
    if gtype == "Point" and coords and len(coords) >= 2:
        return float(coords[0]), float(coords[1])
    if gtype == "MultiPoint" and coords:
        c = coords[0]
        return float(c[0]), float(c[1])
    return None


def primary_address(props: dict) -> str | None:
    addrs = props.get("addresses") or []
    if not isinstance(addrs, list) or not addrs:
        return None
    a0 = addrs[0]
    if not isinstance(a0, dict):
        return None
    freeform = (a0.get("freeform") or "").strip()
    if freeform:
        return freeform
    parts = [
        a0.get("street"),
        a0.get("locality") or a0.get("city"),
        a0.get("region"),
        a0.get("postcode"),
    ]
    cleaned = [str(p).strip() for p in parts if p]
    return ", ".join(cleaned) if cleaned else None


def compact() -> None:
    print("Compacting GeoJSON…")
    with RAW.open() as f:
        geo = json.load(f)

    places = []
    for feat in geo.get("features", []):
        props = feat.get("properties") or {}
        xy = coords_of(feat.get("geometry") or {})
        if not xy:
            continue
        lon, lat = xy
        name = primary_name(props)
        category = primary_category(props)
        address = primary_address(props)
        row = {
            "id": props.get("id") or feat.get("id"),
            "name": name,
            "category": category,
            "lon": round(lon, 6),
            "lat": round(lat, 6),
        }
        if address:
            row["address"] = address
        places.append(row)

    payload = {
        "source": "Overture Maps places",
        "bbox": [float(x) for x in BBOX.split(",")],
        "count": len(places),
        "places": places,
    }
    OUT.write_text(json.dumps(payload, separators=(",", ":")))
    print(f"Wrote {OUT} ({len(places)} places)")


if __name__ == "__main__":
    if "--compact-only" in sys.argv:
        compact()
    else:
        download()
        compact()
