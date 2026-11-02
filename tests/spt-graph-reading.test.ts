import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sptGraphReading } from '../packages/geotechnical-engine/src/graph-reading';
import { graphMaximum } from '../apps/web/src/spt/sheet/profile-model';
const partial = {
  advances: [
    { blows: 30, penetrationMm: 150 },
    { blows: 30, penetrationMm: 140 },
    { blows: 30, penetrationMm: 150 },
  ],
  result: { status: 'REQUIRES_REVIEW', nSpt: null },
};
test('30, 30/14, 30 is displayed as measured 60/29 on both series without assigning NSPT', () => {
  const before = JSON.stringify(partial);
  for (const series of [0, 1])
    assert.deepEqual(sptGraphReading(partial, series), {
      value: 60,
      penetrationMm: 290,
      conventional: false,
      label: '60/29',
    });
  assert.equal(JSON.stringify(partial), before);
  assert.equal(partial.result.nSpt, null);
  assert.equal(
    graphMaximum([
      {
        ...partial,
        id: 'partial',
        depthM: '10',
        interruptionReason: null,
        fieldDetails: null,
        version: 1,
        engineVersion: '0.1.0',
      },
    ]),
    60,
  );
});
test('partial markers preserve single advances and never fabricate a missing final pair', () => {
  const single = { ...partial, advances: [{ blows: 30, penetrationMm: 140 }] };
  assert.deepEqual(sptGraphReading(single, 0), {
    value: 30,
    penetrationMm: 140,
    conventional: false,
    label: '30/14',
  });
  assert.equal(sptGraphReading(single, 1), null);
  assert.equal(sptGraphReading({ ...partial, advances: [] }, 0), null);
  assert.equal(
    sptGraphReading({ ...single, advances: [{ blows: 30, penetrationMm: 0 }] }, 0),
    null,
  );
  assert.equal(
    sptGraphReading({ ...single, result: { status: 'NOT_TESTED', nSpt: null } }, 0),
    null,
  );
});
