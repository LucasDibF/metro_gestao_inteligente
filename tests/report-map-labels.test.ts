import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeMapLabels } from '../packages/report-templates/src/map-labels';
import { renderTechnicalMap } from '../packages/report-templates/src/technical-map';

test('dense map labels do not overlap and never move borehole coordinates', () => {
  const points = Array.from({ length: 40 }, (_, i) => ({
    code: 'SP-' + String(i + 1).padStart(2, '0'),
    x: 200 + i * 3,
    y: 200 + i * 3,
    selected: i < 20,
  }));
  const before = structuredClone(points),
    labels = placeMapLabels(points);
  assert.equal(labels.length, 40);
  assert.deepEqual(points, before);
  for (let i = 0; i < labels.length; i++) {
    const a = labels[i];
    assert.ok(a.x >= 20 && a.x + a.width <= 590);
    assert.ok(a.y - 13 >= 55 && a.y - 13 + a.height <= 468);
    for (const b of labels.slice(i + 1))
      assert.ok(
        a.x + a.width <= b.x ||
          b.x + b.width <= a.x ||
          a.y - 13 + a.height <= b.y - 13 ||
          b.y - 13 + b.height <= a.y - 13,
      );
  }
});
test('very dense references have an explicit table fallback while every selected hole remains labelled', () => {
  const points = Array.from({ length: 120 }, (_, i) => ({
    code: 'W'.repeat(58) + String(i).padStart(2, '0'),
    x: 300 + i * 0.2,
    y: 260 + i * 0.2,
    selected: i < 20,
  }));
  const labels = placeMapLabels(points);
  assert.equal(labels.filter((l) => l.index < 20).length, 20);
  const map = renderTechnicalMap({ zone: 25, hemisphere: 'S', points });
  assert.equal(map.references, true);
  assert.ok(map.omitted > 0);
  assert.ok(map.svg.includes('[1]') || map.svg.includes('WWWW'));
});
