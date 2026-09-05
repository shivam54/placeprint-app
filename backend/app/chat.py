"""Neighborhood guide chat - Claude when keyed, local fallback otherwise.

Grounded in the current pin's Overture analysis (DNA, gaps, strengths,
similar areas, example place names) plus live Open-Meteo weather for the pin.
Not a general SF chatbot.
"""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from typing import Any

from . import weather as weather_mod

CLAUDE_MODEL = "claude-haiku-4-5-20251001"


def reply(
    message: str,
    analysis: dict[str, Any] | None,
    lang: str = "en",
    history: list[dict[str, str]] | None = None,
    weather: dict[str, Any] | None = None,
) -> dict:
    text = (message or "").strip()
    es = lang.lower().startswith("es")
    if not text:
        return {
            "reply": "Pregúntame algo sobre este barrio." if es else "Ask me something about this area.",
            "suggestions": _suggestions(es),
            "source": "local",
        }

    if analysis is None:
        return {
            "reply": (
                "Elige un punto en el mapa primero y te cuento la tela del barrio."
                if es
                else "Pick a spot on the map first - then I can read the fabric with you."
            ),
            "suggestions": _suggestions(es),
            "source": "local",
        }

    context = _build_context(analysis, es=es)
    # Prefer client-provided weather (browser can reach Open-Meteo when Render cannot)
    wx = _sanitize_weather(weather)
    if not wx:
        center = analysis.get("center") or {}
        try:
            lat = float(center.get("lat"))
            lon = float(center.get("lon"))
            wx = weather_mod.fetch_current(lat, lon)
        except (TypeError, ValueError):
            wx = None
    if wx:
        if es:
            wx = {**wx, "condition": weather_mod.condition_es(wx.get("condition"))}
        context["weather"] = wx

    claude = _claude_chat(text, context, lang, history or [])
    if claude:
        return claude

    out = _local_reply(text, analysis, es, context.get("weather"))
    out["source"] = "local"
    return out


def _sanitize_weather(raw: dict[str, Any] | None) -> dict[str, Any] | None:
    """Accept only the Open-Meteo fields we already use — never free-form client text as facts."""
    if not isinstance(raw, dict):
        return None
    try:
        temp_f = float(raw.get("temp_f"))
        feels = float(raw.get("feels_like_f", temp_f))
        wind = float(raw.get("wind_mph", 0))
        humidity = int(raw.get("humidity_pct", 0))
        code = int(raw.get("weather_code", 0))
    except (TypeError, ValueError):
        return None
    if not (-40.0 <= temp_f <= 130.0):
        return None
    condition = str(raw.get("condition") or "").strip()[:48]
    if not condition:
        condition = weather_mod.condition_from_code(code)
    return {
        "source": "Open-Meteo",
        "temp_f": round(temp_f, 1),
        "feels_like_f": round(feels, 1),
        "condition": condition,
        "weather_code": code,
        "is_day": bool(raw.get("is_day", True)),
        "wind_mph": round(wind, 1),
        "humidity_pct": max(0, min(100, humidity)),
    }


def _lab(row: dict[str, Any] | None, es: bool, key: str = "label") -> str:
    if not row:
        return ""
    if es:
        return str(row.get(f"{key}_es") or row.get(key) or "")
    return str(row.get(key) or "")


