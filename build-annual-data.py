"""Build annual-snow.json from NOAA's GSOY station archive."""
import argparse
import csv
import io
import json
import math
import re
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FIRST_YEAR = 2000


def read_stations(archive, years):
    stations = []
    with tarfile.open(archive, 'r|gz') as bundle:
        for member in bundle:
            if not re.fullmatch(r'US\w{9}\.csv', Path(member.name).name):
                continue
            with io.StringIO(bundle.extractfile(member).read().decode('utf-8-sig')) as file:
                records = csv.DictReader(file)
                if 'SNOW' not in (records.fieldnames or []):
                    continue
                rows = [row for row in records if row['DATE'] in years and row['SNOW'].strip()]
            if not rows:
                continue
            newest = rows[-1]
            state = re.search(r',\s*([A-Z]{2}) US$', newest['NAME'])
            if not state:
                continue
            totals = {row['DATE']: round(float(row['SNOW'])) for row in rows if float(row['SNOW']) >= 0}
            if len(totals) >= 5:
                stations.append((newest['STATION'], newest['NAME'], float(newest['LATITUDE']),
                    float(newest['LONGITUDE']), state[1], totals))
    return stations


def distance_km(lat, lon, station):
    other_lat, other_lon = station[2:4]
    angle = math.sin(math.radians((lat - other_lat) / 2)) ** 2
    angle += math.cos(math.radians(lat)) * math.cos(math.radians(other_lat)) * math.sin(
        math.radians((lon - other_lon) / 2)) ** 2
    return 12742 * math.asin(min(1, math.sqrt(angle)))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('--last-year', type=int, required=True)
    args = parser.parse_args()
    years = [str(year) for year in range(FIRST_YEAR, args.last_year + 1)]
    stations = read_stations(args.archive, set(years))
    state_codes = 'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split()
    state_points = re.findall(r"\['(\d+)'\s*,\s*'[^']+'\s*,\s*'[^']+'\s*,\s*([\d.]+)\s*,\s*(-[\d.]+)\]", (ROOT / 'states.js').read_text())
    if len(state_points) != 50:
        raise ValueError(f'Expected 50 state locations, got {len(state_points)}')
    state_by_fips = dict(zip((point[0] for point in state_points), state_codes))
    counties = json.loads((ROOT / 'counties.json').read_text())['objects']['counties']['geometries']
    points = {fips: (float(lat), float(lon)) for fips, lat, lon in state_points}
    points.update({county['id']: tuple(county['properties']['location']) for county in counties if county['id'][:2] in state_by_fips})
    in_state = {code: [station for station in stations if station[4] == code] for code in state_codes}
    refs, used = {}, {}
    for fips, (lat, lon) in points.items():
        candidates = in_state[state_by_fips[fips[:2]]]
        ranked = [(distance_km(lat, lon, station), station) for station in candidates]
        ranked = [(distance, station) for distance, station in ranked if distance <= 240 or len(fips) == 2]
        if not ranked:
            continue
        distance, station = min(ranked, key=lambda item: (
            item[0] + 2 * (len(years) - len(item[1][5])), item[1][0]))
        station_id, name, _, _, _, totals = station
        refs[fips] = [station_id, round(distance / 1.609344)]
        used[station_id] = [name, [totals.get(year) for year in years]]
    output = {'firstYear': FIRST_YEAR, 'lastYear': args.last_year, 'locations': refs, 'stations': used}
    with (ROOT / 'annual-snow.json').open('w', encoding='utf-8') as file:
        json.dump(output, file, ensure_ascii=False, separators=(',', ':'))
        file.write('\n')
    print(f'{len(stations)} reporting stations, {len(used)} selected')
    print(f'{len(refs)} of {len(points)} locations have coverage')
    print('States without a GSOY station:', [fips for fips, *_ in state_points if fips not in refs])


if __name__ == '__main__':
    main()
