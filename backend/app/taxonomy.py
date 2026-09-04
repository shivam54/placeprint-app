"""Map Overture place categories into focused life buckets.

Each bucket is one idea with a short plain-English name — not “X & Y” mashups.
Matching uses underscore segments so short tokens don’t false-positive
(e.g. tea≠team, pub≠public, park≠parking).
"""

from __future__ import annotations

BUCKETS: dict[str, dict[str, str]] = {
    "restaurants": {
        "label": "Restaurants",
        "label_es": "Restaurantes",
        "emoji": "🍜",
        "includes": "Sit-down and casual restaurants",
        "includes_es": "Restaurantes formales y casuales",
    },
    "cafes": {
        "label": "Cafes",
        "label_es": "Cafés",
        "emoji": "☕",
        "includes": "Coffee shops, cafes, tea rooms",
        "includes_es": "Cafeterías, cafés y salas de té",
    },
    "bakeries": {
        "label": "Bakeries",
        "label_es": "Panaderías",
        "emoji": "🥐",
        "includes": "Bakeries only",
        "includes_es": "Solo panaderías",
    },
    "groceries": {
        "label": "Groceries",
        "label_es": "Compras",
        "emoji": "🛒",
        "includes": "Grocery stores and convenience stores",
        "includes_es": "Supermercados y tiendas de conveniencia",
    },
    "pharmacies": {
        "label": "Pharmacies",
        "label_es": "Farmacias",
        "emoji": "💊",
        "includes": "Pharmacies and drugstores",
        "includes_es": "Farmacias",
    },
    "clothing": {
        "label": "Clothing",
        "label_es": "Ropa",
        "emoji": "👕",
        "includes": "Clothing, shoes, jewelry",
        "includes_es": "Ropa, zapatos y joyería",
    },
    "shops": {
        "label": "Shops",
        "label_es": "Tiendas",
        "emoji": "🛍️",
        "includes": "Gifts, furniture, specialty retail",
        "includes_es": "Regalos, muebles y comercio especializado",
    },
    "gyms": {
        "label": "Gyms",
        "label_es": "Gimnasios",
        "emoji": "🏋️",
        "includes": "Gyms and fitness trainers",
        "includes_es": "Gimnasios y entrenadores",
    },
    "studios": {
        "label": "Studios",
        "label_es": "Estudios",
        "emoji": "🧘",
        "includes": "Yoga and pilates studios",
        "includes_es": "Estudios de yoga y pilates",
    },
    "parks": {
        "label": "Parks",
        "label_es": "Parques",
        "emoji": "🌳",
        "includes": "Parks and dog parks — not parking lots",
        "includes_es": "Parques y parques para perros - no estacionamientos",
    },
    "outdoors": {
        "label": "Outdoors",
        "label_es": "Aire libre",
        "emoji": "🥾",
        "includes": "Beaches, trails, outdoor venues",
        "includes_es": "Playas, senderos y espacios al aire libre",
    },
    "daycare": {
        "label": "Daycare",
        "label_es": "Guardería",
        "emoji": "🧒",
        "includes": "Daycare and preschool",
        "includes_es": "Guardería y preescolar",
    },
    "playgrounds": {
        "label": "Playgrounds",
        "label_es": "Parques infantiles",
        "emoji": "🛝",
        "includes": "Playgrounds and toy stores",
        "includes_es": "Parques infantiles y jugueterías",
    },
    "bars": {
        "label": "Bars",
        "label_es": "Bares",
        "emoji": "🍸",
        "includes": "Bars, pubs, wine bars, lounges",
        "includes_es": "Bares, pubs, bares de vino y lounges",
    },
    "museums": {
        "label": "Museums",
        "label_es": "Museos",
        "emoji": "🏛️",
        "includes": "Museums",
        "includes_es": "Museos",
    },
    "galleries": {
        "label": "Galleries",
        "label_es": "Galerías",
        "emoji": "🖼️",
        "includes": "Art galleries",
        "includes_es": "Galerías de arte",
    },
    "theatres": {
        "label": "Theatres",
        "label_es": "Teatros",
        "emoji": "🎭",
        "includes": "Theatres and performance venues",
        "includes_es": "Teatros y salas de espectáculos",
    },
    "cinemas": {
        "label": "Cinemas",
        "label_es": "Cines",
        "emoji": "🎬",
        "includes": "Movie theatres",
        "includes_es": "Cines",
    },
    "libraries": {
        "label": "Libraries",
        "label_es": "Bibliotecas",
        "emoji": "📖",
        "includes": "Public and academic libraries",
        "includes_es": "Bibliotecas públicas y académicas",
    },
    "bookstores": {
        "label": "Bookstores",
        "label_es": "Librerías",
        "emoji": "📚",
        "includes": "Bookstores",
        "includes_es": "Librerías",
    },
    "clinics": {
        "label": "Clinics",
        "label_es": "Clínicas",
        "emoji": "🏥",
        "includes": "Medical clinics and health centers",
        "includes_es": "Clínicas y centros de salud",
    },
    "dentists": {
        "label": "Dentists",
        "label_es": "Dentistas",
        "emoji": "🦷",
        "includes": "Dental care",
        "includes_es": "Cuidado dental",
    },
    "hospitals": {
        "label": "Hospitals",
        "label_es": "Hospitales",
        "emoji": "🏨",
        "includes": "Hospitals",
        "includes_es": "Hospitales",
    },
}



