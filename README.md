# Snow Tracker

Explore annual snowfall records on an interactive 3D map of all 50 U.S. states. Pick a calendar year from 2000 through 2025 or compare average annual snowfall over 5, 10, or 20 years ending in that year. Select a state and choose **Explore counties** to see the county ranking and drill into a county's annual history.

Run from this directory with Python 3.

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open [Snow Tracker](http://127.0.0.1:8765). The site also runs on GitHub Pages. The bundled data requires no runtime weather API, API key, or build.

## Data and coverage

- The map uses station-level annual snowfall, in inches, from [NOAA NCEI Global Summary of the Year](https://www.ncei.noaa.gov/access/search/datasets/global-summary-of-the-year/). These records describe snow that fell during the calendar year. The app displays historical comparisons and has no future annual forecast.
- Each state and county uses a fixed representative station from the same state. Station selection favors proximity to the location's reference point and completeness during the displayed period. County stations can lie in neighboring counties and are limited to about 149 miles from the reference point. The selected station and distance appear on the dashboard. States and counties can vary substantially with elevation.
- Missing annual records stay missing. Period averages use the available years within the selected date range, with coverage shown in the county view and detail panel.
- County boundaries and points follow [U.S. Atlas](https://github.com/topojson/us-atlas), derived from Census cartographic boundaries. Some county equivalents reflect historical boundaries from that release.

Rebuild the annual dataset with the [NOAA bulk station archive](https://www.ncei.noaa.gov/data/global-summary-of-the-year/archive/gsoy-latest.tar.gz) and the last complete calendar year you wish to include.

```sh
python3 build-annual-data.py /path/to/gsoy-latest.tar.gz --last-year 2025
```
