import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workLocationLine, type Work } from '../apps/web/src/works/work-types';

const work = (fields: Partial<Work>): Work => ({
  id: 'work-1',
  name: 'Residencial',
  clientName: null,
  city: null,
  state: null,
  address: null,
  version: 1,
  ...fields,
});

test('the work line joins client and city / state, skipping what is missing', () => {
  assert.equal(
    workLocationLine(work({ clientName: 'Contratante', city: 'Recife', state: 'PE' })),
    'Contratante · Recife / PE',
  );
  assert.equal(workLocationLine(work({ state: 'SP' })), 'SP');
  assert.equal(workLocationLine(work({ clientName: 'Contratante' })), 'Contratante');
});

test('a work without client or location shows the placeholder', () => {
  assert.equal(workLocationLine(work({})), 'Sem informações complementares');
});
