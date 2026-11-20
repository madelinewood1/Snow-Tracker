import {states} from './states.js';
import {createMap} from './map.js';
import {countiesIn, countyForecasts, rankCounties} from './counties.js';
import {forecast, history, historicalWindows, totalSnow} from './weather.js';

const get = id => document.getElementById(id);
const byId = new Map(states.map(state => [state.id, state]));
const forecasts = new Map(), histories = new Map();
const inches = (cm, digits = 1) => cm === null ? '—' : (cm / 2.54).toFixed(digits);
const dateLabel = new Intl.DateTimeFormat('en-US', {
  weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
});
let selected = '08', count = 3, map, countyView;

function element(tag, content, className) {
  const node = document.createElement(tag);
  if (content !== undefined) node.textContent = content;
  if (className) node.className = className;
  return node;
}

function render() {
  const state = byId.get(selected);
  const days = forecasts.get(selected);
  const previous = histories.get(selected);
  const calibration = previous?.calibration;
  const factor = calibration?.factor ?? 1;
  const raw = totalSnow(days, count);
  const estimate = raw === null ? null : raw * factor;
  const historical = previous?.records && days
    ? historicalWindows(previous.records, days[0].date, count) : [];
  const comparable = historical.filter(item => item.snow !== null);
  const mean = comparable.length
    ? comparable.reduce((sum, item) => sum + item.snow, 0) / comparable.length : null;

  get('state').value = selected;
  get('detail-title').textContent = state.name;
  get('location').textContent = `Forecast location · ${state.city}`;
  get('prediction-label').textContent = `${count}-DAY SNOWFALL ESTIMATE`;
  get('estimate').textContent = inches(estimate);
  get('comparison').textContent = estimate === null ? 'Forecast unavailable for this window'
    : mean === null ? 'Historical average unavailable'
    : `${inches(mean)} in average across ${comparable.length} comparable years`;
  get('model-note').textContent = estimate === null ? '' : calibration
    ? calibration.factor !== 1
      ? `Calibrated from ${inches(raw)} in. ${calibration.validationYear} daily error was ${inches(calibration.fittedError, 3)} in vs. ${inches(calibration.baselineError, 3)} in for archived forecasts.`
      : 'Using the provider forecast. Calibration did not improve the held-out comparison.'
    : previous && !previous.loading ? 'Using the provider forecast. Calibration is unavailable for this location.'
    : 'Using the provider forecast while historical data loads.';
  const daily = get('daily');
  daily.replaceChildren(...(days ? days.slice(0, count).map(day => {
    const row = element('div', undefined, 'daily-row');
    row.append(element('span', dateLabel.format(new Date(day.date))),
      element('span', Number.isFinite(day.temperature) ? `${Math.round(day.temperature * 9 / 5 + 32)}°F` : '—'),
      element('strong', Number.isFinite(day.snow) ? `${inches(day.snow * factor)} in` : '—'));
    return row;
  }) : [element('p', 'Daily forecast unavailable.', 'empty')]));

  const chart = get('history');
  chart.replaceChildren();
  if (!historical.length) {
    chart.append(element('p', !previous ? 'The forecast feed sets the dates for comparison.'
      : previous.loading ? `Loading historical snowfall for ${state.city}…`
      : 'Historical comparison is unavailable for this forecast window.', 'empty'));
  } else {
    const rows = [...historical.map(item => [String(item.year), item.snow]), ['Estimate', estimate]];
    const max = Math.max(1, ...rows.map(([, snow]) => snow ?? 0));
    for (const [label, snow] of rows) {
      const row = element('div', undefined, 'history-row');
      const track = element('div', undefined, 'track');
      track.setAttribute('aria-hidden', 'true');
      const bar = element('div', undefined, 'bar');
      bar.style.width = `${(snow ?? 0) / max * 100}%`;
      track.append(bar);
      row.append(element('span', label), track, element('strong', snow === null ? '—' : `${inches(snow)} in`));
      chart.append(row);
    }
  }
  const values = new Map(states.map(({id}) => [id, totalSnow(forecasts.get(id), count)]));
  if (countyView) renderCounties();
  else {
    get('county-toggle').textContent = `Explore ${state.name} counties`;
    map?.update(selected, values);
  }
}

