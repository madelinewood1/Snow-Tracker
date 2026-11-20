import {states} from './states.js';
import {createMap} from './map.js';
import {countiesIn} from './counties.js';
import {loadAnnualSnow, annualSummary} from './weather.js';

const get = id => document.getElementById(id);
const byId = new Map(states.map(state => [state.id, state]));
const inches = mm => mm === null ? '—' : (mm / 25.4).toFixed(1);
let selected = '08', year, span = 20, map, data, countyView;

function element(tag, content, className) {
  const node = document.createElement(tag);
  if (content !== undefined) node.textContent = content;
  if (className) node.className = className;
  return node;
}

function addOptions(select, options) {
  select.replaceChildren(...options.map(([value, label]) => {
    const option = element('option', label);
    option.value = value;
    return option;
  }));
}

function summarize(id, selectedYear = year, selectedSpan = span) {
  return data ? annualSummary(data, id, selectedYear, selectedSpan)
    : {snow: null, available: 0, years: 0};
}

function periodLabel() {
  if (!data) return '';
  if (span === 1) return String(year);
  return `${Math.max(data.firstYear, year - span + 1)}–${year} average`;
}

function renderHistory(location) {
  const section = get('history');
  const scroll = section.scrollTop;
  const focused = section.contains(document.activeElement);
  const rows = data ? Array.from({length: data.lastYear - data.firstYear + 1}, (_, index) => {
    const value = data.lastYear - index;
    return {year: value, snow: summarize(location.id, value, 1).snow};
  }) : [];
  get('history-subtitle').textContent = `${location.name} · select a year to update the map`;
  const scale = Math.max(25.4, ...rows.map(row => row.snow ?? 0));
  section.replaceChildren(...rows.map(record => {
    const button = element('button', undefined, 'history-row');
    button.type = 'button';
    button.dataset.year = record.year;
    button.setAttribute('aria-pressed', record.year === year);
    const track = element('span', undefined, 'track');
    track.setAttribute('aria-hidden', 'true');
    const bar = element('span', undefined, 'bar');
    bar.style.width = `${100 * (record.snow ?? 0) / scale}%`;
    track.append(bar);
    button.append(element('span', record.year), track,
      element('strong', record.snow === null ? 'No data' : `${inches(record.snow)} in`));
    return button;
  }));
  section.scrollTop = scroll;
  if (focused) section.querySelector(`[data-year="${year}"]`)?.focus({preventScroll: true});
}

function renderCounties() {
  const {counties, selectedId, loading, error} = countyView;
  const state = byId.get(selected);
  const ranking = counties.map(county => ({...county, snow: summarize(county.id).snow}))
    .sort((a, b) => (b.snow ?? -1) - (a.snow ?? -1) || a.name.localeCompare(b.name));
  const available = ranking.filter(county => county.snow !== null).length;
  get('county-title').textContent = `${state.name} · ${periodLabel()}`;
  get('county-summary').textContent = error ? 'County boundaries unavailable'
    : loading ? 'Loading county boundaries…'
    : `${available} of ${ranking.length} counties have records for this period`;
  const active = ranking.find(county => county.id === selectedId);
  get('county-selection').textContent = active
    ? `${active.name} · ${active.snow === null ? 'No data' : `${inches(active.snow)} in per year`}`
    : 'Select a county to see its annual records and weather station.';

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
  list.scrollTop = scroll;
  if (focused) list.querySelector(`[data-county="${selectedId}"]`)?.focus({preventScroll: true});
  map?.update(selectedId, new Map(ranking.map(county => [county.id, county.snow])));
}

function render() {
  const state = byId.get(selected);
  const county = countyView?.counties.find(item => item.id === countyView.selectedId);
  const location = county ?? state;
  const {stationName, distance, snow, available, years} = summarize(location.id);
  get('state').value = selected;
  get('detail-title').textContent = county ? `${county.name}, ${state.name}` : state.name;
  get('location').textContent = stationName ? `NOAA station · ${stationName.replace(/ US$/, '')}`
    : data ? 'No representative station' : 'Loading station records…';
  get('prediction-label').textContent = !data ? 'ANNUAL SNOWFALL' : span === 1 ? `${year} ANNUAL SNOWFALL`
    : `${periodLabel().toUpperCase()} · INCHES PER YEAR`;
  get('estimate').textContent = inches(snow);
  get('comparison').textContent = !data ? ''
    : span === 1 ? (available ? 'Calendar-year station total' : 'No annual record')
    : `${available} of ${years} calendar years reported`;
  get('model-note').textContent = stationName
    ? `One representative station, ${distance} mi from the ${county ? 'county reference point' : `${state.city} reference point`}. Local totals can vary with elevation and distance.`
    : 'Missing station records appear as no data.';
  get('county-toggle').disabled = !map || !data;
  if (countyView) renderCounties();
  else {
    get('county-toggle').textContent = `Explore ${state.name} counties`;
    map?.update(selected, new Map(states.map(({id}) => [id, summarize(id).snow])));
  }
  renderHistory(location);
}

