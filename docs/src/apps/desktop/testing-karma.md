# Karma: DOM Unit Tests

Root: `src/test/karma/`

Karma tests run in the browser and have access to DOM APIs.

```bash
# Single run in all configured browsers.
pnpm run test:desktop:karma
# Single run in Firefox (headless).
pnpm run test:desktop:karma -- --browsers FirefoxHeadless
```
