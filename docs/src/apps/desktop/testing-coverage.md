# Test Coverage

We use [nyc istanbul](https://github.com/istanbuljs/nyc) for our test coverage reporting. We
calculate the coverage using our mocha and karma unit tests. The following script can be used to run
tests and generate a coverage report:

```
pnpm run coverage
```

The output can be found in `./coverage`. We produce an `lcov` report and a `cobertura` report for
integrated `git` support.

> ⚠️ _Note: All Svelte files and the corresponding `ts` files are excluded from test coverage
> calculations. The reason for that is twofold: First, Svelte lacks proper code instrumentation
> support. Second, we use a relatively complex setup using Vite, Electron, Svelte & Playwright which
> makes proper instrumentation in Playwright tests very challenging!_