def _build_context(analysis: dict[str, Any], es: bool = False) -> dict[str, Any]:
    """Compact facts Claude may use - no inventing beyond this."""
    center = analysis.get("center") or {}
    dna_rows = []
    for d in (analysis.get("dna") or [])[:14]:
        examples = [
            e.get("name")
            for e in (d.get("examples") or [])[:4]
            if e.get("name")
        ]
        dna_rows.append(
            {
                "category": _lab(d, es),
                "id": d.get("id"),
                "count": d.get("count"),
                "share_pct": int(round(float(d.get("share") or 0) * 100)),
                "city_percentile": d.get("city_percentile"),
                "example_places": examples,
            }
        )

    def _gapish(rows: list) -> list[dict]:
        out = []
        for g in rows[:5]:
            out.append(
                {
                    "category": _lab(g, es),
                    "id": g.get("id"),
                    "count_here": g.get("count"),
                    "peer_avg": g.get("peer_avg"),
                    "note": (g.get("headline_es") if es else None) or g.get("headline"),
                }
            )
        return out

    similar = []
    for i, s in enumerate((analysis.get("similar") or [])[:5], 1):
        similar.append(
            {
                "pin": i,
                "similarity_pct": int(min(float(s.get("similarity") or 0), 1) * 100),
                "distance_km": round(float(s.get("distance_m") or 0) / 1000, 1),
                "top_category": _lab(s, es, "top_label"),
                "place_count": s.get("place_count"),
            }
        )

    verdict = analysis.get("verdict") or {}
    why = analysis.get("why") or {}
    return {
        "city": "San Francisco",
        "dataset": "Overture Maps places extract (SF)",
        "center": {"lon": center.get("lon"), "lat": center.get("lat")},
        "walk_radius_m": analysis.get("radius_m"),
        "places_in_radius": analysis.get("place_count"),
        "personality": (
            (analysis.get("personality_es") if es else None) or analysis.get("personality")
        ),
        "verdict": {
            "level": verdict.get("level"),
            "text": (verdict.get("text_es") if es else None) or verdict.get("text"),
        },
        "category_mix": dna_rows,
        "thinner_than_similar_blocks": _gapish(analysis.get("gaps") or []),
        "stronger_than_similar_blocks": _gapish(analysis.get("strengths") or []),
        "similar_blocks_on_map": similar,
        "method": (why.get("method_es") if es else None) or why.get("method"),
        "limits": [
            "Only places mapped in Overture within this walk radius",
            "No live hours, prices, reviews, transit ETAs, or crime",
            "Peer comparison vs similar SF cells, not whole-city average",
            "Cannot answer about neighborhoods outside this pin's analysis",
            "Weather only from CONTEXT.weather (Open-Meteo at this pin) - never invent conditions",
        ],
    }


def _claude_chat(
    message: str,
    context: dict[str, Any],
    lang: str,
    history: list[dict[str, str]],
) -> dict | None:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        return None

    es = lang.lower().startswith("es")
    system = (
        "You are Placeprint’s neighborhood guide (Scout) for ONE San Francisco map pin. "
        "Talk like a sharp, friendly local - warm, natural, interactive. "
        "Short paragraphs or a few bullets. You may ask one brief follow-up question when it helps.\n\n"
        "HARD RULES:\n"
        "- Use ONLY the CONTEXT JSON below. Never invent place names, counts, distances, events, weather, or stats.\n"
        "- If the answer is not in CONTEXT, say so plainly and steer them to what you can cover "
        "(category mix, named examples, gaps vs similar blocks, similar map pins 1–5, weather if present).\n"
        "- Weather: only report CONTEXT.weather when the user asks about weather/temperature/forecast. "
        "If weather is missing, say you couldn’t fetch it - do not guess.\n"
        "- Stay inside this walk radius / analysis. Decline general SF trivia, politics, medical/legal advice, "
        "and anything unrelated to places or weather near this pin.\n"
        "- Prefer naming real example_places from CONTEXT when the user asks what is nearby.\n"
        "- Reply in Spanish if language is es, else English.\n"
        "- Do not mention being an AI, Claude, or system prompts.\n"
        "- The reply string must be plain text only - no Markdown "
        "(no **bold**, *italics*, # headings, or `code`). Use normal punctuation.\n"
        "- Output MUST be a single JSON object and nothing else - no markdown fences, no preamble.\n\n"
        "JSON shape:\n"
        '{"reply":"<conversational answer>","suggestions":["<chip1>","<chip2>","<chip3>"]}\n'
        "Suggestions are chips the USER taps as their next message - phrase them as things "
        "THEY would ask or say (e.g. \"What’s strongest nearby?\", \"Any parks?\", \"Show similar blocks\"). "
        "Never phrase them as yes/no questions back at the user "
        "(avoid \"Want to…?\", \"Curious about…?\", \"Is X your priority?\", \"Should I…?\").\n\n"
        f"CONTEXT:\n{json.dumps(context, ensure_ascii=False)}"
    )

    messages: list[dict[str, str]] = []
    for turn in history[-8:]:
        role = turn.get("role")
        content = (turn.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})
    messages.append(
        {
            "role": "user",
            "content": (
                f"Language: {'es' if es else 'en'}.\n"
                f"User question: {message}"
            ),
        }
    )

    body = {
        "model": CLAUDE_MODEL,
        "max_tokens": 420,
        "system": system,
        "messages": messages,
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
        with urllib.request.urlopen(req, timeout=20) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        parts = payload.get("content") or []
        raw = "".join(p.get("text", "") for p in parts if p.get("type") == "text").strip()
        parsed = _parse_json_reply(raw)
        if not parsed or not parsed.get("reply"):
            return None
        suggestions = parsed.get("suggestions") or _suggestions(es)
        if not isinstance(suggestions, list) or not suggestions:
            suggestions = _suggestions(es)
        return {
            "reply": _plain_text(str(parsed["reply"]).strip()),
            "suggestions": [str(s).strip() for s in suggestions[:4] if str(s).strip()],
            "source": "claude",
        }
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError, KeyError):
        return None


