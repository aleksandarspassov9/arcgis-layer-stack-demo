import Graphic from '@arcgis/core/Graphic.js';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer.js';
import Point from '@arcgis/core/geometry/Point.js';
import Polygon from '@arcgis/core/geometry/Polygon.js';
import Polyline from '@arcgis/core/geometry/Polyline.js';
import SpatialReference from '@arcgis/core/geometry/SpatialReference.js';
import SimpleFillSymbol from '@arcgis/core/symbols/SimpleFillSymbol.js';
import SimpleLineSymbol from '@arcgis/core/symbols/SimpleLineSymbol.js';
import SimpleMarkerSymbol from '@arcgis/core/symbols/SimpleMarkerSymbol.js';

type XY = [number, number];
export const center: XY = [2610000, 5250000];
export const spatialReference = SpatialReference.WebMercator;
export const footprint: XY[] = [[-5900,-4200],[-5900,4200],[5900,4200],[5900,-4200]];

export const layerDefinitions = [
  { title: 'Priority Areas', color: '#55d8b4', kind: 'Planning zones' },
  { title: 'Additional Layers', color: '#61b7ff', kind: 'Connections' },
  { title: 'PAO', color: '#bca0ff', kind: 'Sites' }
];

const areas: XY[][] = [
  [[-4620,-1500],[-4300,800],[-2360,1520],[-850,520],[-1240,-1640],[-2870,-2450]],
  [[-1650,-1160],[-1080,1950],[750,2280],[1940,1200],[1660,-560],[530,-1750]],
  [[920,-2100],[2190,-520],[3750,-240],[4720,-1680],[3690,-2810],[2030,-2850]],
  [[1950,790],[2480,2630],[4490,2810],[4940,1410],[3540,640]]
];
const corridors: XY[][] = [
  [[-5100,-2250],[-3380,-1200],[-1650,-470],[120,410],[2130,1000],[4760,1720]],
  [[-4400,2510],[-2680,1590],[-1230,490],[120,410],[1680,-640],[3500,-1990],[4830,-2400]],
  [[-780,-2900],[-510,-1210],[120,410],[830,1880],[1610,3040]],
  [[-3210,-2460],[-2310,-470],[-1320,920],[410,1740],[2480,2090],[4480,2710]]
];
const sites: XY[] = [[-4330,-1610],[-3350,-940],[-2860,700],[-2320,1430],[-1600,-600],[-1230,490],[120,410],[560,1570],[1030,-840],[1740,1990],[2330,1120],[2730,-1650],[3430,-940],[3960,1840],[4450,2440]];

function project([x, y]: XY): number[] {
  return [center[0] + x, center[1] + y];
}

function line(path: XY[], color: string, width: number, name?: string): Graphic {
  return new Graphic({
    geometry: new Polyline({ paths: [path.map(project)], spatialReference }),
    symbol: new SimpleLineSymbol({ color, width }),
    attributes: name ? { name } : undefined
  });
}

function polygon(ring: XY[], color: number[], outline: string, name?: string): Graphic {
  return new Graphic({
    geometry: new Polygon({ rings: [[...ring, ring[0]].map(project)], spatialReference }),
    symbol: new SimpleFillSymbol({ color, outline: { color: outline, width: 1.25 } }),
    attributes: name ? { name } : undefined
  });
}

export function elevation(offset: number) {
  return { mode: 'absolute-height' as const, offset, unit: 'meters' as const };
}

export function createLayers() {
  const base = new GraphicsLayer({
    title: 'Schematic base',
    elevationInfo: elevation(8),
    graphics: [polygon(footprint, [21, 34, 52, 1], '#52718d')]
  });

  const gridLines = [];
  for (let x = -5000; x <= 5000; x += 1000) gridLines.push(line([[x,-4200],[x,4200]], '#334d63', .55));
  for (let y = -4000; y <= 4000; y += 1000) gridLines.push(line([[-5900,y],[5900,y]], '#334d63', .55));
  const grid = new GraphicsLayer({ elevationInfo: elevation(12), graphics: gridLines });
  const thematic = [
    areas.map((ring, index) => polygon(ring, [44, 185, 143, .38], layerDefinitions[0].color, 'Priority area ' + (index + 1))),
    corridors.map((path, index) => line(path, layerDefinitions[1].color, 2.2, 'Connection ' + (index + 1))),
    sites.map(([x, y], index) => new Graphic({
      geometry: new Point({ x: center[0] + x, y: center[1] + y, spatialReference }),
      symbol: new SimpleMarkerSymbol({ color: layerDefinitions[2].color, size: index % 4 === 0 ? 10 : 6, outline: { color: '#f0e8ff', width: 1 } }),
      attributes: { name: 'Site ' + (index + 1) }
    }))
  ];
  const levels = layerDefinitions.map(({title, color}, index) => ({
    features: new GraphicsLayer({ title, graphics: thematic[index] }),
    frame: new GraphicsLayer({ title: title + ' frame', graphics: [line([...footprint, footprint[0]], color, 1.3)] })
  }));
  return { base, grid, levels };
}
