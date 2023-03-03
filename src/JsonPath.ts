type KeyAtPath<T, P extends any[]> = P extends [infer K, ...infer R]
  ? K extends keyof T
    ? KeyAtPath<T[K], R>
    : never
  : keyof T;
// type Append<T extends any[], U> = [...T, U];
type Init<T extends any[]> = T extends [...infer R, any] ? R : never;
type Last<T extends any[]> = T extends [...any, infer R] ? R : never;
// type Enter<T, P extends any[]> = Append<P, KeyAtPath<T, P>>;
type TypeAtPath<T, P extends any[]> = P extends [infer K, ...infer R]
  ? K extends keyof T
    ? TypeAtPath<T[K], R>
    : never
  : T;
type ReplaceAtPath<T, P extends any[], X> = P extends [infer K, ...infer R]
  ? K extends keyof T
    ? { [key in keyof T]: key extends K ? ReplaceAtPath<T[K], R, X> : T[key] }
    : never
  : X;

export class JsonPath<T, P extends [...any[]] = [], K = KeyAtPath<T, P>> {
  constructor(readonly data: T, readonly path?: P) {}

  enter(key: K): JsonPath<T, [...P, K], KeyAtPath<T, [...P, K]>> {
    return new JsonPath(this.data, [...(this.path ?? []), key] as [...P, K]);
  }

  exit(): JsonPath<T, Init<P>, Last<P>> {
    if (!this.path || this.path.length === 0) {
      throw new Error('Cannot exit root');
    }
    return new JsonPath(this.data, this.path.slice(0, -1) as Init<P>);
  }

  toString(): string {
    return ['$', ...(this.path ?? [])].join('.');
  }

  get isRoot(): boolean {
    return !this.path || this.path.length === 0;
  }

  value(): TypeAtPath<T, P> {
    if (!this.path || this.path.length === 0) {
      return this.data as any;
    }
    return this.path.reduce((data, key) => data[key], this.data);
  }

  updateValue<X>(
    f: (value: TypeAtPath<T, P>) => X,
  ): JsonPath<ReplaceAtPath<T, P, X>, P, keyof X> {
    const data = updateAtPath(this.data, this.path ?? [], f);
    return new JsonPath(data, this.path);
  }

  setValue<X>(value: X): JsonPath<ReplaceAtPath<T, P, X>, P, keyof X> {
    const data = updateAtPath(this.data, this.path ?? [], () => value);
    return new JsonPath(data, this.path);
  }
}

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

let p = new JsonPath({ a: { b: [1] } });
// p.value();
// const pp = p.enter('a').updateValue((x) => x.b);

// type tt = KeyAtPath<{ a: { b: [1] } }, ['a', 'b']>;