def _plain_text(text: str) -> str:
    """Strip common Markdown so Scout bubbles stay plain chat text."""
    out = text
    out = re.sub(r"\*\*(.+?)\*\*", r"\1", out)
    out = re.sub(r"__(.+?)__", r"\1", out)
    out = re.sub(r"(?<!\w)\*(.+?)\*(?!\w)", r"\1", out)
    out = re.sub(r"(?<!\w)_(.+?)_(?!\w)", r"\1", out)
    out = re.sub(r"`([^`]+)`", r"\1", out)
    out = re.sub(r"^#{1,6}\s*", "", out, flags=re.MULTILINE)
    return out.strip()


def _parse_json_reply(raw: str) -> dict[str, Any] | None:
    text = raw.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    # Prefer a JSON object if the model mixed prose + JSON
    candidates: list[str] = [text]
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        candidates.insert(0, text[start : end + 1])

    for candidate in candidates:
        try:
            data = json.loads(candidate)
            if isinstance(data, dict) and data.get("reply"):
                return data
        except json.JSONDecodeError:
            continue

    # Last resort: treat whole string as conversational reply (strip trailing JSON blob)
    cleaned = text
    if start != -1 and end > start and end == len(text) - 1:
        cleaned = text[:start].strip()
    if cleaned:
        return {"reply": cleaned, "suggestions": []}
    return None


