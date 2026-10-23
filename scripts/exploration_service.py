"""Explicit, bounded OpenStreetMap exploration. POIs are not product offers."""
import json
import math
import os
import threading
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError

KINDS = {'electronics': 'electronics|mobile_phone|computer', 'clothes': 'clothes|shoes|bag', 'general': 'mall|department_store'}
_cache = {}
_lock = threading.Lock()
_backoff_until = 0


def explore(lat, lon, kind, radius=2000):
    global _backoff_until
    if kind not in KINDS or not all(math.isfinite(x) for x in (lat, lon, radius)) or not -90 <= lat <= 90 or not -180 <= lon <= 180 or not 100 <= radius <= 5000:
        raise ValueError('Invalid exploration request')
    key = (round(lat, 5), round(lon, 5), kind, radius)
    with _lock:
        cached = _cache.get(key)
        if cached and time.time() - cached['fetchedAt'] < (900 if cached['status']=='ready' else 30): return cached
        if time.monotonic() < _backoff_until:
            return {'status': 'unavailable', 'places': [], 'source': 'OpenStreetMap', 'fetchedAt': time.time()}
        query = f'[out:json][timeout:10];nwr(around:{int(radius)},{lat},{lon})[shop~"^({KINDS[kind]})$"];out center tags 60;'
        try:
            request = Request(os.environ.get('TOROB_OVERPASS_URL','https://overpass.private.coffee/api/interpreter'), data=urlencode({'data': query}).encode(), headers={'User-Agent': 'Hodhod-Shopping/1.0', 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json'})
            with urlopen(request, timeout=15) as response: raw = json.loads(response.read(2_000_000))
            places = []
            for item in raw.get('elements', []):
                tags = item.get('tags', {}); center = item.get('center') or item
                x, y = center.get('lat'), center.get('lon')
                if not isinstance(x, (float, int)) or not isinstance(y, (float, int)) or not math.isfinite(x) or not math.isfinite(y) or not -90 <= x <= 90 or not -180 <= y <= 180: continue
                if item.get('type') not in ('node', 'way', 'relation') or not isinstance(item.get('id'), int): continue
                places.append({'id': f"osm-{item['type']}-{item['id']}", 'name': tags.get('name:fa') or tags.get('name') or 'نقطهٔ تجاری بدون نام', 'lat': x, 'lon': y,
                               'kind': tags.get('shop'), 'openingHours': tags.get('opening_hours'), 'sourceUrl': f"https://www.openstreetmap.org/{item['type']}/{item['id']}",
                               'inventory': 'unknown', 'membership': 'unknown'})
            result = {'status': 'ready', 'places': places, 'source': 'OpenStreetMap', 'fetchedAt': time.time()}
            if len(_cache) > 64: _cache.clear()
            _cache[key] = result
            return result
        except (OSError, ValueError, TimeoutError) as error:
            if isinstance(error, HTTPError) and error.code in (406,429): _backoff_until = time.monotonic() + 30
            result = {'status': 'unavailable', 'places': [], 'source': 'OpenStreetMap', 'fetchedAt': time.time()}
            _cache[key] = result
            return result
