"""Spatial fabric analysis over Overture places."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .taxonomy import BUCKETS, PRIORITY_WEIGHTS, bucket_fields, bucket_for, label_for

BUCKET_IDS = list(BUCKETS.keys())
BUCKET_INDEX = {b: i for i, b in enumerate(BUCKET_IDS)}

# ~111.32 km per degree latitude
M_PER_DEG_LAT = 111_320.0


@dataclass
class FabricEngine:
    names: list[str | None]
    categories: list[str | None]
    addresses: list[str | None]
    buckets: list[str | None]
    coords_deg: np.ndarray  # (N, 2) lon, lat
    cell_centers: np.ndarray  # (C, 2) lon, lat
    cell_vectors: np.ndarray  # (C, B) L2-normalized counts
    cell_counts: np.ndarray  # (C, B) raw counts
    city_share: np.ndarray  # (B,) city-wide bucket share
    city_total: int

    @classmethod
    def load(cls, path: Path) -> "FabricEngine":
        data = json.loads(path.read_text())
        places = data["places"]

        names: list[str | None] = []
        categories: list[str | None] = []
        addresses: list[str | None] = []
        buckets: list[str | None] = []
        coords = []

        for p in places:
            lon = float(p["lon"])
            lat = float(p["lat"])
            cat = p.get("category")
            names.append(p.get("name"))
            categories.append(cat)
            addr = p.get("address")
            addresses.append(addr.strip() if isinstance(addr, str) and addr.strip() else None)
            buckets.append(bucket_for(cat))
            coords.append((lon, lat))

        coords_deg = np.asarray(coords, dtype=np.float64)

        cell_centers, cell_counts = cls._build_grid(coords_deg, buckets)
        norms = np.linalg.norm(cell_counts, axis=1, keepdims=True)
        norms = np.maximum(norms, 1e-9)
        cell_vectors = cell_counts / norms

        bucket_totals = np.zeros(len(BUCKET_IDS), dtype=np.float64)
        for b in buckets:
            if b in BUCKET_INDEX:
                bucket_totals[BUCKET_INDEX[b]] += 1
        total = float(bucket_totals.sum()) or 1.0
        city_share = bucket_totals / total

        return cls(
            names=names,
            categories=categories,
            addresses=addresses,
            buckets=buckets,
            coords_deg=coords_deg,
            cell_centers=cell_centers,
            cell_vectors=cell_vectors,
            cell_counts=cell_counts,
            city_share=city_share,
            city_total=len(places),
        )

    @staticmethod
    def _build_grid(
        coords_deg: np.ndarray, buckets: list[str | None], cell_deg: float = 0.008
    ) -> tuple[np.ndarray, np.ndarray]:
        """~900m cells across SF."""
        if len(coords_deg) == 0:
            return np.zeros((0, 2)), np.zeros((0, len(BUCKET_IDS)))

        lon0, lat0 = coords_deg.min(axis=0)
        lon1, lat1 = coords_deg.max(axis=0)
        ncols = max(int(math.ceil((lon1 - lon0) / cell_deg)) + 1, 1)
        nrows = max(int(math.ceil((lat1 - lat0) / cell_deg)) + 1, 1)

        counts: dict[tuple[int, int], np.ndarray] = {}
        for (lon, lat), bucket in zip(coords_deg, buckets):
            if bucket not in BUCKET_INDEX:
                continue
            c = int((lon - lon0) / cell_deg)
            r = int((lat - lat0) / cell_deg)
            key = (c, r)
            if key not in counts:
                counts[key] = np.zeros(len(BUCKET_IDS), dtype=np.float64)
            counts[key][BUCKET_INDEX[bucket]] += 1

        # Keep cells with enough signal
        centers = []
        vectors = []
        for (c, r), vec in counts.items():
            if vec.sum() < 8:
                continue
            centers.append((lon0 + (c + 0.5) * cell_deg, lat0 + (r + 0.5) * cell_deg))
            vectors.append(vec)

        if not centers:
            return np.zeros((0, 2)), np.zeros((0, len(BUCKET_IDS)))
        return np.asarray(centers, dtype=np.float64), np.asarray(vectors, dtype=np.float64)

    def _radius_query(self, lon: float, lat: float, radius_m: float) -> np.ndarray:
        cos_lat = math.cos(math.radians(lat))
        dx = (self.coords_deg[:, 0] - lon) * M_PER_DEG_LAT * cos_lat
        dy = (self.coords_deg[:, 1] - lat) * M_PER_DEG_LAT
        dist2 = dx * dx + dy * dy
        return np.where(dist2 <= radius_m * radius_m)[0]

    def analyze(
        self,
        lon: float,
        lat: float,
        radius_m: float = 800,
        priorities: list[str] | None = None,
    ) -> dict:
        idxs = self._radius_query(lon, lat, radius_m)
        counts = np.zeros(len(BUCKET_IDS), dtype=np.float64)
        samples: dict[str, list[dict]] = {b: [] for b in BUCKET_IDS}

        for i in idxs:
            b = self.buckets[i]
            if b not in BUCKET_INDEX:
                continue
            counts[BUCKET_INDEX[b]] += 1
            if len(samples[b]) < 4:
                samples[b].append(
                    {
                        "name": self.names[i] or "Unknown place",
                        "category": self.categories[i],
                    }
                )

        total = float(counts.sum()) or 1.0
        share = counts / total

        # Personality from top buckets
        ranked = sorted(
            [
                {
                    "id": bid,
                    **bucket_fields(bid),
                    "count": int(counts[BUCKET_INDEX[bid]]),
                    "share": round(float(share[BUCKET_INDEX[bid]]), 4),
                    "city_percentile": self._percentile(bid, share[BUCKET_INDEX[bid]]),
                    "examples": samples[bid],
                }
                for bid in BUCKET_IDS
                if counts[BUCKET_INDEX[bid]] > 0
            ],
            key=lambda x: x["count"],
            reverse=True,
        )

        personality = self._personality(ranked, es=False)
        personality_es = self._personality(ranked, es=True)
        peers = self._peer_cells(share, k=12)
        gaps, strengths = self._gaps_and_strengths(counts, peers, priorities or [])

        verdict = self._verdict(gaps, strengths, priorities or [])

        return {
            "center": {"lon": lon, "lat": lat},
            "radius_m": radius_m,
            "place_count": int(len(idxs)),
            "bucketed_count": int(counts.sum()),
            "personality": personality,
            "personality_es": personality_es,
            "verdict": verdict,
            "dna": ranked,
            "gaps": gaps,
            "strengths": strengths,
            "similar": self._similar_areas(share, lon, lat, n=5),
            "why": {
                "method": (
                    "We count Overture places in your walking radius, roll categories into "
                    "life buckets, then compare this mix to similar SF cells (not the whole city average)."
                ),
                "method_es": (
                    "Contamos lugares Overture en tu radio a pie, los agrupamos en categorías "
                    "de vida diaria y comparamos este mix con celdas parecidas de SF "
                    "(no con el promedio de toda la ciudad)."
                ),
                "peer_cell_count": len(peers),
                "city_places": self.city_total,
                "priorities": priorities or [],
            },
        }

    def _percentile(self, bucket_id: str, local_share: float) -> int:
        """Share percentile vs grid cells that have this bucket."""
        idx = BUCKET_INDEX[bucket_id]
        if len(self.cell_counts) == 0:
            return 50
        cell_totals = self.cell_counts.sum(axis=1)
        cell_totals = np.maximum(cell_totals, 1e-9)
        cell_share = self.cell_counts[:, idx] / cell_totals
        return int(round(100.0 * float((cell_share <= local_share).mean())))

    def _personality(self, ranked: list[dict], es: bool = False) -> str:
        if not ranked:
            return (
                "Bolsillo tranquilo - pocos lugares mapeados en este radio."
                if es
                else "Quiet pocket - few mapped places in this radius."
            )
        top = ranked[:3]
        names = [
            (t.get("label_es") if es and t.get("label_es") else t["label"]).lower()
            for t in top
        ]
        if len(names) == 1:
            return (
                f"{top[0]['emoji']} Bloque dominado por {names[0]}."
                if es
                else f"{top[0]['emoji']} {top[0]['label']}-led block."
            )
        if len(names) == 2:
            return (
                f"{top[0]['emoji']} Orientado a {names[0]}, con {names[1]}."
                if es
                else f"{top[0]['emoji']} {names[0]}-forward with {names[1]}."
            )
        if es:
            return (
                f"{top[0]['emoji']} Energía de {names[0]} + {names[1]}, "
                f"con {names[2]} en el mix."
            )
        return (
            f"{top[0]['emoji']} {names[0]} + {names[1]} energy, "
            f"with {names[2]} in the mix."
        )

    def _peer_cells(self, share: np.ndarray, k: int = 12) -> np.ndarray:
        if len(self.cell_vectors) == 0:
            return np.zeros((0, len(BUCKET_IDS)))
        v = share.copy()
        n = np.linalg.norm(v)
        if n < 1e-9:
            return self.cell_counts[: min(k, len(self.cell_counts))]
        v = v / n
        sims = self.cell_vectors @ v
        top = np.argsort(-sims)[:k]
        return self.cell_counts[top]

    def _gaps_and_strengths(
        self,
        counts: np.ndarray,
        peers: np.ndarray,
        priorities: list[str],
    ) -> tuple[list[dict], list[dict]]:
        weights = {b: 1.0 for b in BUCKET_IDS}
        for p in priorities:
            for b, w in PRIORITY_WEIGHTS.get(p, {}).items():
                weights[b] = max(weights[b], w)

        if len(peers) == 0:
            peer_mean = np.maximum(self.city_share * max(float(counts.sum()), 1.0), 0.5)
        else:
            peer_mean = peers.mean(axis=0)

        gaps = []
        strengths = []
        for bid in BUCKET_IDS:
            i = BUCKET_INDEX[bid]
            local = float(counts[i])
            expected = float(peer_mean[i])
            delta = local - expected
            # Relative undersupply
            score = 0.0
            if expected >= 1.5:
                score = (expected - local) / expected
            elif local == 0 and expected >= 0.8:
                score = 1.0

            item = {
                "id": bid,
                **bucket_fields(bid),
                "count": int(local),
                "peer_avg": round(expected, 1),
                "delta": round(delta, 1),
                "weight": weights[bid],
                "headline": None,
                "headline_es": None,
            }

            if score >= 0.35 and expected >= 1.0:
                item["headline"] = (
                    f"Similar areas usually have ~{expected:.0f}; you have {int(local)}."
                )
                item["headline_es"] = (
                    f"Zonas parecidas suelen tener ~{expected:.0f}; aquí hay {int(local)}."
                )
                item["severity"] = round(min(score * weights[bid], 3.0), 2)
                gaps.append(item)
            elif local >= expected + max(2.0, 0.4 * expected) and local >= 3:
                item["headline"] = (
                    f"Richer than similar areas ({int(local)} vs ~{expected:.0f})."
                )
                item["headline_es"] = (
                    f"Más rico que zonas parecidas ({int(local)} vs ~{expected:.0f})."
                )
                item["severity"] = round(min((local - expected) / max(expected, 1.0), 3.0), 2)
                strengths.append(item)

        gaps.sort(key=lambda x: x.get("severity", 0) * x.get("weight", 1), reverse=True)
        strengths.sort(key=lambda x: x.get("severity", 0), reverse=True)
        return gaps[:5], strengths[:5]

    def _verdict(self, gaps: list[dict], strengths: list[dict], priorities: list[str]) -> dict:
        if priorities:
            pri_buckets = set()
            for p in priorities:
                pri_buckets.update(PRIORITY_WEIGHTS.get(p, {}).keys())
            priority_gaps = [g for g in gaps if g["id"] in pri_buckets]
            if len(priority_gaps) >= 2:
                level = "weak"
                text = "Mixed-to-weak fit for what you care about - a few daily needs look thin here."
                text_es = "Encaje mixto-flojo para lo que te importa - algunas necesidades diarias se ven finas aquí."
            elif len(priority_gaps) == 1:
                level = "mixed"
                text = "Usable fit, with one clear gap for your priorities."
                text_es = "Encaje usable, con un hueco claro para tus prioridades."
            else:
                level = "good"
                text = "Strong fit for what you marked as important."
                text_es = "Buen encaje para lo que marcaste como importante."
        else:
            if len(gaps) >= 3:
                level = "mixed"
                text = "Characterful area with a few real service gaps vs similar SF pockets."
                text_es = "Zona con carácter y algunos huecos reales frente a bolsillos parecidos de SF."
            elif strengths:
                level = "good"
                text = "Well-supplied pocket relative to neighborhoods with a similar mix."
                text_es = "Bolsillo bien abastecido frente a barrios con un mix similar."
            else:
                level = "mixed"
                text = "Sparse signal - try a wider radius or another pin."
                text_es = "Señal escasa - prueba un radio más amplio u otro pin."

        return {"level": level, "text": text, "text_es": text_es}

    def _similar_areas(self, share: np.ndarray, lon: float, lat: float, n: int = 5) -> list[dict]:
        if len(self.cell_vectors) == 0:
            return []
        v = share.copy()
        norm = np.linalg.norm(v)
        if norm < 1e-9:
            return []
        v = v / norm
        sims = self.cell_vectors @ v
        order = np.argsort(-sims)

        out = []
        for idx in order:
            clon, clat = self.cell_centers[idx]
            # skip near-duplicate of current location
            cos_lat = math.cos(math.radians(lat))
            dx = (clon - lon) * M_PER_DEG_LAT * cos_lat
            dy = (clat - lat) * M_PER_DEG_LAT
            dist = math.hypot(dx, dy)
            if dist < 450:
                continue
            cell_counts = self.cell_counts[idx]
            top_i = int(np.argmax(cell_counts))
            out.append(
                {
                    "lon": round(float(clon), 5),
                    "lat": round(float(clat), 5),
                    "similarity": round(float(sims[idx]), 3),
                    "distance_m": int(dist),
                    "top_bucket": BUCKET_IDS[top_i],
                    "top_label": BUCKETS[BUCKET_IDS[top_i]]["label"],
                    "top_label_es": label_for(BUCKET_IDS[top_i], es=True),
                    "place_count": int(cell_counts.sum()),
                }
            )
            if len(out) >= n:
                break
        return out

    def places_in_radius(
        self,
        lon: float,
        lat: float,
        radius_m: float,
        bucket: str | None = None,
        limit: int = 120,
    ) -> list[dict]:
        idxs = self._radius_query(lon, lat, radius_m)
        out: list[dict] = []
        for i in idxs:
            b = self.buckets[i]
            if bucket and b != bucket:
                continue
            if not b:
                continue
            out.append(
                {
                    "name": self.names[i] or "Unknown place",
                    "category": self.categories[i],
                    "address": self.addresses[i],
                    "bucket": b,
                    "lon": float(self.coords_deg[i, 0]),
                    "lat": float(self.coords_deg[i, 1]),
                }
            )
            if len(out) >= limit:
                break
        return out

    def has_bucket_nearby(self, lon: float, lat: float, radius_m: float, bucket: str) -> dict:
        idxs = self._radius_query(lon, lat, radius_m)
        counts = np.zeros(len(BUCKET_IDS), dtype=np.float64)
        found = []
        for i in idxs:
            b = self.buckets[i]
            if b not in BUCKET_INDEX:
                continue
            counts[BUCKET_INDEX[b]] += 1
            if b == bucket and len(found) < 5:
                found.append(
                    {
                        "name": self.names[i] or "Unknown place",
                        "category": self.categories[i],
                        "lon": float(self.coords_deg[i, 0]),
                        "lat": float(self.coords_deg[i, 1]),
                    }
                )

        peers = self._peer_cells(self._share_from_counts(counts))
        peer_avg = float(peers[:, BUCKET_INDEX[bucket]].mean()) if len(peers) else 0.0
        count = int(counts[BUCKET_INDEX[bucket]])
        if count == 0 and peer_avg >= 1.0:
            status = "gap"
        elif count < peer_avg * 0.5 and peer_avg >= 1.5:
            status = "thin"
        else:
            status = "ok" if count else "unknown"
        return {
            "bucket": bucket,
            "label": BUCKETS[bucket]["label"],
            "label_es": label_for(bucket, es=True),
            "status": status,
            "count": count,
            "peer_avg": round(peer_avg, 1),
            "examples": found,
        }

    @staticmethod
    def _share_from_counts(counts: np.ndarray) -> np.ndarray:
        t = counts.sum()
        if t <= 0:
            return counts
        return counts / t
