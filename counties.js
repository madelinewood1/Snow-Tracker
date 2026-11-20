import {decode} from './map.js';

let countyIndex;

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
