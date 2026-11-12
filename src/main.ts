import { afterNextRender, Component, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import esriConfig from '@arcgis/core/config.js';
import Map from '@arcgis/core/Map.js';
import Camera from '@arcgis/core/Camera.js';
import Point from '@arcgis/core/geometry/Point.js';
import SceneView from '@arcgis/core/views/SceneView.js';
import { center, createLayers, elevation, layerDefinitions, spatialReference } from './demo-scene';

@Component({
  selector: 'app-root',
  template: `
    <header class="header">
      <div><div class="brand">ROUTEMAP</div><h1>3D Layer Explorer</h1></div>
      <span class="badge">Sample data</span>
    </header>
    <main class="workspace">
      <section class="stage" aria-label="Interactive 3D map">
        <div class="map" #map></div>
        <div class="toolbar">
          <div class="presets" aria-label="Camera presets">
            <button type="button" [class.active]="preset() === 'angled'" [attr.aria-pressed]="preset() === 'angled'" [disabled]="!ready()" (click)="setPreset('angled')">Angled</button>
            <button type="button" [class.active]="preset() === 'top'" [attr.aria-pressed]="preset() === 'top'" [disabled]="!ready()" (click)="setPreset('top')">Top-down</button>
          </div>
          <button class="orbit" type="button" [class.active]="orbiting()" [attr.aria-pressed]="orbiting()" [disabled]="!ready()" (click)="toggleOrbit()">⟳ Orbit</button>
        </div>
        @if (!ready()) {
          <p class="map-status" role="status">{{ error() || 'Loading 3D scene…' }}</p>
        }
        <p class="map-hint">Right-drag to rotate · Scroll to zoom</p>
        @if (selection(); as name) {
          <button class="selection" type="button" (click)="selection.set(null)" aria-label="Clear selection">{{ name }} ×</button>
        }
      </section>
      <aside class="panel">
        <div class="control">
          <label for="spread">Spread <output for="spread">{{ spread() }}%</output></label>
          <input id="spread" type="range" min="0" max="100" [value]="spread()" [disabled]="!ready()" (input)="setSpread($event)" />
          <div class="scale"><span>Merged</span><span>Separated</span></div>
        </div>
        <h2>Layers</h2>
        @for (layer of definitions; track layer.title; let index = $index) {
          <label class="layer">
            <span class="swatch" [style.background]="layer.color"></span>
            <span class="layer-text">{{ layer.title }}<small>{{ layer.kind }}</small></span>
            <input type="checkbox" [checked]="visibility()[index]" [disabled]="!ready()" (change)="setVisibility(index, $event)" />
          </label>
        }
      </aside>
    </main>
  `
})
class App {
  readonly definitions = layerDefinitions;
  readonly spread = signal(64);
  readonly visibility = signal([true, true, true]);
  readonly orbiting = signal(false);
  readonly preset = signal<'angled' | 'top' | null>('angled');
  readonly ready = signal(false);
  readonly error = signal('');
  readonly selection = signal<string | null>(null);
  private readonly container = viewChild.required<ElementRef<HTMLDivElement>>('map');
  private readonly destroyRef = inject(DestroyRef);
  private view?: SceneView;
  private levels: ReturnType<typeof createLayers>['levels'] = [];
  private orbitFrame = 0;
  private spreadFrame = 0;
  private selectionRequest = 0;

  constructor() {
    afterNextRender(() => void this.init());
    this.destroyRef.onDestroy(() => {
      this.stopOrbit();
      cancelAnimationFrame(this.spreadFrame);
      this.view?.destroy();
      this.view = undefined;
    });
  }

  private async init() {
    try {
      esriConfig.assetsPath = new URL('assets/', document.baseURI).href;
      const { base, grid, levels } = createLayers();
      this.levels = levels;
      this.applySpread();
      const view = new SceneView({
        container: this.container().nativeElement,
        map: new Map({ ground: { opacity: 0 }, layers: [base, grid, ...levels.flatMap(({ frame, features }) => [frame, features])] }),
        spatialReference,
        viewingMode: 'local',
        camera: this.cameraAt(28, 64, 21900, 2200),
        environment: {
          background: { type: 'color', color: '#101a2b' },
          starsEnabled: false,
          atmosphereEnabled: false,
          lighting: { type: 'virtual' }
        },
        ui: { components: ['attribution'] }
      });
      this.view = view;
      await view.when();
      if (this.view !== view) return;
      this.ready.set(true);
      const pause = () => {
        this.stopOrbit();
        this.preset.set(null);
      };
      view.on('drag', pause);
      view.on('mouse-wheel', pause);
      view.on('key-down', ({key}) => {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', '+', '-'].includes(key)) pause();
      });
      view.on('click', async event => {
        const request = ++this.selectionRequest;
        const result = await view.hitTest(event, { include: this.levels.map(level => level.features) });
        if (request !== this.selectionRequest || this.view !== view) return;
        const match = result.results.find(item => item.type === 'graphic');
        this.selection.set(match?.type === 'graphic' ? match.graphic.attributes?.name ?? null : null);
      });
    } catch (error) {
      if (this.destroyRef.destroyed) return;
      console.error(error);
      this.error.set('The 3D scene could not start. Check that WebGL is enabled.');
    }
  }

  private cameraAt(heading: number, tilt: number, distance: number, targetZ: number) {
    const direction = heading * Math.PI / 180;
    const inclination = tilt * Math.PI / 180;
    const radius = distance * Math.sin(inclination);
    return new Camera({
      heading, tilt,
      position: new Point({
        spatialReference,
        x: center[0] - radius * Math.sin(direction),
        y: center[1] - radius * Math.cos(direction),
        z: targetZ + distance * Math.cos(inclination)
      })
    });
  }

  setPreset(preset: 'angled' | 'top') {
    if (!this.view) return;
    this.stopOrbit();
    this.preset.set(preset);
    this.view.camera = preset === 'top'
      ? this.cameraAt(0, 0, 25000, 1800)
      : this.cameraAt(28, 64, 21900, 2200);
  }

  toggleOrbit() {
    const view = this.view;
    if (!view) return;
    if (this.orbiting()) {
      this.stopOrbit();
      return;
    }
    // Preset guarantees a consistent center after manual panning or a top-down view.
    this.setPreset('angled');
    this.orbiting.set(true);
    let previous: number | undefined;
    let heading = view.camera.heading;
    const tick = (time: number) => {
      const elapsed = previous === undefined ? 0 : Math.min(time - previous, 50);
      previous = time;
      heading = (heading + elapsed * .009) % 360;
      view.camera = this.cameraAt(heading, 64, 21900, 2200);
      this.orbitFrame = requestAnimationFrame(tick);
    };
    this.orbitFrame = requestAnimationFrame(tick);
  }

  private stopOrbit() {
    cancelAnimationFrame(this.orbitFrame);
    this.orbiting.set(false);
  }

  setSpread(event: Event) {
    this.spread.set(Number((event.target as HTMLInputElement).value));
    cancelAnimationFrame(this.spreadFrame);
    this.spreadFrame = requestAnimationFrame(() => this.applySpread());
  }

  setVisibility(index: number, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    this.visibility.update(values => values.map((visible, item) => item === index ? checked : visible));
    this.selectionRequest++;
    this.selection.set(null);
    this.applySpread();
  }

  private applySpread() {
    const spread = this.spread();
    const gap = 12 + spread * 15;
    this.levels.forEach(({ features, frame }, index) => {
      const offset = 26 + gap * (index + 1);
      features.elevationInfo = elevation(offset);
      frame.elevationInfo = elevation(offset);
      features.visible = this.visibility()[index];
      frame.visible = features.visible && spread > 0;
    });
  }
}

bootstrapApplication(App).catch(console.error);
