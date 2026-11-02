import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatSoilDescription } from '../packages/geotechnical-engine/src/soil-description';
test('soil description uses comma separators and lower-case generated continuations', () => {
  assert.equal(
    formatSoilDescription(['Argila arenosa', 'Muito rija', 'Marrom com veios variegados']),
    'Argila arenosa, muito rija, marrom com veios variegados',
  );
  assert.equal(
    formatSoilDescription([
      'Areia fina.',
      'Pouco compacta.',
      'Marrom.',
      'Úmida.',
      'Com veios variegados.',
    ]),
    'Areia fina, pouco compacta, marrom, úmida, com veios variegados.',
  );
});
test('formatting omits empty fields, preserves abbreviations and internal punctuation, and leaves source data unchanged', () => {
  const fields = [' Argila arenosa ', null, '', ' Rija. ', 'SPT verificado. Camada de 0.5 m.'];
  const original = JSON.stringify(fields);
  assert.equal(
    formatSoilDescription(fields),
    'Argila arenosa, rija, SPT verificado. Camada de 0.5 m.',
  );
  assert.equal(JSON.stringify(fields), original);
});
