# Snow Tracker

Interactive 3D U.S. snowfall outlook with 1-, 3-, and 7-day totals and comparisons for the same calendar dates over the previous three years.

Run from this directory with Python 3.

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open [Snow Tracker](http://127.0.0.1:8765). The browser needs an internet connection for weather data. No API key or JavaScript build is required.

## Data and model

- Each state uses one labeled representative location. Map colors and height show the provider's forecast at that location. The highlighted state marks the selection.
- The selected location compares upcoming local dates with daily ERA5 snowfall reanalysis from the previous three years. Open-Meteo supplies the forecast, archived forecasts, and reanalysis. Snowfall totals describe newly fallen snow. Snow on the ground can differ due to melting and settling.
- The model fits one regularized scaling coefficient using archived snowfall forecasts paired with reanalysis for the first two years. It uses the adjustment only if it reduces mean absolute error in the third year and enough snow days exist in both periods. Otherwise, it uses the provider forecast. The validation measures agreement with reanalysis on the historical archive. Performance on current multi-day forecasts has not been established.
- The app refreshes forecasts every 30 minutes while visible. A failed refresh preserves the last successful forecast and identifies it as such. Missing values are shown separately from zero snowfall.
- State boundaries come from [U.S. Atlas](https://github.com/topojson/us-atlas), derived from U.S. Census Bureau cartographic boundaries. Alaska and Hawaii appear in insets.

## County view

Select a state and choose **Explore counties** to zoom the map. County and county-equivalent forecasts are ranked by snowfall for the selected 1-, 3-, or 7-day window. Select a county on the map or in the ranking to highlight it. Each forecast uses a single point inside the largest mapped part of that county. Totals can vary elsewhere in the county, especially with elevation. County rankings use the direct provider forecast, while the state panel retains its existing historical comparison and calibration.

County boundaries come from the same U.S. Atlas release as the state boundaries and reflect that release's geography. County data loads on demand and is cached for 30 minutes. The national map and state selector remain available if county data cannot load.