async function showCounties() {
  const view = {counties: [], loading: true};
  countyView = view;
  map.setCounties([]);
  get('tooltip').hidden = true;
  get('county-toggle').textContent = 'Back to U.S. map';
  get('county-toggle').setAttribute('aria-pressed', 'true');
  get('county-panel').hidden = false;
  get('map-subtitle').textContent = `${byId.get(selected).name} · representative weather stations`;
  get('map-action').textContent = 'Click a county to select it';
  get('county-ranking').scrollTop = 0;
  render();
  try {
    view.counties = await countiesIn(selected);
    if (countyView !== view) return;
    if (!view.counties.length) throw new Error('No county boundaries for the selected state');
    map.setCounties(view.counties);
  } catch (error) {
    console.warn('County view unavailable', error);
    view.error = true;
  }
  view.loading = false;
  if (countyView === view) render();
}

function hideCounties() {
  countyView = undefined;
  map.setCounties(null);
  get('tooltip').hidden = true;
  get('county-toggle').setAttribute('aria-pressed', 'false');
  get('county-panel').hidden = true;
  get('county-summary').textContent = '';
  get('map-subtitle').textContent = 'Representative weather stations';
  get('map-action').textContent = 'Click a state to select it';
  render();
}

function selectState(id) {
  if (!byId.has(id)) return;
  selected = id;
  get('tooltip').hidden = true;
  if (countyView) void showCounties();
  else render();
}

function selectCounty(id) {
  if (!countyView?.counties.some(county => county.id === id)) return;
  countyView.selectedId = id;
  get('tooltip').hidden = true;
  render();
}

function setYear(value) {
  year = Number(value);
  get('year').value = year;
  const periods = [...get('span').options];
  for (const option of periods) option.disabled = Number(option.value) > year - data.firstYear + 1;
  if (periods.find(option => Number(option.value) === span).disabled) {
    span = Number(periods.filter(option => !option.disabled).at(-1).value);
    get('span').value = span;
  }
  get('tooltip').hidden = true;
  render();
}

function hover(id, x, y) {
  const tooltip = get('tooltip');
  const location = countyView ? countyView.counties.find(county => county.id === id) : byId.get(id);
  tooltip.hidden = !location;
  if (tooltip.hidden) return;
  const {snow} = summarize(id);
  tooltip.textContent = `${location.name} · ${snow === null ? 'No data' : `${inches(snow)} in`}`;
  tooltip.style.left = `${Math.max(6, Math.min(x + 10, get('map').clientWidth - tooltip.offsetWidth - 6))}px`;
  tooltip.style.top = `${Math.max(6, y - 39)}px`;
}

addOptions(get('state'), states.map(state => [state.id, state.name]));
get('state').addEventListener('change', event => selectState(event.target.value));
get('year').addEventListener('change', event => setYear(event.target.value));
get('span').addEventListener('change', event => {
  span = Number(event.target.value);
  get('tooltip').hidden = true;
  render();
});
get('history').addEventListener('click', event => {
  const button = event.target.closest('[data-year]');
  if (!button) return;
  span = 1;
  get('span').value = '1';
  setYear(button.dataset.year);
});
get('county-toggle').addEventListener('click', () => countyView ? hideCounties() : void showCounties());
get('county-ranking').addEventListener('click', event => {
  const button = event.target.closest('[data-county]');
  if (button) selectCounty(button.dataset.county);
});
get('zoom-in').addEventListener('click', () => map?.zoom(0.15));
get('zoom-out').addEventListener('click', () => map?.zoom(-0.15));
get('tilt').addEventListener('click', () => map?.tilt(0.15));
get('reset').addEventListener('click', () => map?.reset());
render();

createMap(get('map'), states.map(state => state.id), id => countyView ? selectCounty(id) : selectState(id), hover)
  .then(instance => {
    map = instance;
    render();
  }).catch(error => {
    console.warn(error);
    get('map-error').hidden = false;
  });

loadAnnualSnow().then(dataset => {
  data = dataset;
  addOptions(get('year'), Array.from({length: data.lastYear - data.firstYear + 1}, (_, index) => {
    const value = data.lastYear - index;
    return [value, String(value)];
  }));
  get('year').disabled = false;
  get('span').disabled = false;
  get('dataset-status').textContent = `NOAA records · ${data.firstYear}–${data.lastYear}`;
  setYear(data.lastYear);
}).catch(error => {
  console.warn(error);
  get('dataset-status').textContent = 'Annual records unavailable';
});
