import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { htmlToPlainText } from '../../src/html.ts';

describe('htmlToPlainText', () => {
  it('replaces tags with a space so sentences do not run together', () => {
    assert.equal(
      htmlToPlainText('<p>structures.<br />Recommended background: AB1531.</p>'),
      'structures. Recommended background: AB1531.',
    );
  });

  it('decodes the entities Workday emits', () => {
    assert.equal(htmlToPlainText('reading &amp; listening'), 'reading & listening');
    assert.equal(htmlToPlainText('students&#39; work'), "students' work");
    assert.equal(htmlToPlainText('C&#43;&#43;'), 'C++');
  });

  it('leaves an entity it does not know rather than failing the build', () => {
    assert.equal(htmlToPlainText('section &sect; 4'), 'section &sect; 4');
  });

  it('is empty for empty input', () => {
    assert.equal(htmlToPlainText(''), '');
  });
});
