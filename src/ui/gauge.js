// The depth gauge and the on-screen scale bar.
import { el, clear } from './dom.js';
import { GAUGE_TOP_EXP, GAUGE_BOTTOM_EXP, formatLength, gaugeFraction, niceScaleBar } from '../science/scale.js';

export function buildGauge(rail, steps) {
  clear(rail);
  for (let e = GAUGE_TOP_EXP; e >= GAUGE_BOTTOM_EXP; e--) {
    const f = gaugeFraction(10 ** e);
    const tick = el('div', { class: `gauge__tick${e % 3 === 0 ? ' is-major' : ''}` }, el('span', { class: 'gauge__tick-label', text: formatLength(10 ** e, 1).text }));
    tick.style.top = `${f * 100}%`;
    rail.append(tick);
  }
  const stops = [];
  steps.forEach((s, i) => {
    const stop = el('div', { class: 'gauge__stop', dataset: { index: String(i) } }, el('span', { class: 'gauge__stop-label', text: s.title }));
    stop.style.top = `${gaugeFraction(s.frameMeters) * 100}%`;
    rail.append(stop);
    stops.push(stop);
  });
  return stops;
}

export function updateGauge({ marker, value, stops, currentIndex }, meters) {
  marker.style.top = `${gaugeFraction(meters) * 100}%`;
  value.textContent = formatLength(meters, 2).text;
  stops.forEach((s, i) => s.classList.toggle('is-current', i === currentIndex));
}

export function updateScaleBar({ bar, label }, metersPerPixel) {
  const nice = niceScaleBar(metersPerPixel, 140);
  bar.style.width = `${Math.round(nice.pixels)}px`;
  label.textContent = nice.label;
}
