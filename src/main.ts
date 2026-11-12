import { afterNextRender, Component, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import esriConfig from '@arcgis/core/config.js';
import Map from '@arcgis/core/Map.js';
import Camera from '@arcgis/core/Camera.js';
import Point from '@arcgis/core/geometry/Point.js';
import SceneView from '@arcgis/core/views/SceneView.js';
import { center, createLayers, elevation, layerDefinitions, spatialReference, topDownMap } from './demo-scene';

@Component({
  selector: 'app-root',
  template: `
    <header class="header">
      <div><div class="brand">ROUTEMAP</div><h1>3D Layer Explorer</h1></div>
      <span class="badge">Sample data</span>
    </header>
    <main class="workspace">
      <section class="stage" aria-label="Interactive map">
        <div class="map" [hidden]="fallback()" #map></div>
        @if (fallback()) {
          <p class="fallback-status" role="status">2D view · 3D is unavailable in this browser</p>
          <svg class="fallback-map" viewBox="-6300 -4600 12600 9200" role="group" aria-label="Top-down map">
            <defs>
              <pattern id="map-grid" width="1000" height="1000" patternUnits="userSpaceOnUse">
                <path d="M 1000 0 H 0 V 1000" fill="none" stroke="#334d63" stroke-width="14"/>
              </pattern>
            </defs>
            <rect x="-5900" y="-4200" width="11800" height="8400" fill="#152234"/>
            <rect x="-5900" y="-4200" width="11800" height="8400" fill="url(#map-grid)" stroke="#52718d" stroke-width="24"/>
            @if (visibility()[0]) {
              @for (area of topDown.areas; track area.name) {
                <polygon [attr.points]="area.points" fill="#2cb98f" fill-opacity=".38"
                  [attr.stroke]="definitions[0].color" stroke-width="30" tabindex="0" role="button" [attr.aria-label]="area.name"
                  (click)="selection.set(area.name)" (keydown.enter)="selection.set(area.name)" />
              }
            }
            @if (visibility()[1]) {
              @for (corridor of topDown.corridors; track corridor.name) {
                <polyline [attr.points]="corridor.points" fill="none" [attr.stroke]="definitions[1].color"
                  stroke-width="48" tabindex="0" role="button" [attr.aria-label]="corridor.name"
                  (click)="selection.set(corridor.name)" (keydown.enter)="selection.set(corridor.name)" />
              }
            }
            @if (visibility()[2]) {
              @for (site of topDown.sites; track site.name) {
                <circle [attr.cx]="site.x" [attr.cy]="site.y" r="85" [attr.fill]="definitions[2].color"
                  stroke="#f0e8ff" stroke-width="20" tabindex="0" role="button" [attr.aria-label]="site.name"
                  (click)="selection.set(site.name)" (keydown.enter)="selection.set(site.name)" />
              }
            }
          </svg>
        } @else {
        <div class="toolbar">
          <div class="presets" aria-label="Camera presets">
            <button type="button" [class.active]="preset() === 'angled'" [attr.aria-pressed]="preset() === 'angled'" [disabled]="!ready()" (click)="setPreset('angled')">Angled</button>
            <button type="button" [class.active]="preset() === 'top'" [attr.aria-pressed]="preset() === 'top'" [disabled]="!ready()" (click)="setPreset('top')">Top-down</button>
          </div>
          <button class="orbit" type="button" [class.active]="orbiting()" [attr.aria-pressed]="orbiting()" [disabled]="!ready()" (click)="toggleOrbit()">⟳ Orbit</button>
        </div>
        @if (!ready()) {
          <p class="map-status" role="status">Loading 3D scene…</p>
        }
        <p class="map-hint">Right-drag to rotate · Scroll to zoom</p>
        }
        @if (selection(); as name) {
          <button class="selection" type="button" (click)="selection.set(null)" aria-label="Clear selection">{{ name }} ×</button>
        }
      </section>
      <aside class="panel">
        @if (!fallback()) {
        <div class="control">
          <label for="spread">Spread <output for="spread">{{ spread() }}%</output></label>
          <input id="spread" type="range" min="0" max="100" [value]="spread()" [disabled]="!ready()" (input)="setSpread($event)" />
          <div class="scale"><span>Merged</span><span>Separated</span></div>
        </div>
        }
        <h2>Layers</h2>
        @for (layer of definitions; track layer.title; let index = $index) {
          <label class="layer">
            <span class="swatch" [style.background]="layer.color"></span>
            <span class="layer-text">{{ layer.title }}<small>{{ layer.kind }}</small></span>
            <input type="checkbox" [checked]="visibility()[index]" [disabled]="!ready() && !fallback()" (change)="setVisibility(index, $event)" />
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
  readonly fallback = signal(false);
  readonly topDown = topDownMap;
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
      const context = document.createElement('canvas').getContext('webgl2');
      if (!context) {
        this.fallback.set(true);
        return;
      }
      context.getExtension('WEBGL_lose_context')?.loseContext();
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
      this.view?.destroy();
      this.view = undefined;
      this.levels = [];
      this.ready.set(false);
      this.fallback.set(true);
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
