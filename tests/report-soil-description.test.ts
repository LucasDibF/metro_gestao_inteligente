import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportSoilDescription } from '../apps/api/src/reports/report-soil-description';
test('report descriptions omit structured moisture while preserving color and explicit observations', () => {
  const layer = { soilColor: 'Marrom', soilMoisture: 'Úmida', description: 'Com veios variegados' };
  assert.equal(reportSoilDescription(layer), 'Marrom, com veios variegados');
  assert.equal(layer.soilMoisture, 'Úmida');
  assert.equal(reportSoilDescription({ soilColor: null, description: '' }), '');
  assert.equal(
    reportSoilDescription({ description: 'Úmido a partir de 3 m' }),
    'Úmido a partir de 3 m',
  );
});
