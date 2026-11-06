import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  coordinateKindLabel,
  sortPhotosByPurpose,
  type Photo,
} from '../apps/web/src/files/file-types';

const photo = (id: string, purpose: string | null): Photo => ({
  processingState: 'READY',
  id,
  caption: '',
  purpose,
  version: 1,
  gpsLatitude: null,
  distanceM: null,
  gpsWarning: false,
  crop: { x: 0, y: 0, width: 1, height: 1 },
});

test('photos follow the report purpose order and unknown purposes count as other', () => {
  const photos = [
    photo('other', null),
    photo('sample-2', 'SAMPLE_2'),
    photo('site', 'SITE'),
    photo('execution', 'EXECUTION'),
  ];
  const before = photos.map((p) => p.id);
  assert.deepEqual(
    sortPhotosByPurpose(photos).map((p) => p.id),
    ['site', 'execution', 'sample-2', 'other'],
  );
  assert.deepEqual(
    photos.map((p) => p.id),
    before,
  );
});

test('coordinate kinds keep their Portuguese labels', () => {
  assert.equal(coordinateKindLabel('PLANNED'), 'planejada');
  assert.equal(coordinateKindLabel('EXECUTED'), 'executada');
});