async function loadHistory(id) {
  const first = forecasts.get(id)?.[0]?.date;
  if (!first) return;
  const year = Number(first.slice(0, 4));
  const december = first.slice(5, 7) === '12';
  const key = `${year}-${december}`;
  const cached = histories.get(id);
  if (cached?.key === key && (cached.loading || cached.records)) return;
  const pending = {key, loading: true};
  histories.set(id, pending);
  if (id === selected) render();
  let result = {key};
  try {
    result = {key, ...await history(byId.get(id), year, december)};
  } catch (error) {
    console.warn('Historical feed unavailable', error);
  }
  if (histories.get(id) !== pending) return;
  histories.set(id, result);
  if (id === selected) render();
}

function renderCounties() {
  const {counties, selectedId, stateId, result, loading, error} = countyView;
  const state = byId.get(stateId);
  const ranking = rankCounties(counties, result?.days, count);
  const available = ranking.filter(county => county.snow !== null).length;
  get('county-title').textContent = `${state.name} · ${count}-day county snowfall`;
  get('county-summary').textContent = error ? 'County boundaries unavailable'
    : loading ? 'Loading county forecasts…'
    : result?.refreshFailed && available ? `${available}/${ranking.length} forecasts available · refresh incomplete`
    : available ? `${available}/${ranking.length} forecasts available`
    : 'County forecasts unavailable';

  const active = ranking.find(county => county.id === selectedId);
  get('county-selection').textContent = active
    ? `${active.name} · ${active.snow === null ? 'Forecast unavailable' : `${inches(active.snow)} in forecast`}`
    : 'Select a county on the map or in the ranking.';
  const list = get('county-ranking');
  const scroll = list.scrollTop;
  const focused = list.contains(document.activeElement);
  list.replaceChildren(...ranking.map(county => {
    const item = element('li');
    const button = element('button');
    button.type = 'button';
    button.dataset.county = county.id;
    button.setAttribute('aria-pressed', county.id === selectedId);
    button.append(element('span', county.name),
      element('strong', county.snow === null ? 'No data' : `${inches(county.snow)} in`));
    item.append(button);
    return item;
  }));
  if (focused) list.querySelector(`[data-county="${selectedId}"]`)?.focus({preventScroll: true});
  list.scrollTop = scroll;
  map?.update(selectedId, new Map(ranking.map(county => [county.id, county.snow])));
}

async function refreshCounties(view, force = false) {
  if (view.refreshing || !view.counties.length) return;
  view.refreshing = true;
  view.result = await countyForecasts(view.stateId, view.counties, force);
  view.refreshing = false;
  view.loading = false;
  if (countyView === view) renderCounties();
}

async function showCounties() {
  const view = {stateId: selected, counties: [], loading: true};
  countyView = view;
  map.setCounties([]);
  get('tooltip').hidden = true;
  get('county-toggle').textContent = 'Back to U.S. map';
  get('county-toggle').setAttribute('aria-pressed', 'true');
  get('county-panel').hidden = false;
  get('map-subtitle').textContent = `${byId.get(selected).name} · one forecast location per county or equivalent`;
  get('map-action').textContent = 'Click a county to select it';
  get('county-ranking').scrollTop = 0;
  renderCounties();
  try {
    view.counties = await countiesIn(view.stateId);
    if (countyView !== view) return;
    if (!view.counties.length) throw new Error('No county boundaries for the selected state');
    map.setCounties(view.counties);
    renderCounties();
    await refreshCounties(view);
  } catch (error) {
    console.warn('County view unavailable', error);
    view.loading = false;
    view.error = true;
    if (countyView === view) renderCounties();
  }
}

