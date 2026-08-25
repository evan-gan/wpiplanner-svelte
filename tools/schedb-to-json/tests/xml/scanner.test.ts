import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scanXml, type XmlEvent } from '../../src/xmlScanner.ts';

function collect(source: string): XmlEvent[] {
  return [...scanXml(source)];
}

describe('scanXml', () => {
  it('emits open and close events for a nested document', () => {
    const events = collect('<a x="1"><b y="2"></b></a>');

    assert.deepEqual(
      events.map((event) => (event.kind === 'open' ? `+${event.tag.name}` : `-${event.name}`)),
      ['+a', '+b', '-b', '-a'],
    );
  });

  it('reads attribute values into a plain object', () => {
    const [event] = collect('<period type="Lecture" days="mon,wed"/>');

    assert.equal(event.kind, 'open');
    assert.deepEqual(event.kind === 'open' ? event.tag.attributes : null, {
      type: 'Lecture',
      days: 'mon,wed',
    });
  });

  it('expands a self-closing tag into a matched open/close pair', () => {
    const events = collect('<period/>');

    assert.equal(events.length, 2);
    assert.equal(events[0].kind, 'open');
    assert.equal(events[1].kind, 'close');
  });

  it('does not truncate a tag when an attribute value contains ">"', () => {
    const [event] = collect('<course name="A &gt; B" number="101"/>');

    assert.equal(event.kind === 'open' ? event.tag.attributes.number : null, '101');
  });

  it('does not truncate a tag when an attribute value contains a raw ">"', () => {
    const [event] = collect('<course desc="scores > 90" number="101"/>');

    assert.equal(event.kind === 'open' ? event.tag.attributes.number : null, '101');
  });

  it('skips the XML prolog, comments, and doctype declarations', () => {
    const events = collect('<?xml version="1.0"?><!-- note --><!DOCTYPE x><a/>');

    assert.equal(events.length, 2);
    assert.equal(events[0].kind === 'open' ? events[0].tag.name : null, 'a');
  });

  it('ignores whitespace between elements', () => {
    assert.equal(collect('<a>\n  <b/>\n</a>').length, 4);
  });

  it('rejects stray text, which would mean the format carries data outside attributes', () => {
    assert.throws(() => collect('<a>hello</a>'), /Unexpected text content/);
  });

  it('rejects an unterminated tag rather than silently stopping', () => {
    assert.throws(() => collect('<a x="1"'), /Unterminated tag/);
  });

  it('rejects an unterminated comment', () => {
    assert.throws(() => collect('<!-- open'), /Unterminated "<!--" construct/);
  });
});
