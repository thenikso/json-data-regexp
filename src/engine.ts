interface GroupResult {
  value: any;
  groups?: { [key: string]: GroupResult[] };
}

interface Result {
  match: boolean;
  value: any;
  error?: Error;
  groups?: { [key: string]: GroupResult[] };
}

type Path = (string | number)[];
type Group = {
  scope: Path;
  result: any;
  groups: { [key: string]: Group[] };
};

function groupToGroupResult(group: Group): GroupResult {
  const res: GroupResult = {
    value: group.result,
  };
  if (Object.keys(group.groups).length > 0) {
    res.groups = {} as { [key: string]: GroupResult[] };
    for (const key of Object.keys(group.groups)) {
      res.groups[key] = group.groups[key].map(groupToGroupResult);
    }
  }
  return res;
}

function getAtPath(data: any, path: Path): any {
  let value = data;
  for (const key of path) {
    value = value[key];
  }
  return value;
}

/**
 * Updates a value at a path in an object.
 * It clones the objects and arrays in the modified path
 * and creates missing objects and arrays as needed.
 * Returns the new root object.
 */
function updateAtPath(data: any, path: Path, f: (value: any) => any): any {
  if (path.length === 0) {
    return f(data);
  }
  const key = path[0];
  if (path.length === 1) {
    if (typeof key === 'number') {
      const array = [...(data || [])];
      array[key] = f(array?.[key]);
      return array;
    } else {
      return {
        ...(data || {}),
        [key]: f(data?.[key]),
      };
    }
  }
  if (typeof key === 'number') {
    const array = [...(data || [])];
    array[key] = updateAtPath(array[key], path.slice(1), f);
    return array;
  } else {
    return {
      ...(data || {}),
      [key]: updateAtPath(data[key], path.slice(1), f),
    };
  }
}

class Context {
  private _value: any;

  constructor(
    private data: any,
    private path: Path,
    private rootGroup: Group,
    private groupPath: Path,
  ) {
    this._value = getAtPath(data, path);
  }

  get value(): any {
    return this._value;
  }

  has(key: string | number): boolean {
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
    if (!this.has(key)) {
      throw new Error(`Expected key "${key}" at ${this.toString()}`);
    }
    return new Context(
      this.data,
      [...this.path, key],
      this.rootGroup,
      this.groupPath,
    );
  }

  exit(key: string | number): Context {
    const lastkey = this.path[this.path.length - 1];
    if (lastkey !== key) {
      throw new Error(`Expected to exit ${key} but was ${lastkey}`);
    }
    return new Context(
      this.data,
      this.path.slice(0, -1),
      this.rootGroup,
      this.groupPath,
    );
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
      this.rootGroup,
      this.groupPath,
    );
  }

  exitArray(): Context {
    const lastkey = this.path[this.path.length - 1];
    if (typeof lastkey !== 'number') {
      throw new Error(`Expected to exit array but path is ${this.toString()}`);
    }
    return new Context(
      this.data,
      this.path.slice(0, -1),
      this.rootGroup,
      this.groupPath,
    );
  }

  toString() {
    return ['$', ...this.path].join('.');
  }

  save(value: any): Context {
    const rootGroup = {
      ...this.rootGroup,
      result: updateAtPath(this.rootGroup.result, this.path, () => value),
    };
    if (this.groupPath.length > 0) {
      let groups = rootGroup.groups;
      for (let p = this.groupPath.slice(1); p.length > 0; p = p.slice(0, -3)) {
        groups = updateAtPath(groups, p, (g: Group) => ({
          ...g,
          result: updateAtPath(
            g.result,
            this.path.slice(g.scope.length),
            (oldValue) => {
              if (typeof oldValue !== 'undefined') {
                if (!Array.isArray(oldValue)) {
                  oldValue = [oldValue];
                }
                oldValue.push(value);
                return oldValue;
              }
              return value;
            },
          ),
        }));
      }
      rootGroup.groups = groups;
    }
    return new Context(this.data, this.path, rootGroup, this.groupPath);
  }

  get result() {
    return this.rootGroup.result;
  }

  enterGroup(name: string): Context {
    const groupPath = [...this.groupPath, 'groups', name];
    const rootGroup = updateAtPath(this.rootGroup, groupPath, (groups) => {
      const newGroups = [
        ...(groups || []),
        {
          scope: this.path,
          result: undefined,
          groups: {},
        },
      ];
      groupPath.push(newGroups.length - 1);
      return newGroups;
    });
    return new Context(this.data, this.path, rootGroup, groupPath);
  }

  exitGroup(): Context {
    const groupPath = this.groupPath.slice(0, -3);
    return new Context(this.data, this.path, this.rootGroup, groupPath);
  }

  get groupsResults(): { [key: string]: GroupResult[] } {
    return groupToGroupResult(this.rootGroup).groups ?? {};
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
    if (
      !ctx.value ||
      typeof ctx.value !== 'object' ||
      Array.isArray(ctx.value)
    ) {
      throw new Error(`Expected object at ${ctx.toString()}`);
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

export function group(name: string, parser: Parser, ...parsers: Parser[]) {
  return (ctx: Context) => {
    ctx = ctx.enterGroup(name);
    ctx = parser(ctx);
    for (const parser of parsers) {
      ctx = parser(ctx);
    }
    ctx = ctx.exitGroup();
    return ctx;
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
    return ctx.exitArray();
  };
}

export class JsonRegExp {
  constructor(private parser: Parser) {}

  exec(data: any): Result {
    const ctx = new Context(
      data,
      [],
      {
        scope: [],
        result: undefined,
        groups: {},
      },
      [],
    );
    const res = Object.create(null) as Result;
    try {
      const out = this.parser(ctx);
      res.match = true;
      res.value = out.result;
      res.groups = out.groupsResults;
    } catch (err: any) {
      res.match = false;
      res.error = err;
    }
    return res;
  }
}
