# JSON data RegExp

:warning: This is a work in progress. The API is not stable yet.

A library to create RegExp like expresisons for JSON data.

```js
import { JsonRegExp, array, obj, field, val, number, zeroOrMore, or } from 'json-data-regexp';

const re = new JsonRegExp(
  array(
    obj(
      field('name', val('John')),
      field('age', number())
    ),
    zeroOrMore(
      obj(
        field('device', or(val('iPhone'), val('MacBook'), val('PC'))),
        field('count', number())
      )
    )
  )
);

const match = re.exec([
  { name: 'John', age: 39 },
  { device: 'iPhone', count: 1 },
  { device: 'MacBook', count: 2 },
  { device: 'PC', count: 1 }
]);
```
