# Generating Screenshots

Requirements:

- Access to the internal "screenshot"-repository
- Python 3
- A fresh identity in the correct build variant with an empty contact- and chat-list

Convert the screenshot data files:

    python tools/convert-screenshot-data.py ../path/to/screenshot/repository/

## The automatic way

Ensure that you are running a python environment with `pillow` installed. To generate consumer and
work screenshots, you will need two files `test-data-consumer-live.json` and
`test-data-work-live.json` of the same form and in the same folder as
`test-data-consumer-sandbox.json` but with a live-ID (use the console client to generate one).
Furthermore, you will need valid work credentials. Just append them to the top-level of the json as
follows:

```
  "deviceCookie": "0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f",
  "workData": {
    "username": "username_here",
    "password": "password_here"
  }
```

Then, simply run `npm run generate-screenshots`. The un-edited results will be in
`build/playwright/screenshots/marketing` and the edited screenshots (by a python script
`tools/macos-style-screenshots.py` to make them look like macOS screenshots) in
`build/playwright/screenshots/out/macOS`.

**Note: Be careful not to push the work credentials!!!**

The generated screenshots correspond to the list below.

### Adding a new language

If we add a new language, the screenshots should work out of the box but for one thing: The search
expresions in `playwright/common/utils/screenshot-utils` need to be extended correspondingly for the
search screenshot to work.

## The manual way

Choose the desired language in the app settings. Then press the "Import screenshot data" button in
the debug panel (under "Storage").

Set the title using `document.title = 'Threema'` or `document.title = 'Threema Work'`.

Create screenshots of the resulting window (manually for now). It is recommended to include the
following screens:

- 1: Welcome screen
- 2: Chat with Hanna without sidebar
- 3: Chat with Foodies without sidebar
- 4: Chat with Foodies without sidebar with emoji picker
- 5: Chat with Foodies with sidebar
- 6: Chat with Foodies without sidebar, with contact list on the left
- 7: Settings: Profile
- 8: Settings: Appearance
- 9: Global search: Search for "to" (EN) or "er" (DE) while Foodies is open

Create screenshots with the following configurations:

- Light and dark mode
- EN and DE (Note: you need to re-import screenshot data after a language change)
