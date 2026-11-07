import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { professionalProfileInput } from '../apps/api/src/professional-profile/professional-profile-input';
import {
  demoReviewerProfile,
  demoReviewerProfileBody,
  legacyDemoReviewerProfile,
  needsDemoReviewerProfile,
  type ReadReviewerProfile,
} from '../scripts/demo-reviewer-profile.cjs';

const readProfile = (fields: Partial<ReadReviewerProfile>): ReadReviewerProfile => ({
  complete: true,
  version: 3,
  fullName: 'Ana Souza',
  creaNumber: '5061234567',
  creaUf: 'SP',
  professionalTitle: 'Engenheira Civil',
  phone: '(11) 99999-0000',
  professionalEmail: 'ana@example.invalid',
  ...fields,
});

test('the demo reviewer profile passes the profile validation unchanged and is marked fictitious', () => {
  const { fields, version } = professionalProfileInput(
    demoReviewerProfileBody(readProfile({ complete: false })),
  );
  assert.equal(version, 3);
  assert.deepEqual(
    {
      fullName: fields.fullName,
      creaNumber: fields.creaNumber,
      creaUf: fields.creaUf,
      professionalTitle: fields.professionalTitle,
    },
    { ...demoReviewerProfile },
  );
  assert.equal(fields.phone, '(11) 99999-0000');
  assert.equal(fields.professionalEmail, 'ana@example.invalid');
  assert.match(demoReviewerProfile.fullName, /fictícia/);
  assert.match(demoReviewerProfile.professionalTitle, /sem validade/);
  assert.match(demoReviewerProfile.creaNumber, /^0+$/);
  assert.ok(demoReviewerProfile.fullName.length <= 200);
  assert.ok(demoReviewerProfile.professionalTitle.length <= 120);
});

test('only an incomplete profile or the exact old demo profile is replaced', () => {
  assert.equal(needsDemoReviewerProfile(readProfile({ complete: false })), true);
  assert.equal(
    needsDemoReviewerProfile(readProfile({ ...legacyDemoReviewerProfile, complete: true })),
    true,
  );
  assert.equal(needsDemoReviewerProfile(readProfile({})), false);
  assert.equal(
    needsDemoReviewerProfile(readProfile({ ...demoReviewerProfile, complete: true })),
    false,
  );
  for (const field of ['fullName', 'creaNumber', 'creaUf', 'professionalTitle'] as const)
    assert.equal(
      needsDemoReviewerProfile(
        readProfile({ ...legacyDemoReviewerProfile, [field]: 'Outro valor', complete: true }),
      ),
      false,
      field,
    );
});

test('the demo seed and the load test take the reviewer profile from the shared module', () => {
  for (const [file, reference] of [
    ['scripts/seed-local-demo.ts', "from './demo-reviewer-profile.cjs'"],
    ['scripts/loadtest/runner.cjs', "require('../demo-reviewer-profile.cjs')"],
  ]) {
    const source = readFileSync(resolve(__dirname, '..', file), 'utf8');
    assert.ok(source.includes(reference), file);
    assert.ok(!source.includes('Engenheira'), file);
  }
});
