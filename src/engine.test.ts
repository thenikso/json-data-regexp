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
    expect(test.exec({ type: 'document', test: 2 })).toEqual({
      type: 'document',
      test: 2,
    });
  });

  it('should match simple array', () => {
    const test = new JsonRegExp(
      array(zeroOrMore(val('document')), val('page')),
    );
    expect(test.exec(['document', 'document', 'page'])).toEqual([
      'document',
      'document',
      'page',
    ]);
  });
});
