# Test Coverage

We use [nyc istanbul](https://github.com/istanbuljs/nyc) for our test coverage reporting. We
calculate the coverage using our mocha and karma unit tests. The following scripts can be used for
the coverage reports:

```
npm run coverage:mocha # Runs all mocha tests and prints the coverage of all files included in mocha to the shell. This only includes the files visited by mocha as well as their transitive imports.
npm run coverage:full # Runs all mocha and karma tests and combines their coverage. This should include (almost) all files except for the ui folder
```

The output of the full coverage can be found in `./coverage`. We produce an `lcov` report and a
`cobertura` report for integrated `git` support.

Since karma support is limited and we only have few karma tests, we refrain from adding a separate
script for karma coverage alone. If need arises, it can easily be achieved as follows:

```
npm run test:karma
npx nyc report --reporter=text --temp-dir=.nyc_output_karma/chrome
```

> ⚠️ _Note: All svelte files and the corresponding `ts` files are excluded from test coverage
> calculations. The reason for that is twofold: Firstly, svelte lacks proper code instrumentation
> support. Secondly, we use a very complex setup using vite, electron, svelte & playwright which
> makes proper instrumenting in playwright test borderline impossible!_
