"""Light in-process observability for the Placeprint demo.

Structured logs + counters for costly/breakable paths (analyze, summary, chat)
and a few product events. No PII: coordinates are rounded; chat text is not stored.
"""

from __future__ import annotations

import logging
import threading
import time
from collections import Counter
from contextlib import contextmanager
from typing import Any, Iterator

logger = logging.getLogger("placeprint")
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s [placeprint] %(message)s")
    )
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

_lock = threading.Lock()
_started = time.time()
_counters: Counter[str] = Counter()
_timings_ms: dict[str, list[float]] = {
    "analyze": [],
    "summary": [],
    "chat": [],
    "places": [],
}
_MAX_SAMPLES = 200


def _note_timing(name: str, ms: float) -> None:
    bucket = _timings_ms.setdefault(name, [])
    bucket.append(ms)
    if len(bucket) > _MAX_SAMPLES:
        del bucket[: len(bucket) - _MAX_SAMPLES]


def incr(name: str, n: int = 1) -> None:
    with _lock:
        _counters[name] += n


def track_event(name: str, props: dict[str, Any] | None = None) -> None:
    """Product / UI event (no free-text user content)."""
    safe = {k: v for k, v in (props or {}).items() if k not in {"message", "text", "reply"}}
    incr(f"event.{name}")
    logger.info("event name=%s %s", name, safe)


@contextmanager
def timed(op: str, **fields: Any) -> Iterator[dict[str, Any]]:
    """Time a block; caller may set extra fields on the returned dict."""
    meta: dict[str, Any] = dict(fields)
    t0 = time.perf_counter()
    ok = True
    try:
        yield meta
    except Exception as exc:
        ok = False
        meta["error"] = type(exc).__name__
        incr(f"{op}.error")
        raise
    finally:
        ms = round((time.perf_counter() - t0) * 1000, 1)
        with _lock:
            _note_timing(op, ms)
            if ok:
                _counters[f"{op}.ok"] += 1
        bits = " ".join(f"{k}={v}" for k, v in meta.items())
        logger.info("%s duration_ms=%s ok=%s %s", op, ms, ok, bits)


def round_coord(v: float, nd: int = 3) -> float:
    return round(float(v), nd)


def snapshot() -> dict[str, Any]:
    with _lock:
        timings: dict[str, Any] = {}
        for name, samples in _timings_ms.items():
            if not samples:
                timings[name] = {"count": 0}
                continue
            s = sorted(samples)
            timings[name] = {
                "count": len(s),
                "p50_ms": s[len(s) // 2],
                "p95_ms": s[max(0, int(len(s) * 0.95) - 1)],
                "last_ms": samples[-1],
            }
        return {
            "uptime_sec": int(time.time() - _started),
            "counters": dict(_counters),
            "timings": timings,
        }
