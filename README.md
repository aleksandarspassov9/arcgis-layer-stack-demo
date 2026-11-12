# RouteMap · 3D Layer Explorer

Standalone Angular 21 demo using ArcGIS Maps SDK for JavaScript 4.34 and a local SceneView. The scene uses synthetic geometry and a schematic base. All ArcGIS assets are served by the application. No ArcGIS account or API key is required.

## Run

Use Node.js 24 LTS.

```sh
npm ci
npm start
```

Open http://127.0.0.1:4200 in a browser with WebGL enabled. The start command builds and serves the compiled demo. Run `npm run preview` to serve an existing build. Angular watch mode is available with `npm run dev`.

## Demo

1. Open **Top-down** to see where the three layers overlap.
2. Switch to **Angled** and move **Spread** from 0% to 100%.
3. Start **Orbit** and move the slider while the camera rotates.
4. Right-drag to rotate manually, or scroll to zoom. Either action stops Orbit.
5. Toggle a layer in the side panel or click a feature to show its name.

The layers use small Z separations at 0% to prevent rendering artifacts from overlapping geometry.
