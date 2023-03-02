type Path = (string | number)[];
type Group = {
  scope: Path;
  save: (value: any, acc: any, path: Path) => any;
  result: any;
};

function getAtPath(data: any, path: Path): any {
  let value = data;
  for (const key of path) {
    value = value[key];
  }
  return value;
}

/**
 * Set a value at a path in an object.
 * It clones the objects and arrays in the modified path
 * and creates missing objects and arrays as needed.
 * Returns the new root object.
 */
function setAtPath(data: any, path: Path, value: any): any {
  if (path.length === 0) {
    return value;
  }
  const key = path[0];
  if (path.length === 1) {
    if (typeof key === 'number') {
      const array = [...(data || [])];
      array[key] = value;
      return array;
    } else {
      return {
        ...(data || {}),
        [key]: value,
      };
    }
  }
  if (typeof key === 'number') {
    const array = [...(data || [])];
    array[key] = setAtPath(array[key], path.slice(1), value);
    return array;
  } else {
    return {
      ...(data || {}),
      [key]: setAtPath(data[key], path.slice(1), value),
    };
  }
}

class Context {
  constructor(
    private data: any,
    private path: Path,
    private defaultGroup: Group,
  ) {}

  get key(): string | number {
    return this.path[this.path.length - 1];
  }

  get value(): any {
    return getAtPath(this.data, this.path);
  }

  has(key: string): boolean {
    if (!this.value || typeof this.value !== 'object') {
      throw new Error(
        `Expected object at ${this.toString()}, got ${typeof this.value} (${
          this.value
        })`,
      );
    }
    return key in this.value;
  }

  enter(key: string | number): Context {
    return new Context(this.data, [...this.path, key], this.defaultGroup);
  }

  exit(key: string | number): Context {
    const lastkey = this.path[this.path.length - 1];
    if (lastkey !== key) {
      throw new Error(`Expected to exit ${key} but was ${lastkey}`);
    }
    return new Context(this.data, this.path.slice(0, -1), this.defaultGroup);
  }

  get inArray(): boolean {
    const array = getAtPath(this.data, this.path.slice(0, -1));
    return Array.isArray(array);
  }

  enterNextArrayIndex(): Context {
    const array = getAtPath(this.data, this.path.slice(0, -1));
    if (!Array.isArray(array)) {
      throw new Error(`Not in array at ${this.toString()}`);
    }
    const index = this.path[this.path.length - 1] as number;
    if (index >= array.length - 1) {
      throw new Error(`No next array index at ${this.toString()}`);
    }
    return new Context(
      this.data,
      [...this.path.slice(0, -1), index + 1],
      this.defaultGroup,
    );
  }

  toString() {
    return ['$', ...this.path].join('.');
  }

  save(value: any): Context {
    const defaultGroup = {
      ...this.defaultGroup,
      // result: this.defaultGroup.save(value, this.defaultGroup.result, this.path)
      result: setAtPath(this.defaultGroup.result, this.path, value),
    };
    return new Context(this.data, this.path, defaultGroup);
  }

  get result() {
    return this.defaultGroup.result;
  }
}

type Parser = (ctx: Context) => Context;

export function number(validate?: (value: number) => unknown) {
  return (ctx: Context) => {
    const value = ctx.value;
    if (typeof value !== 'number') {
      throw new Error(`Expected number at ${ctx.toString()}, got ${value}`);
    }
    if (typeof validate === 'function') {
      validate(value);
    }
    return ctx.save(value);
  };
}

export function string(validate?: (value: string) => unknown) {
  return (ctx: Context) => {
    const value = ctx.value;
    if (typeof value !== 'string') {
      throw new Error(`Expected string at ${ctx.toString()}, got ${value}`);
    }
    if (typeof validate === 'function') {
      validate(value);
    }
    return ctx.save(value);
  };
}

export function val(value: string | number | boolean) {
  return (ctx: Context) => {
    if (ctx.value !== value) {
      throw new Error(
        `Expected "${value}" at ${ctx.toString()}, got ${ctx.value}`,
      );
    }
    return ctx.save(value);
  };
}

export function field(name: string, parser: Parser) {
  return (ctx: Context) => {
    if (!ctx.has(name)) {
      throw new Error(`Missing field "${name}" at ${ctx.toString()}`);
    }
    return parser(ctx.enter(name)).exit(name);
  };
}

export function obj(...fields: Parser[]) {
  return (ctx: Context) => {
    for (const field of fields) {
      ctx = field(ctx);
    }
    return ctx;
  };
}

export function or(...parsers: Parser[]) {
  return (ctx: Context) => {
    for (const parser of parsers) {
      try {
        return parser(ctx);
      } catch (err) {}
    }
    throw new Error(`Expected one of ${parsers} at ${ctx.toString()}`);
  };
}

export function zeroOrMore(parser: Parser, ...parsers: Parser[]) {
  return (ctx: Context) => {
    if (!ctx.inArray) {
      throw new Error(`Expected array at ${ctx.toString()}`);
    }
    let lastCtx = ctx;
    while (true) {
      try {
        ctx = parser(ctx);
        lastCtx = ctx;
        ctx = ctx.enterNextArrayIndex();
        for (const parser2 of parsers) {
          ctx = parser2(ctx);
          lastCtx = ctx;
          ctx = ctx.enterNextArrayIndex();
        }
      } catch (err) {
        ctx = lastCtx;
        break;
      }
    }
    return lastCtx;
  };
}

export function oneOrMore(parser: Parser, ...parsers: Parser[]) {
  return (ctx: Context) => {
    if (!ctx.inArray) {
      throw new Error(`Expected array at ${ctx.toString()}`);
    }
    ctx = parser(ctx);
    ctx = ctx.enterNextArrayIndex();
    let lastCtx = ctx;
    for (let i = 0, l = parsers.length; i < l; i++) {
      lastCtx = ctx;
      ctx = parsers[i](ctx);
      if (i < l - 1 && lastCtx !== ctx) {
        ctx = ctx.enterNextArrayIndex();
      }
    }
    return zeroOrMore(parser, ...parsers)(ctx);
  };
}

export function zeroOrOne(parser: Parser) {
  return (ctx: Context) => {
    try {
      return parser(ctx);
    } catch (err) {
      return ctx;
    }
  };
}

export function group(name: string, parser: Parser) {
  return (ctx: Context) => {
    // TODO save groups
    console.log(name)
    return parser(ctx);
  };
}

export function array(...parsers: Parser[]) {
  return (ctx: Context) => {
    if (!Array.isArray(ctx.value)) {
      throw new Error(`Expected array at ${ctx.toString()}`);
    }
    ctx = ctx.enter(0);
    let lastCtx = ctx;
    for (let i = 0, l = parsers.length; i < l; i++) {
      lastCtx = ctx;
      ctx = parsers[i](ctx);
      if (i < l - 1 && lastCtx !== ctx) {
        ctx = ctx.enterNextArrayIndex();
      }
    }
    return ctx;
  };
}

export class JsonRegExp {
  constructor(private parser: Parser) {}

  exec(data: any) {
    const ctx = new Context(data, [], {
      scope: [],
      save: (x) => x,
      result: null,
    });
    try {
      return this.parser(ctx).result;
    } catch (err) {
      console.log(err);
      return null;
    }
  }
}
