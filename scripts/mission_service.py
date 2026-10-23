"""Full-dataset shortlist for a time-sensitive visit. Never treats stock as verified."""
import datetime as dt
import json
import math


def schedule_at(shop, departure):
    day = departure.strftime('%a').lower()
    previous = (departure - dt.timedelta(days=1)).strftime('%a').lower()
    minute = departure.hour * 60 + departure.minute
    hours = shop.get('hours') or {}
    def shifts(record):
        for shift in record.get('shifts', []) if record.get('status') == 'declared' else []:
            try:
                a, b = (dt.time.fromisoformat(shift[k]) for k in ('start_time', 'end_time'))
                a, b = a.hour * 60 + a.minute, b.hour * 60 + b.minute
                if a != b: yield a, b
            except (ValueError, KeyError, TypeError): continue
    if any(b < a and minute < b for a, b in shifts(hours.get(previous, {}))): return 'open'
    record = hours.get(day, {})
    if record.get('status') == 'closed': return 'closed'
    valid = list(shifts(record))
    if not valid: return 'unknown'
    return 'open' if any(a <= minute < b if b > a else minute >= a for a, b in valid) else 'closed'


def mission_query(db, q, normalize):
    text = q.get('q', [''])[0].strip()[:200]
    if not text: raise ValueError('A shopping need is required')
    lat, lon = float(q.get('lat', ['nan'])[0]), float(q.get('lon', ['nan'])[0])
    radius = float(q.get('radius', ['2'])[0])
    if not all(math.isfinite(n) for n in (lat, lon, radius)) or not -90 <= lat <= 90 or not -180 <= lon <= 180 or not .1 <= radius <= 30:
        raise ValueError('Invalid location or radius')
    departure = dt.datetime.fromisoformat(q.get('departure', [''])[0])
    if departure.tzinfo is None: raise ValueError('Departure must include timezone')
    departure = departure.astimezone(dt.timezone(dt.timedelta(hours=3, minutes=30)))
    terms = normalize(text + ' ' + q.get('required', [''])[0][:100]).split()
    fts = ' AND '.join('"' + term.replace('"', '""') + '"*' for term in terms)
    conditions = ['p.id IN (SELECT id FROM product_search WHERE product_search MATCH ?)', 's.lat IS NOT NULL', 's.lon IS NOT NULL', 'distance_km(?,?,s.lat,s.lon)<=30']
    args = [fts, lat, lon]
    category = q.get('category', [''])[0][:100]
    if category:
        conditions.append('p.category=?'); args.append(category)
    for field, column in [('excludeOffers', 'o.id'), ('excludeShops', 's.id')]:
        ids = [v for v in q.get(field, [''])[0].split(',') if v][:100]
        if ids:
            conditions.append(column + ' NOT IN (' + ','.join('?' for _ in ids) + ')'); args.extend(ids)
    maximum = q.get('max', [''])[0]
    if maximum:
        maximum = float(maximum)
        if not math.isfinite(maximum) or maximum < 0: raise ValueError('Invalid budget')
        conditions.append('o.price<=?'); args.append(maximum)
    # One best-priced source offer per shop; all matching rows participate before LIMIT.
    sql = '''WITH eligible AS (
      SELECT o.payload offer,p.payload product,s.payload shop,s.id shop_id,
      distance_km(?,?,s.lat,s.lon) distance,
      ROW_NUMBER() OVER(PARTITION BY s.id ORDER BY o.price IS NULL,o.price,o.id) choice
      FROM offers o JOIN products p ON p.id=o.product_id JOIN shops s ON s.id=o.shop_id
      WHERE ''' + ' AND '.join(conditions) + ') SELECT * FROM eligible WHERE choice=1 ORDER BY distance,shop_id'
    rows = db.execute(sql, [lat, lon] + args).fetchall()
    entries = []
    for row in rows:
        entry = {'offer': json.loads(row['offer']), 'product': json.loads(row['product']), 'shop': json.loads(row['shop']), 'distance': row['distance']}
        entry['departureStatus'] = schedule_at(entry['shop'], departure)
        entries.append(entry)
    # Preserve nearer closed shops for explanation, while including farther open/unknown options.
    picked = {}
    for status, limit in [('open', 12), ('unknown', 6), ('closed', 6)]:
        for entry in [e for e in entries if e['departureStatus'] == status][:limit]: picked[entry['shop']['id']] = entry
    chosen = sorted(picked.values(), key=lambda e: e['distance'])
    nearby = [e for e in entries if e['distance'] <= radius]
    return {'entries': chosen, 'totalShops': len(entries), 'nearby': {s: sum(e['departureStatus'] == s for e in nearby) for s in ('open', 'closed', 'unknown')},
            'searchedRadius': 30, 'shortlisted': len(chosen), 'source': 'dataset', 'departure': departure.isoformat()}
