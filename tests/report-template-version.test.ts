import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SUPPORTED_TEMPLATE_VERSIONS,
  TEMPLATE_VERSION,
  isSupportedTemplateVersion,
  templateSince,
} from '../packages/report-templates/src/template-version';
test('template compatibility preserves explicit historical feature boundaries and refuses unknown versions', () => {
  assert.equal(TEMPLATE_VERSION, SUPPORTED_TEMPLATE_VERSIONS.at(-1));
  for (const [index, version] of SUPPORTED_TEMPLATE_VERSIONS.entries()) {
    assert.equal(isSupportedTemplateVersion(version), true);
    for (const [boundary, first] of SUPPORTED_TEMPLATE_VERSIONS.entries())
      assert.equal(templateSince(version, first), index >= boundary);
  }
  for (const version of ['', '0.8.99', '0.9.0', '0.8.13-invalid']) {
    assert.equal(isSupportedTemplateVersion(version), false);
    assert.equal(templateSince(version, '0.8.0'), false);
  }
});
