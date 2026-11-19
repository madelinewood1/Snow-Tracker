const variables = 'snowfall_sum,temperature_2m_max';
const base = {
  forecast: 'https://api.open-meteo.com/v1/forecast',
  archive: 'https://archive-api.open-meteo.com/v1/archive',
  pastForecast: 'https://historical-forecast-api.open-meteo.com/v1/forecast',
};

async function request(source, locations, extra) {
  const params = new URLSearchParams({
    latitude: locations.map(location => location.latitude).join(','),
    longitude: locations.map(location => location.longitude).join(','),
    timezone: 'auto',
    daily: source === 'forecast' ? variables : 'snowfall_sum',
    ...extra,
  });
  const response = await fetch(`${base[source]}?${params}`, {signal: AbortSignal.timeout(25000)});
  if (!response.ok) throw new Error(`Weather provider returned HTTP ${response.status}`);
  const data = await response.json();
  const results = Array.isArray(data) ? data : [data];
  if (results.length !== locations.length || results.some(item => !item.daily?.time?.length)) {
    throw new Error('Weather provider returned incomplete data');
  }
  return results.map(item => item.daily.time.map((date, index) => ({
    date,
    snow: item.daily.snowfall_sum?.[index],
    temperature: item.daily.temperature_2m_max?.[index],
  })));
}

export function forecast(locations) {
  return request('forecast', locations, {forecast_days: '7'});
}

export async function history(location, year, december) {
  const dates = {start_date: `${year - 3}-01-01`, end_date: `${year - 1}-12-31`};
  const [archive, prior] = await Promise.allSettled([
    request('archive', [location], {...dates, end_date: december ? `${year}-01-06` : dates.end_date, models: 'era5'}),
    request('pastForecast', [location], dates),
  ]);
  if (archive.status === 'rejected') throw archive.reason;
  const records = archive.value[0];
  const calibration = prior.status === 'fulfilled'
    ? trainCalibration(prior.value[0], records, year - 1)
    : null;
  return {records, calibration};
}

export function trainCalibration(prior, records, validationYear) {
  const reference = new Map(records.map(day => [day.date, day.snow]));
  const pairs = prior.map(day => ({...day, target: reference.get(day.date)}))
    .filter(day => Number.isFinite(day.snow) && Number.isFinite(day.target));
  const train = pairs.filter(day => Number(day.date.slice(0, 4)) < validationYear);
  const validate = pairs.filter(day => Number(day.date.slice(0, 4)) === validationYear);
  const snowy = day => day.snow >= 0.1 || day.target >= 0.1;
  if (train.filter(snowy).length < 20 || validate.filter(snowy).length < 5) return null;

  // Ridge regression through the origin, regularized toward the unadjusted forecast.
  const penalty = 25;
  const numerator = train.reduce((total, day) => total + day.snow * day.target, penalty);
  const denominator = train.reduce((total, day) => total + day.snow ** 2, penalty);
  const scale = Math.max(0.5, Math.min(2, numerator / denominator));
  const mae = factor => validate.reduce((total, day) =>
    total + Math.abs(day.snow * factor - day.target), 0) / validate.length;
  const baselineError = mae(1);
  const fittedError = mae(scale);
  return {factor: fittedError < baselineError ? scale : 1, baselineError, fittedError, validationYear};
}

export function totalSnow(days, count) {
  const window = days?.slice(0, count);
  if (window?.length !== count || window.some(day => !Number.isFinite(day.snow))) return null;
  return window.reduce((total, day) => total + day.snow, 0);
}

export function historicalWindows(records, start, count) {
  const byDate = new Map(records.map(day => [day.date, day]));
  const [year, month, date] = start.split('-').map(Number);
  return [year - 3, year - 2, year - 1].map(pastYear => {
    const first = new Date(Date.UTC(pastYear, month - 1, date));
    const days = Array.from({length: count}, (_, index) => {
      const day = new Date(first);
      day.setUTCDate(day.getUTCDate() + index);
      return byDate.get(day.toISOString().slice(0, 10));
    });
    const snow = first.getUTCMonth() === month - 1 && days.every(Boolean)
      ? totalSnow(days, count) : null;
    return {year: pastYear, snow};
  });
}
