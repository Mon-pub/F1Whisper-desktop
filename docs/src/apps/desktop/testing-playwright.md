## Playwright: Integration / End-to-End Tests

We use [Playwright](https://playwright.dev/) for e2e testing. All tests should be placed in
`src/test/playwright/tests`. Right now, we only support testing with `consumer-sandbox` profiles. To
run the tests, execute the following command:

```bash
# E.g. `consumer-sandbox`:
pnpm run test:desktop:playwright:consumer-sandbox
```

### Environment Variables:

|                  Name | Description                                             |             Types |
| --------------------: | ------------------------------------------------------- | ----------------: |
| `PLAYWRIGHT_HEADLESS` | Run tests in headless mode                              | `true` or `false` |
|   `PLAYWRIGHT_FLAVOR` | App variant and environment, e.g. "consumer-sandbox"    |   `BUILD_FLAVORS` |
|  `PLAYWRIGHT_PROFILE` | Will be added to `--threema-profile`, e.g. "playwright" |          `string` |

If you're using
[Playwright Test for VSCode](https://marketplace.visualstudio.com/items?itemName=ms-playwright.playwright)
you can setup the required env vars in your `settings.json`:

```json
  "playwright.env": {
    "PLAYWRIGHT_HEADLESS": false,
    "PLAYWRIGHT_FLAVOR": "consumer-sandbox",
    "PLAYWRIGHT_PROFILE": "playwright"
  }
```

### Test Data:

Playwright is expecting a test data file at `src/test/playwright/`. The filename should be
`test-data-${PLAYWRIGHT_FLAVOR}.json` and match your `PLAYWRIGHT_FLAVOR` e.g.
`test-data-consumer-sandbox.json`

For local development, you shouldn’t modify this file. Instead, create a local override with the
filename `test-data-${PLAYWRIGHT_FLAVOR}.local.json`.

```json
{
  "profile": {
    "identity": "XXXXXXXX",
    "keyStoragePassword": "CHANGE_ME",
    "privateKey": "private key as hex string"
  },
  "serverGroup": "XX",
  "deviceIds": {
    "d2mDeviceId": 123,
    "cspDeviceId": 456
  },
  "deviceCookie": 16
}
```

A standalone ThreemaId can be created with the following tools from our GitLab instance:

`console-client`:

```bash
./console/threema-console -s \
    data-path/identity1 \
    data-path/contacts \
    data-path/nonces \
    createIdentity
```

Identity, privateKey and serverGroup can be found in `data-path/identity1` after invoking this
command.

`libthreema`:

```bash
cargo run --example identity-create --features=cli -- --consumer sandbox
```

You should find something like this in the output.

```bash
--threema-id <identity>
--client-key <privateKey>
--csp-server-group <serverGroup>
```