def _local_reply(
    text: str,
    analysis: dict[str, Any],
    es: bool,
    weather: dict[str, Any] | None = None,
) -> dict:
    q = text.lower()
    gaps = analysis.get("gaps") or []
    strengths = analysis.get("strengths") or []
    dna = analysis.get("dna") or []
    similar = analysis.get("similar") or []
    verdict = analysis.get("verdict") or {}
    personality = (
        (analysis.get("personality_es") if es else None) or analysis.get("personality") or ""
    )
    verdict_text = (verdict.get("text_es") if es else None) or verdict.get("text") or ""
    place_count = analysis.get("place_count") or 0

    if _match(q, ("weather", "temperature", "forecast", "clima", "tiempo hoy", "hace frío", "hace frio", "how hot", "how cold", "rain today")):
        if weather:
            return {
                "reply": weather_mod.format_line(weather, es),
                "suggestions": _suggestions(es),
            }
        return {
            "reply": (
                "No pude obtener el clima ahora mismo - pregunta de nuevo en un momento."
                if es
                else "Couldn’t fetch weather just now - try again in a moment."
            ),
            "suggestions": _suggestions(es),
        }

    if _match(q, ("hola", "hello", "hi", "hey", "buenas")):
        return {
            "reply": (
                f"Hola - aquí veo {place_count} lugares. {personality} ¿Qué quieres saber: huecos, fortalezas o sitios parecidos?"
                if es
                else f"Hey - I’m looking at {place_count} places here. {personality} Ask about gaps, strengths, or similar spots."
            ),
            "suggestions": _suggestions(es),
        }

    if _match(q, ("gap", "missing", "falta", "hueco", "escas", "hard to find", "dificil", "difícil")):
        if not gaps:
            return {
                "reply": (
                    "En este radio no hay huecos claros frente a barrios parecidos. Prueba un radio más amplio o otra zona."
                    if es
                    else "No sharp gaps vs similar pockets in this radius. Try a wider walk or another pin."
                ),
                "suggestions": _suggestions(es),
            }
        lines = []
        for g in gaps[:4]:
            lines.append(
                f"• {g.get('emoji', '')} {_lab(g, es)}: {g.get('count')} aquí vs ~{g.get('peer_avg')} en pares"
                if es
                else f"• {g.get('emoji', '')} {_lab(g, es)}: {g.get('count')} here vs ~{g.get('peer_avg')} in peer areas"
            )
        intro = "Lo más difícil de encontrar cerca:" if es else "Hardest to find nearby:"
        return {"reply": intro + "\n" + "\n".join(lines), "suggestions": _suggestions(es)}

    if _match(q, ("strong", "rich", "fortalez", "mejor", "good at", "abunda")):
        if not strengths:
            return {
                "reply": "No hay fortalezas destacadas aún." if es else "No standout strengths yet.",
                "suggestions": _suggestions(es),
            }
        lines = [
            f"• {s.get('emoji', '')} {_lab(s, es)}: {s.get('count')} (pares ~{s.get('peer_avg')})"
            for s in strengths[:4]
        ]
        intro = "Donde este bolsillo es rico:" if es else "Where this pocket is rich:"
        return {"reply": intro + "\n" + "\n".join(lines), "suggestions": _suggestions(es)}

    if _match(q, ("similar", "parecid", "like this", "twin", "doppel", "igual")):
        if not similar:
            return {
                "reply": "No encontré gemelos claros." if es else "No clear twins found.",
                "suggestions": _suggestions(es),
            }
        lines = []
        for i, s in enumerate(similar[:5], 1):
            km = round(s.get("distance_m", 0) / 1000, 1)
            sim = int(min(s.get("similarity", 0), 1) * 100)
            lines.append(f"• #{i} {sim}% · {_lab(s, es, 'top_label')} · ~{km} km")
        intro = (
            "Zonas que se sienten parecidas (pin 1–5 en el mapa):"
            if es
            else "Areas that feel similar (pins 1–5 on the map):"
        )
        return {"reply": intro + "\n" + "\n".join(lines), "suggestions": _suggestions(es)}

    if _match(q, ("dna", "vibe", "personality", "como es", "cómo es", "feel", "mix", "composición", "composicion")):
        top = dna[:5]
        mix = ", ".join(
            f"{d.get('emoji', '')} {int(d.get('share', 0) * 100)}% {_lab(d, es)}" for d in top
        )
        level = verdict.get("level", "mixed")
        return {
            "reply": (
                f"ADN del barrio: {mix}.\nVeredicto ({level}): {verdict_text}\n{personality}"
                if es
                else f"Neighborhood DNA: {mix}.\nVerdict ({level}): {verdict_text}\n{personality}"
            ),
            "suggestions": _suggestions(es),
        }

    bucket_hints = {
        "pharmacies": ("pharmacy", "pharmacies", "farmacia", "farmacias", "drugstore"),
        "daycare": ("daycare", "preschool", "childcare", "niñ", "infantil"),
        "playgrounds": ("playground", "playgrounds", "toy"),
        "gyms": ("gym", "gyms", "fitness", "gimnasio"),
        "studios": ("yoga", "pilates"),
        "parks": ("park", "parks", "parque"),
        "outdoors": ("beach", "trail", "outdoor", "verde", "green"),
        "restaurants": ("restaurant", "restaurants", "food", "comida", "eat", "cena"),
        "bars": ("bar", "bars", "nightlife", "noche", "drink", "pub"),
        "bookstores": ("bookstore", "bookstores", "book shop"),
        "libraries": ("library", "libraries", "librer"),
        "museums": ("museum", "museums", "museo"),
        "galleries": ("gallery", "galleries", "galería", "galeria"),
        "theatres": ("theatre", "theater", "teatro"),
        "cinemas": ("cinema", "cinemas", "movie", "cine"),
        "clinics": ("clinic", "clinics", "doctor", "medical"),
        "dentists": ("dentist", "dentists", "dental", "dentista"),
        "hospitals": ("hospital", "hospitals"),
        "clothing": ("clothing", "fashion", "ropa"),
        "shops": ("shop", "shops", "shopping", "tienda", "retail"),
        "cafes": ("coffee", "cafe", "café", "cafes", "cafés"),
        "bakeries": ("bakery", "bakeries", "pastry"),
        "groceries": ("grocery", "groceries", "grocer", "supermarket", "mercado"),
    }
    for bid, keys in bucket_hints.items():
        if _match(q, keys):
            row = next((d for d in dna if d.get("id") == bid), None)
            gap = next((g for g in gaps if g.get("id") == bid), None)
            names = [e.get("name") for e in (row.get("examples") or []) if e.get("name")] if row else []
            name_bit = ""
            if names:
                name_bit = (
                    f" Ejemplos: {', '.join(names[:3])}."
                    if es
                    else f" Examples: {', '.join(names[:3])}."
                )
            if gap:
                reply_txt = (
                    f"{gap.get('emoji')} {_lab(gap, es)}: solo {gap.get('count')} aquí; áreas parecidas suelen tener ~{gap.get('peer_avg')}. Eso es un hueco.{name_bit}"
                    if es
                    else f"{gap.get('emoji')} {_lab(gap, es)}: only {gap.get('count')} here; similar areas usually have ~{gap.get('peer_avg')}. That’s a gap.{name_bit}"
                )
            elif row:
                reply_txt = (
                    f"{row.get('emoji')} {_lab(row, es)}: {row.get('count')} lugares ({int(row.get('share', 0) * 100)}% del mix). Más que el {row.get('city_percentile')}% de celdas de SF.{name_bit}"
                    if es
                    else f"{row.get('emoji')} {_lab(row, es)}: {row.get('count')} places ({int(row.get('share', 0) * 100)}% of the mix). More than {row.get('city_percentile')}% of SF cells.{name_bit}"
                )
            else:
                reply_txt = (
                    "Casi no hay señales de esa categoría en este radio."
                    if es
                    else "Almost no signal for that category in this radius."
                )
            return {"reply": reply_txt, "suggestions": _suggestions(es)}

    if _match(q, ("live", "vivir", "move", "mudar", "apartment", "depto", "should i")):
        return {
            "reply": (
                f"Para vivir aquí: veredicto {verdict.get('level')} - {verdict_text} "
                f"Marca prioridades arriba (niños, sin auto, etc.) y te recalibro los huecos al instante."
                if es
                else f"For living here: verdict {verdict.get('level')} - {verdict_text} "
                f"Toggle priorities above (kids, car-free, etc.) and I’ll recalibrate gaps live."
            ),
            "suggestions": _suggestions(es),
        }

    if es:
        gap_bit = f"Hueco top: {_lab(gaps[0], es)}." if gaps else "Sin huecos fuertes."
        reply_txt = (
            f"Resumen rápido: {personality} {gap_bit} Puedes preguntar por café, farmacias, niños, o “zonas parecidas”."
        )
    else:
        gap_bit = f"Top gap: {_lab(gaps[0], es)}." if gaps else "No strong gaps."
        reply_txt = (
            f"Quick read: {personality} {gap_bit} Try asking about coffee, pharmacies, kids, or “similar areas”."
        )
    return {"reply": reply_txt, "suggestions": _suggestions(es)}


def _suggestions(es: bool) -> list[str]:
    if es:
        return [
            "Qué tiempo hace hoy",
            "Qué falta cerca",
            "Cafés cerca",
            "Zonas parecidas",
        ]
    return [
        "What’s the weather today",
        "What’s missing nearby",
        "Cafes nearby",
        "Similar areas",
    ]



def _match(q: str, keys: tuple[str, ...]) -> bool:
    return any(k in q for k in keys)
