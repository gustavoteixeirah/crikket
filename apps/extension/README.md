# Crikket browser extension

Chrome MV3 extension for capturing the current tab and submitting a bug report
to the Crikket web app.

Recording uses `tabCapture` from the popup: tab video, tab audio, and the
microphone are mixed in the recorder tab. Tab audio is routed back so the page
keeps playing while you record.

## Configure the target host

The extension talks to the web app and API through **build-time** Vite
variables. Do not hardcode a host in source.

| Variable | Used for |
| --- | --- |
| `VITE_APP_URL` | Web app origin (login, share links) |
| `VITE_SERVER_URL` | API origin (`/rpc`) |

Copy the example env file, then set both URLs to the same host you want the
packed extension to use:

```bash
cp apps/extension/.env.example apps/extension/.env
```

Local development:

```bash
VITE_APP_URL=http://localhost:3001
VITE_SERVER_URL=http://localhost:3000
```

Kode GT production:

```bash
VITE_APP_URL=https://crikket.kodegt.com
VITE_SERVER_URL=https://crikket.kodegt.com
```

You can also pass the variables inline instead of a `.env` file:

```bash
VITE_APP_URL=https://crikket.kodegt.com \
VITE_SERVER_URL=https://crikket.kodegt.com \
  bun run build --filter=extension
```

## Build and load unpacked

```bash
bun run build --filter=extension
```

Output directory:

```text
apps/extension/.output/chrome-mv3
```

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click **Load unpacked**
4. Select `apps/extension/.output/chrome-mv3`

To zip that folder (same layout as the CI artifact):

```bash
bash ./scripts/package-extension.sh
```

Unzip the archive and load the `chrome-mv3` folder unpacked. CI on this fork
uploads `crikket-extension-chrome-mv3` from the **Package extension (Load
unpacked)** job; that build is already pointed at
[https://crikket.kodegt.com](https://crikket.kodegt.com).

## Recording notes

- Start and stop from the popup (or the documented keyboard shortcuts).
- If microphone permission is denied, recording continues with **tab audio
  only** and shows a warning.
- A tab with no audio still records video.
- **Switching tabs mid-recording is not supported** in this `tabCapture`
  model. Stay on the tab you started capturing.
