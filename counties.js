import {decode} from './map.js';
import {forecast, totalSnow} from './weather.js';

const MAX_AGE = 30 * 60 * 1000;
const BATCH_SIZE = 50;
let countyIndex;
const cache = new Map();

async function boundaries() {
  countyIndex ??= fetch('./counties.json').then(async response => {
    if (!response.ok) throw new Error('County boundaries could not load');
    const index = new Map();
    for (const feature of decode(await response.json(), 'counties')) {
      const stateId = feature.id.slice(0, 2);
      const [latitude, longitude] = feature.properties.location;
      const group = index.get(stateId) ?? [];
      group.push({...feature, name: feature.properties.name, latitude, longitude});
      index.set(stateId, group);
    }
    return index;
  }).catch(error => {
    countyIndex = undefined;
    throw error;
  });
  return countyIndex;
}

export async function countiesIn(stateId) {
  return (await boundaries()).get(stateId) ?? [];
}

export async function countyForecasts(stateId, counties, force = false) {
  const previous = cache.get(stateId);
  if (previous?.pending) return previous.pending;
  if (!force && previous && Date.now() - previous.updated < MAX_AGE) return previous;

  const batches = [];
  for (let i = 0; i < counties.length; i += BATCH_SIZE) {
    batches.push(counties.slice(i, i + BATCH_SIZE));
  }
  const pending = Promise.allSettled(batches.map(async batch => {
    const results = await forecast(batch);
    return batch.map(({id}, i) => [id, results[i]]);
  })).then(results => {
    const days = new Map(results.flatMap(result => result.status === 'fulfilled' ? result.value : []));
    const refreshFailed = results.some(result => result.status === 'rejected');
    const result = days.size ? {days, updated: Date.now(), refreshFailed}
      : {...previous, days: previous?.days ?? new Map(), refreshFailed: true, pending: undefined};
    cache.set(stateId, result);
    return result;
  });
  cache.set(stateId, {...previous, pending});
  return pending;
}

export function rankCounties(counties, days, count) {
  return counties.map(county => ({...county, snow: totalSnow(days?.get(county.id), count)}))
    .sort((a, b) => (b.snow ?? -1) - (a.snow ?? -1) || a.name.localeCompare(b.name));
}
