import { describe, it, expect } from 'vitest';
import {
  array,
  field,
  group,
  JsonRegExp,
  number,
  obj,
  oneOrMore,
  or,
  string,
  val,
  zeroOrMore,
  zeroOrOne,
} from './engine';

describe('JsonRegExp', () => {
  it('should match simple object', () => {
    const test = new JsonRegExp(
      obj(field('type', val('document')), field('test', val(2))),
    );
    const actual = test.exec({ type: 'document', test: 2 });
    expect(actual.match).toBe(true);
    expect(actual.value).toEqual({
      type: 'document',
      test: 2,
    });
  });

  it('should match simple array', () => {
    const test = new JsonRegExp(
      array(zeroOrMore(val('document')), val('page')),
    );
    const actual = test.exec(['document', 'document', 'page']);
    expect(actual.value).toEqual(['document', 'document', 'page']);
  });
});

describe('group', () => {
  it('should return a group', () => {
    const test = new JsonRegExp(group('g', val('document')));
    const actual = test.exec('document');
    expect(actual.value).toEqual('document');
    expect(actual.groups).toEqual({ g: [{ value: 'document' }] });
  });

  it('should return multiple groups', () => {
    const test = new JsonRegExp(
      array(group('g1', val('document')), group('g2', val('page'))),
    );
    const actual = test.exec(['document', 'page']);
    expect(actual.groups).toEqual({
      g1: [{ value: 'document' }],
      g2: [{ value: 'page' }],
    });
  });

  it('should return group with multiple matches', () => {
    const test = new JsonRegExp(
      array(group('g1', oneOrMore(val('document'))), group('g2', val('page'))),
    );
    const actual = test.exec(['document', 'document', 'page']);
    expect(actual.groups).toEqual({
      g1: [{ value: 'document' }],
      g2: [{ value: 'page' }],
    });
  });

  it('should return nested groups', () => {
    const test = new JsonRegExp(
      obj(
        field('type', group('g1', val('document'))),
        field('test', group('g2', array(val('out'), group('g3', val('in'))))),
      ),
    );
    const actual = test.exec({
      type: 'document',
      test: ['out', 'in'],
    });
    expect(actual.groups).toEqual({
      g1: [{ value: 'document' }],
      g2: [{ value: ['out', 'in'], groups: { g3: [{ value: 'in' }] } }],
    });
  });
});
