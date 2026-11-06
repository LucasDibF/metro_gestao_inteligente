import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderReport, type ReportSnapshot } from '@spt/report-templates';
import { pageOrderFixture } from './helpers/report-order-fixture';

function pages(snapshot: ReportSnapshot) {
  return renderReport(snapshot).match(/<section class="page\b[\s\S]*?<\/section>/g) ?? [];
}
function labels(snapshot: ReportSnapshot) {
  return pages(snapshot).map((page) =>
    page.includes('report-cover')
      ? 'Capa'
      : page.includes('photographic')
        ? 'Fotos ' + snapshot.holes.find((h) => page.includes(h.code))!.code
        : page.includes('engineering')
          ? 'Perfil ' + snapshot.holes.find((h) => page.includes(h.code))!.code
          : 'Croqui',
  );
}
test('new reports interleave each profile and its own photos before the final map', () => {
  assert.deepEqual(labels(pageOrderFixture()), [
    'Capa',
    'Perfil SP01',
    'Fotos SP01',
    'Perfil SP02',
    'Fotos SP02',
    'Croqui',
  ]);
});
test('historical reports retain their original grouping', () => {
  assert.deepEqual(labels({ ...pageOrderFixture(), templateVersion: '0.8.14' }), [
    'Capa',
    'Perfil SP01',
    'Perfil SP02',
    'Fotos SP01',
    'Fotos SP02',
    'Croqui',
  ]);
});
test('holes without photos add no empty sheet; multi-page photos stay with their hole', () => {
  const fixture = pageOrderFixture();
  const photo = fixture.photos.find((p) => p.boreholeId === 'hole-0')!;
  fixture.photos = Array.from({ length: 5 }, (_, i) => ({ ...photo, id: 'extra-' + i }));
  assert.deepEqual(labels(fixture), [
    'Capa',
    'Perfil SP01',
    'Fotos SP01',
    'Fotos SP01',
    'Perfil SP02',
    'Croqui',
  ]);
});
test('profile continuations remain before their photos and preserve the composition order', () => {
  const fixture = pageOrderFixture();
  fixture.holes[0].executedDepthM = '21';
  fixture.holes.reverse();
  assert.deepEqual(labels(fixture), [
    'Capa',
    'Perfil SP02',
    'Fotos SP02',
    'Perfil SP01',
    'Perfil SP01',
    'Fotos SP01',
    'Croqui',
  ]);
});