function hideCounties() {
  countyView = undefined;
  map.setCounties(null);
  get('tooltip').hidden = true;
  get('county-toggle').setAttribute('aria-pressed', 'false');
  get('county-panel').hidden = true;
  get('county-summary').textContent = '';
  get('map-subtitle').textContent = 'One forecast location per state';
  get('map-action').textContent = 'Click a state to select it';
  render();
}

function pickCounty(id) {
  if (!countyView?.counties.some(county => county.id === id)) return;
  countyView.selectedId = id;
  get('tooltip').hidden = true;
  renderCounties();
  get('county-ranking').querySelector(`[data-county="${id}"]`)
    ?.scrollIntoView({block: 'nearest', container: 'nearest'});
}

function select(id) {
  if (!byId.has(id)) return;
  selected = id;
  if (countyView) void showCounties();
  get('tooltip').hidden = true;
  render();
  void loadHistory(id);
}

async function refresh() {
  const button = get('refresh'), status = get('status');
  if (button.disabled) return;
  button.disabled = true;
  status.textContent = 'Updating forecasts…';
  if (countyView) void refreshCounties(countyView, true);
  try {
    const results = await forecast(states);
    results.forEach((days, index) => forecasts.set(states[index].id, days));
    const time = new Intl.DateTimeFormat('en-US', {hour: 'numeric', minute: '2-digit'}).format(new Date());
    status.textContent = `Updated ${time}`;
    render();
    void loadHistory(selected);
  } catch (error) {
    console.warn('Forecast feed unavailable', error);
    status.textContent = forecasts.size ? 'Refresh failed · showing last forecast' : 'Forecast feed unavailable';
  } finally {
    button.disabled = false;
  }
}

function hover(id, x, y) {
  const tooltip = get('tooltip');
  const location = countyView ? countyView.counties.find(county => county.id === id) : byId.get(id);
  tooltip.hidden = !location;
  if (tooltip.hidden) return;
  const snow = totalSnow(countyView ? countyView.result?.days.get(id) : forecasts.get(id), count);
  tooltip.textContent = `${location.name} · ${snow === null ? 'No forecast' : `${inches(snow)} in`}`;
  tooltip.style.left = `${Math.max(6, Math.min(x + 10, get('map').clientWidth - tooltip.offsetWidth - 6))}px`;
  tooltip.style.top = `${Math.max(6, y - 39)}px`;
}

get('state').replaceChildren(...states.map(state => {
  const option = element('option', state.name);
  option.value = state.id;
  return option;
}));
get('state').addEventListener('change', event => select(event.target.value));
get('windows').addEventListener('click', event => {
  if (!event.target.matches('[data-days]')) return;
  count = Number(event.target.dataset.days);
  for (const button of get('windows').children) button.setAttribute('aria-pressed', button === event.target);
  render();
});
get('refresh').addEventListener('click', refresh);
get('county-toggle').addEventListener('click', () => countyView ? hideCounties() : void showCounties());
get('county-ranking').addEventListener('click', event => {
  const button = event.target.closest('[data-county]');
  if (button) pickCounty(button.dataset.county);
});
get('zoom-in').addEventListener('click', () => map?.zoom(0.15));
get('zoom-out').addEventListener('click', () => map?.zoom(-0.15));
get('tilt').addEventListener('click', () => map?.tilt(0.15));
get('reset').addEventListener('click', () => map?.reset());
render();
createMap(get('map'), states.map(state => state.id), id => countyView ? pickCounty(id) : select(id), hover).then(instance => {
  map = instance;
  get('county-toggle').disabled = false;
  render();
}).catch(error => {
  console.warn(error);
  get('map-error').hidden = false;
});
void refresh();
setInterval(() => { if (!document.hidden) void refresh(); }, 30 * 60 * 1000);
