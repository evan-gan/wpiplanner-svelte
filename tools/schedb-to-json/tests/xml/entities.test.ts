import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decodeXmlEntities } from '../../src/entities.ts';

describe('decodeXmlEntities', () => {
  it('returns text unchanged when it has no entities', () => {
    assert.equal(decodeXmlEntities('Object-Oriented Design'), 'Object-Oriented Design');
  });

  it('expands the five predefined named entities', () => {
    assert.equal(decodeXmlEntities('&lt;a&gt; &amp; &quot;b&quot; &apos;c&apos;'), `<a> & "b" 'c'`);
  });

  it('expands decimal character references', () => {
    assert.equal(decodeXmlEntities('students&#8217; work'), 'students’ work');
  });

  it('expands hexadecimal character references', () => {
    assert.equal(decodeXmlEntities('&#x2014;dash'), '—dash');
  });

  it('expands references outside the basic multilingual plane', () => {
    assert.equal(decodeXmlEntities('&#x1F600;'), '\u{1F600}');
  });

  it('rejects an unknown named entity instead of leaking it into the UI', () => {
    assert.throws(() => decodeXmlEntities('a &nbsp; b'), /Unknown XML entity/);
  });

  it('rejects a character reference outside the Unicode range', () => {
    assert.throws(() => decodeXmlEntities('&#x110000;'), /outside the Unicode range/);
  });
});
