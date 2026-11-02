import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, escapeHtml, technicalMap } from '@spt/report-templates';
import { coordinateInput } from '../apps/api/src/files/coordinates';
test('canonical snapshots hash consistently after JSONB key reordering and retain array order', () => {
  assert.equal(
    canonicalJson({ z: 1, a: { y: 2, b: [3, 1] } }),
    canonicalJson({ a: { b: [3, 1], y: 2 }, z: 1 }),
  );
  assert.notEqual(canonicalJson({ values: [1, 2] }), canonicalJson({ values: [2, 1] }));
});
test('report text and technical map labels cannot introduce markup or remote requests', () => {
  assert.equal(
    escapeHtml('<script src="https://private/">&</script>'),
    '&lt;script src=&quot;https://private/&quot;&gt;&amp;&lt;/script&gt;',
  );
  const svg = technicalMap({
    zone: 25,
    hemisphere: 'S',
    points: [{ code: '<image href="https://private/"/>', x: 500000, y: 9400000, selected: true }],
  });
  assert.ok(!svg.includes('<image'));
  assert.ok(svg.includes('&lt;image'));
  assert.ok(!svg.includes('NaN'));
});
test('UTM accepts all zones and both hemispheres, rejects invalid reference systems and impossible coordinates', () => {
  for (let zone = 1; zone <= 60; zone++)
    for (const hemisphere of ['N', 'S']) {
      const result = coordinateInput({
        eastingM: '500000',
        northingM: '5000000',
        zone,
        hemisphere,
        datum: 'SIRGAS2000',
        reference: 'Synthetic test',
      });
      assert.ok(Math.abs(result.longitude - (zone * 6 - 183)) < 1e-8);
      assert.equal(Math.sign(result.latitude), hemisphere === 'N' ? 1 : -1);
    }
  for (const change of [
    { zone: 0 },
    { zone: 61 },
    { hemisphere: 'X' },
    { datum: 'unknown' },
    { northingM: '10000001' },
    { eastingM: 'NaN' },
  ])
    assert.throws(() =>
      coordinateInput({
        eastingM: '500000',
        northingM: '5000000',
        zone: 25,
        hemisphere: 'S',
        datum: 'SIRGAS2000',
        reference: 'Test',
        ...change,
      }),
    );
});

test('technical map preserves equal horizontal and vertical metre scales and honors its frozen viewport', () => {
  const svg = technicalMap({
    zone: 25,
    hemisphere: 'S',
    view: { centerX: 0, centerY: 0, spanM: 100 },
    points: [
      { code: 'A', x: 0, y: 0, selected: true },
      { code: 'B', x: 10, y: 10, selected: true },
    ],
  });
  const circles = [...svg.matchAll(/<circle cx="([^"]+)" cy="([^"]+)"/g)];
  assert.equal(circles.length, 2);
  assert.equal(
    Math.abs(Number(circles[1][1]) - Number(circles[0][1])),
    Math.abs(Number(circles[1][2]) - Number(circles[0][2])),
  );
  assert.equal(Number(circles[1][1]) - Number(circles[0][1]), 42);
});
