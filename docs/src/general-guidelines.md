# General Guidelines

## Use `undefined` Over `null`

JavaScript has two very similar types for very similar things: `undefined` and `null`. In
TypeScript, optionality of a field in an object and optionality of an argument in a function is
expressed by `?` which evaluates to _something or `undefined`_. Absence of an object field or an
argument however cannot be expressed with `null` since a type that may be _something or `null`_ must
always be declared and may not be absent. Thus, there is simply no good reason to use `null` for
anything unless it's required by another API.
