import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultInterruptionReason,
  resolveInterruptionReason,
} from '../apps/web/src/spt/interruption-reason';
const full = [150, 150, 150].map((penetrationMm) => ({ blows: 5, penetrationMm }));
const partial = [{ blows: 30, penetrationMm: 60 }];

test('last metre applies the default reason only when penetration stopped short of 450 mm', () => {
  assert.equal(resolveInterruptionReason({ typed: '', ending: true, advances: full }), null);
  assert.equal(
    resolveInterruptionReason({ typed: '', ending: true, advances: partial }),
    defaultInterruptionReason,
  );
  assert.equal(
    resolveInterruptionReason({ typed: '', ending: true, advances: [] }),
    defaultInterruptionReason,
  );
  assert.equal(resolveInterruptionReason({ typed: '', ending: false, advances: partial }), null);
});

test('a reason typed by the user always wins over the last-metre rule', () => {
  for (const advances of [full, partial])
    for (const ending of [true, false])
      assert.equal(
        resolveInterruptionReason({ typed: '  Impenetrável  ', ending, advances }),
        'Impenetrável',
      );
});

test('a previously saved default reason does not survive when it no longer applies', () => {
  const typed = defaultInterruptionReason;
  assert.equal(resolveInterruptionReason({ typed, ending: true, advances: full }), null);
  assert.equal(resolveInterruptionReason({ typed, ending: false, advances: partial }), null);
  assert.equal(resolveInterruptionReason({ typed, ending: true, advances: partial }), typed);
});
