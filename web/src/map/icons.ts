// Settlement icons: one shape per place type, drawn on a 24x24 grid. The same paths feed the map
// (as signed-distance-field images, so a point takes its holder's colour and a halo outline) and
// the legend (as inline SVG), so the two always match. Colour stays the holder's: the shape alone
// says what kind of place it is.

/** SVG path per settlement type (24x24 grid, centred on 12,12). */
export const SHAPES: Record<string, string> = {
  village: "M12 6a6 6 0 1 0 0.001 0Z",
  hamlet: "M12 8a4 4 0 1 0 0.001 0Z",
  town: "M4 4H20V20H4Z",
  small_town: "M5.5 5.5H18.5V18.5H5.5Z",
  new_village: "M12 4L20 19H4Z",
  deserted_village: "M6.2 4L12 9.8L17.8 4L20 6.2L14.2 12L20 17.8L17.8 20L12 14.2L6.2 20L4 17.8L9.8 12L4 6.2Z",
  farmstead: "M12 6L18 12L12 18L6 12Z",
  castle: "M5 20V7H8V10H10.5V7H13.5V10H16V7H19V20Z",
  abbey: "M10 3H14V8H19V12H14V21H10V12H5V8H10Z",
  priory: "M10.5 6H13.5V9.5H17V12.5H13.5V19H10.5V12.5H7V9.5H10.5Z",
  saltworks: "M12 4L19 8V16L12 20L5 16V8Z",
  free_village: "M12 3L14.6 9.2L21 9.5L16 13.6L17.8 20L12 16.4L6.2 20L8 13.6L3 9.5L9.4 9.2Z",
};
/** Legend order: towns first, then villages, then the rest. */
export const SHAPE_ORDER = ["town", "small_town", "village", "new_village", "free_village", "hamlet", "farmstead",
  "castle", "abbey", "priory", "saltworks", "deserted_village"];

export const iconName = (type: string) => `place-${SHAPES[type] ? type : "village"}`;

/** Inline SVG of a type's shape, for legends. */
export function shapeSvg(type: string, fill = "#ffffff", stroke = "#52514e"): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "shape");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", SHAPES[type] ?? SHAPES.village);
  path.setAttribute("fill", fill);
  path.setAttribute("stroke", stroke);
  path.setAttribute("stroke-width", "1.6");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
  return svg;
}

const SCALE = 2; // device pixels per grid unit (pixelRatio of the map images)
const PAD = 6; // grid units of room for the halo around the 24x24 shape
const RADIUS = 8; // device pixels over which the distance field falls off
const CUTOFF = 0.25; // the shape's edge sits at alpha 0.75, as MapLibre's SDF icons expect

/** 1-D squared Euclidean distance transform (Felzenszwalb & Huttenlocher). */
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/** Squared distance from every pixel to the nearest pixel where `seed` is true. */
function edt(seed: Uint8Array, size: number): Float64Array {
  const grid = new Float64Array(size * size);
  for (let i = 0; i < grid.length; i++) grid[i] = seed[i] ? 0 : 1e20;
  const f = new Float64Array(size), d = new Float64Array(size), z = new Float64Array(size + 1);
  const v = new Int32Array(size);
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) f[y] = grid[y * size + x];
    edt1d(f, size, d, v, z);
    for (let y = 0; y < size; y++) grid[y * size + x] = d[y];
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) f[x] = grid[y * size + x];
    edt1d(f, size, d, v, z);
    for (let x = 0; x < size; x++) grid[y * size + x] = d[x];
  }
  return grid;
}

/** A type's shape as an SDF image for map.addImage(..., { sdf: true, pixelRatio: SCALE }). */
export function shapeImage(type: string): { width: number; height: number; data: Uint8Array } {
  const size = (24 + 2 * PAD) * SCALE;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(SCALE, 0, 0, SCALE, PAD * SCALE, PAD * SCALE);
  ctx.fill(new Path2D(SHAPES[type] ?? SHAPES.village));
  const alpha = ctx.getImageData(0, 0, size, size).data;
  const inside = new Uint8Array(size * size);
  const outside = new Uint8Array(size * size);
  for (let i = 0; i < inside.length; i++) {
    inside[i] = alpha[i * 4 + 3] > 127 ? 1 : 0;
    outside[i] = 1 - inside[i];
  }
  const toInside = edt(inside, size); // for outside pixels: distance to the shape
  const toOutside = edt(outside, size); // for inside pixels: distance to the background
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < inside.length; i++) {
    const signed = inside[i] ? -(Math.sqrt(toOutside[i]) - 0.5) : Math.sqrt(toInside[i]) - 0.5;
    const a = Math.max(0, Math.min(255, Math.round(255 - 255 * (signed / RADIUS + CUTOFF))));
    data.set([255, 255, 255, a], i * 4);
  }
  return { width: size, height: size, data };
}

export const ICON_PIXEL_RATIO = SCALE;
