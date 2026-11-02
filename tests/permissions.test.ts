import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canRecordField, hasRole } from '../apps/web/src/auth/permissions';
import type { Profile } from '../apps/web/src/auth/client';
const profile = (role: Profile['role'], additionalRoles: Profile['role'][] = []): Profile => ({
  role,
  additionalRoles,
  userId: 'user',
  tenant: { id: 'tenant', name: 'Empresa' },
  mfaEnabled: false,
});
test('field controls follow responsibilities and draft state without implicit administrator engineering permissions', () => {
  assert.equal(canRecordField(profile('ADMIN'), 'DRAFT'), false);
  assert.equal(canRecordField(profile('COMMERCIAL'), 'DRAFT'), false);
  assert.equal(canRecordField(profile('OPERATOR'), 'DRAFT'), true);
  assert.equal(canRecordField(profile('OPERATOR'), 'IN_REVIEW'), false);
  assert.equal(canRecordField(profile('OPERATOR'), 'APPROVED'), false);
  assert.equal(canRecordField(profile('OPERATOR'), undefined), false);
  assert.equal(canRecordField(profile('ENGINEER'), 'IN_REVIEW'), true);
  assert.equal(canRecordField(profile('ADMIN', ['ENGINEER']), 'IN_REVIEW'), true);
  assert.equal(hasRole(profile('ENGINEER'), 'ADMIN'), false);
});

test('technical sections separate fieldwork, engineering and consultation', async () => {
  const { canOpenFuroSection } = await import('../apps/web/src/auth/permissions');
  for (const role of ['ADMIN', 'COMMERCIAL', 'OPERATOR', 'VIEWER', 'ENGINEER'] as const) {
    assert.equal(
      canOpenFuroSection(profile(role), 'analysis'),
      ['ENGINEER', 'VIEWER'].includes(role),
    );
    assert.equal(canOpenFuroSection(profile(role), 'review'), role === 'ENGINEER');
  }
  assert.equal(canOpenFuroSection(profile('ADMIN', ['OPERATOR']), 'analysis'), false);
  assert.equal(canOpenFuroSection(profile('ADMIN', ['ENGINEER']), 'review'), true);
});