def bucket_fields(bid: str) -> dict[str, str]:
    """Common label/includes payload for analyze responses."""
    b = BUCKETS[bid]
    return {
        "label": b["label"],
        "label_es": b.get("label_es", b["label"]),
        "emoji": b["emoji"],
        "includes": b.get("includes", ""),
        "includes_es": b.get("includes_es", b.get("includes", "")),
    }


def label_for(bid: str, es: bool = False) -> str:
    b = BUCKETS.get(bid) or {}
    if es:
        return b.get("label_es") or b.get("label") or bid
    return b.get("label") or bid

# Priority chips → which focused buckets they emphasize
PRIORITY_WEIGHTS: dict[str, dict[str, float]] = {
    "groceries": {"groceries": 2.4, "pharmacies": 1.4},
    "kids": {"daycare": 2.6, "playgrounds": 2.0, "parks": 1.4, "pharmacies": 1.2},
    "carfree": {"groceries": 2.2, "pharmacies": 1.8, "shops": 1.2, "cafes": 1.1},
    "gym": {"gyms": 2.5, "studios": 1.8},
    "quiet": {"parks": 1.8, "libraries": 1.5, "bookstores": 1.3, "bars": 0.4, "restaurants": 0.7},
    "food": {"restaurants": 1.6, "cafes": 1.4, "bakeries": 1.2, "bars": 1.2},
    "green": {"parks": 2.6, "outdoors": 2.0},
}

# Earlier rules win. Prefer specific buckets before broad ones (shops, restaurants).
_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("cafes", ("coffee", "cafe", "cafeteria", "tea_room", "bubble_tea", "tea")),
    ("bakeries", ("bakery",)),
    (
        "groceries",
        (
            "grocery",
            "supermarket",
            "convenience",
            "food_store",
            "butcher",
            "produce",
            "grocery_store",
            "convenience_store",
            "health_food_store",
        ),
    ),
    ("pharmacies", ("pharmacy", "drugstore")),
    ("bookstores", ("bookstore", "book_store", "academic_bookstore", "used_bookstore")),
    ("libraries", ("library",)),
    (
        "daycare",
        (
            "child_care",
            "childcare",
            "daycare",
            "day_care",
            "preschool",
            "kindergarten",
            "child_care_and_day_care",
            "day_care_preschool",
        ),
    ),
    ("playgrounds", ("playground", "toy_store")),
    ("gyms", ("gym", "fitness", "sports_club", "boxing_gym", "recreation_center")),
    ("studios", ("yoga", "pilates")),
    ("parks", ("park", "dog_park")),
    (
        "outdoors",
        (
            "beach",
            "trail",
            "hiking_trail",
            "recreation",
            "sports_and_recreation_venue",
            "amusement_park",
            "garden",
        ),
    ),
    (
        "bars",
        (
            "bar",
            "pub",
            "nightclub",
            "lounge",
            "brewery",
            "wine_bar",
            "cocktail_bar",
            "beer",
        ),
    ),
    ("museums", ("museum", "art_museum")),
    ("galleries", ("gallery", "art_gallery")),
    (
        "theatres",
        (
            "theatre",
            "theater",
            "performing",
            "theaters_and_performance_venues",
            "cultural",
            "music_venue",
        ),
    ),
    ("cinemas", ("cinema",)),
    ("hospitals", ("hospital",)),
    # animal hospitals stay out — handled by excluding below in bucket_for extras
    ("dentists", ("dentist", "dentistry")),
    (
        "clinics",
        (
            "clinic",
            "doctor",
            "urgent_care",
            "medical",
            "health_and_medical",
            "medical_center",
            "public_health_clinic",
        ),
    ),
    (
        "clothing",
        (
            "clothing",
            "shoe",
            "jewelry",
            "boutique",
            "womens_clothing_store",
            "mens_clothing_store",
        ),
    ),
    (
        "restaurants",
        (
            "restaurant",
            "diner",
            "pizza",
            "sushi",
            "noodle",
            "burger",
            "seafood",
            "steakhouse",
            "steak",
            "bbq",
            "sandwich",
            "fast_food",
            "meal",
            "eat_and_drink",
            "food",
        ),
    ),
    (
        "shops",
        (
            "retail",
            "shop",
            "store",
            "furniture",
            "electronics",
            "mall",
            "shopping",
            "liquor_store",
            "flowers_and_gifts_shop",
        ),
    ),
]


def _token_matches(category: str, token: str) -> bool:
    c = category.lower()
    t = token.lower().strip("_")
    if not t:
        return False
    parts = c.split("_")
    if t in parts:
        return True
    if "_" in token.strip("_") and t in c:
        return True
    if "_" not in t and len(t) >= 6 and t in c:
        return True
    return False


def bucket_for(category: str | None) -> str | None:
    if not category:
        return None
    c = category.lower()
    if c == "parking" or c.startswith("parking_"):
        return None
    if "animal_hospital" in c:
        return None
    for bucket, tokens in _RULES:
        if any(_token_matches(c, tok) for tok in tokens):
            return bucket
    return None


def bucket_meta() -> list[dict]:
    return [
        {
            "id": key,
            **bucket_fields(key),
        }
        for key in BUCKETS
    ]
