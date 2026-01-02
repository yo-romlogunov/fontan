# CEP After Effects CEP Panel Reference

Short, practical reference for building CEP HTML/JS panels that talk to After Effects via ExtendScript (`evalScript`). Keep JSX ES3-compatible; panel code can be modern Chromium/Node (depends on CEP).

## Runtime Versions (compat)
- CEP 10 (AE 2022/2023): Chromium 87, Node 16.13, ExtendScript 4.5.
- CEP 11 (AE 2024+): Chromium 91, Node 16.13.
- JSX engine is ES3/ES5 only: no `let/const`, no promises. Transpile/shim JSX separately.

## Minimal Project Layout
- `CSXS/manifest.xml` — manifest (id, host versions, permissions).
- `index.html` — panel UI, loads `CSInterface.js`.
- `js/main.js` — panel logic, bridge to JSX.
- `jsx/main.jsx` — ExtendScript functions callable from panel.
- `icons/` — icons 23px/48px.

## Manifest Example (CEP 10+)
```xml
<?xml version="1.0" encoding="UTF-8"?>
<ExtensionManifest Version="7.0" ExtensionBundleId="com.example.ae.panel" ExtensionBundleVersion="1.0.0" ExtensionBundleName="Example Panel">
  <ExtensionList>
    <Extension Id="com.example.ae.panel" Version="1.0.0"/>
  </ExtensionList>
  <ExecutionEnvironment>
    <HostList>
      <Host Name="AEFT" Version="[18.0,99.9]" />
    </HostList>
    <LocaleList><Locale Code="All"/></LocaleList>
    <RequiredRuntimeList>
      <RequiredRuntime Name="CSXS" Version="11.0"/>
    </RequiredRuntimeList>
  </ExecutionEnvironment>
  <DispatchInfoList>
    <Extension Id="com.example.ae.panel">
      <DispatchInfo>
        <Resources>
          <MainPath>index.html</MainPath>
          <ScriptPath>jsx/main.jsx</ScriptPath>
          <CEFCommandLine>
            <Parameter>--enable-nodejs</Parameter>
            <Parameter>--allow-file-access-from-files</Parameter>
          </CEFCommandLine>
        </Resources>
        <Lifecycle><AutoVisible>true</AutoVisible></Lifecycle>
        <UI>
          <Type>Panel</Type>
          <Menu>Example Panel</Menu>
          <Geometry><Size><Height>600</Height><Width>400</Width></Size></Geometry>
          <Icons>
            <Icon Type="Normal">icons/icon.png</Icon>
            <Icon Type="RollOver">icons/icon.png</Icon>
          </Icons>
        </UI>
      </DispatchInfo>
    </Extension>
  </DispatchInfoList>
</ExtensionManifest>
```

## Basic Panel HTML (`index.html`)
```html
<!doctype html>
<html>
<head>
  <meta charset="UTF-8" />
  <script src="lib/CSInterface.js"></script>
  <script src="js/main.js"></script>
</head>
<body>
  <button id="btnHello">Say Hello</button>
  <pre id="log"></pre>
</body>
</html>
```

## Panel Logic (`js/main.js`)
```js
(function () {
  const cs = new CSInterface();
  function log(msg) {
    document.querySelector('#log').textContent += msg + '\n';
  }
  document.querySelector('#btnHello').addEventListener('click', () => {
    cs.evalScript('main_hello()', result => log('JSX: ' + result));
  });
  cs.addEventListener('com.adobe.csxs.events.ThemeColorChanged', () => syncTheme(cs));
})();
```

## JSX (`jsx/main.jsx`)
```js
// Use var only; ES3 compatible
function main_hello() {
  return "Hello from JSX " + app.version;
}

function ensureProject() {
  if (!app.project) throw new Error("No project open");
}
```

## Calling JSX with Arguments
```js
// panel
cs.evalScript(`apply_label(${JSON.stringify({label: 9})})`);

// jsx
function apply_label(optsJson) {
  var opts = JSON.parse(optsJson);
  ensureProject();
  var item = app.project.activeItem;
  if (item && item instanceof CompItem) item.label = opts.label;
  return "ok";
}
```

## Async/Error Handling
- `evalScript` takes a callback string only; return strings/JSON yourself.
- Wrap JSX in `try/catch` and return meaningful strings/JSON with errors.
- Avoid large payloads (>1–2 MB) through `evalScript`; use files for bulk data.

## Theming
- Get skin info via `csInterface.getHostEnvironment().appSkinInfo`.
- Listen to `ThemeColorChanged` and reapply colors in panel.

