export async function loadAnnualSnow() {
  const response = await fetch('./annual-snow.json');
  if (!response.ok) throw new Error('Annual snowfall records could not load');
  return response.json();
}

export function annualSummary(data, location, year, span) {
  const source = data.locations[location];
  const [stationName, totals] = data.stations[source?.[0]] ?? [];
  const first = Math.max(data.firstYear, year - span + 1);
  const records = Array.from({length: year - first + 1}, (_, index) => ({
    year: first + index,
    snow: totals?.[first + index - data.firstYear] ?? null,
  }));
  const observed = records.filter(record => record.snow !== null);
  const snow = observed.length
    ? observed.reduce((sum, record) => sum + record.snow, 0) / observed.length : null;
  return {stationName, distance: source?.[1], snow, available: observed.length, years: records.length};
}