## Debugging
- Enable debug: create `~/Library/Preferences/com.adobe.CSXS.<cepVersion>.plist` with `PlayerDebugMode=1`, `LogLevel=6`.
- Logs: `~/Library/Logs/CSXS/cep_runner.log` (+ variants).
- Inspector: `Cmd+Opt+I` in panel when debug enabled.
- JSX logs: `~/Library/Preferences/Adobe/After Effects/<version>/logs` or ESTK/VSCode ExtendScript Debugger.

## Install Locations
- User: `~/Library/Application Support/Adobe/CEP/extensions/<id>/`
- System: `/Library/Application Support/Adobe/CEP/extensions/<id>/`
- Dev: symlink or run from any folder in debug mode.

## Security/Permissions
- File access in panel: `--allow-file-access-from-files` in manifest.
- Network: Chromium fetch/XHR works.
- `evalScript` runs with AE permissions; confirm before destructive actions.

## Bridge Pattern (promise helper)
```js
function callJsx(fn, payload = {}) {
  const cs = new CSInterface();
  return new Promise((resolve, reject) => {
    const arg = JSON.stringify(payload);
    cs.evalScript(`${fn}(${arg})`, res => {
      try {
        const parsed = JSON.parse(res);
        if (parsed && parsed.error) reject(parsed.error);
        else resolve(parsed !== null ? parsed : res);
      } catch (e) {
        if (res && res.indexOf('Error:') === 0) reject(res);
        else resolve(res);
      }
    });
  });
}
```

## Events (JSX → Panel)
```js
// jsx
function dispatchPanelEvent(type, data) {
  var eventObj = new CSXSEvent();
  eventObj.type = type; // e.g. "com.example.ae.panel.custom"
  eventObj.data = data;
  eventObj.dispatch();
}
```
```js
// panel
cs.addEventListener('com.example.ae.panel.custom', evt => log(evt.data));
```

## Common AE Operations (JSX)
```js
function listComps() {
  ensureProject();
  var comps = [];
  var items = app.project.items;
  for (var i = 1; i <= items.length; i++) {
    if (items[i] instanceof CompItem) comps.push(items[i].name);
  }
  return JSON.stringify(comps);
}
```

## Render/Export (JSX)
- Add to Render Queue: `app.project.renderQueue.items.add(comp);`
- Set output: `rqItem.outputModule(1).file = new File("/path/output.mov");`
- No native promises; use polling or CSXS events for status.

## Settings/Storage
- Panel: `window.localStorage` for quick UI prefs.
- Shared: write JSON in `Folder.userData`.
- JSX: `app.settings.saveSetting(section, key, value)` and `app.settings.haveSetting`.

## Localization
- Keep strings in JSON; pick by `cs.getHostEnvironment().appUILocale`.

## Dependencies/Bundling
- Panel may bundle npm deps (esbuild/webpack/rollup) → final JS/HTML.
- JSX must be ES3 single file; transpile/concat separately and avoid modern globals without polyfills.

## Hot Reload (dev)
- Changing manifest version reloads panel automatically.
- For UI changes: context menu → Reload, or `window.location.reload()`.

## Signing/Distribution
- Sign: `ZXPSignCmd -sign extensionDir signed.zxp cert.p12 <password>`.
- Install: `ExManCmd --install signed.zxp` or CC Desktop drag (not always reliable).
- Un-signed works only in dev mode (`PlayerDebugMode=1`).

## Pitfalls
- Two runtimes: Chromium UI vs ExtendScript JSX. Validate types, exchange JSON strings.
- Avoid large strings through `evalScript`; use files for bulk data.
- JSX without `try/catch` will fail silently; handle and return errors.
- Resource paths: use `cs.getSystemPath(SystemPath.USER_DATA)` and `window.cep.fs` from UI when needed.

## Quick Release Checklist
- Manifest host/CEP versions correct; `AutoVisible` set as intended.
- Icons 23/48 px present; id/name match.
- `PlayerDebugMode` off on production machines.
- JSX errors caught and surfaced to user.
- Build minimized; heavy deps trimmed.
- Tested on min and latest AE versions targeted.

## Useful Paths
- CEP logs: `~/Library/Logs/CSXS/`
- AE prefs/logs: `~/Library/Preferences/Adobe/After Effects <version>/`
- Extensions: `~/Library/Application Support/Adobe/CEP/extensions/` (mac) / `%APPDATA%\\Adobe\\CEP\\extensions` (win)

## Testing JSX Without Panel
- Save `.jsx` and run: File → Scripts → Run Script File… in AE.
- Check output via ExtendScript Toolkit console or AE log file.
