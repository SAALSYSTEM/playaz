// SCHRÄGLAGE: deterministische Winkelfunktionen.
// Math.sin/cos/atan2 sind in JavaScript nicht bitgenau festgelegt (Chrome, Safari, Firefox rechnen
// minimal anders). Damit ein Lauf auf jedem Gerät und später auf dem Server exakt gleich nachgerechnet
// werden kann, nutzen Physik und Spiellogik nur diese Funktionen. Sie verwenden ausschließlich
// + - * / und Math.round/Math.abs/Math.sqrt, die laut IEEE 754 überall gleich rechnen.

const PIO2_1 = 1.5707963267341256;      // pi/2 in zwei Teilen (Cody-Waite), damit die Reduktion genau bleibt
const PIO2_1T = 6.077100506506192e-11;
const INV_PIO2 = 0.6366197723675814;
export const PI = 3.141592653589793;
const PIO2 = 1.5707963267948966;
const PIO6 = 0.5235987755982989;
const SQRT3 = 1.7320508075688772;
const TAN_PI12 = 0.2679491924311227;

function sinPoly(x) { // |x| <= pi/4
  const z = x * x;
  return x * (1 + z * (-1 / 6 + z * (1 / 120 + z * (-1 / 5040 + z * (1 / 362880 + z * (-1 / 39916800 + z * (1 / 6227020800 + z * (-1 / 1307674368000))))))));
}
function cosPoly(x) { // |x| <= pi/4
  const z = x * x;
  return 1 + z * (-1 / 2 + z * (1 / 24 + z * (-1 / 720 + z * (1 / 40320 + z * (-1 / 3628800 + z * (1 / 479001600 + z * (-1 / 87178291200 + z * (1 / 20922789888000))))))));
}
function reduce(x) {
  const k = Math.round(x * INV_PIO2);
  const r = (x - k * PIO2_1) - k * PIO2_1T;
  return [r, ((k % 4) + 4) % 4];
}
export function dsin(x) {
  if (x !== x || x === Infinity || x === -Infinity) return NaN;
  const [r, q] = reduce(x);
  switch (q) { case 0: return sinPoly(r); case 1: return cosPoly(r); case 2: return -sinPoly(r); default: return -cosPoly(r); }
}
export function dcos(x) {
  if (x !== x || x === Infinity || x === -Infinity) return NaN;
  const [r, q] = reduce(x);
  switch (q) { case 0: return cosPoly(r); case 1: return -sinPoly(r); case 2: return -cosPoly(r); default: return sinPoly(r); }
}
const ATAN_C = [];
for (let n = 31; n >= 3; n -= 2) ATAN_C.push((((n - 1) / 2) % 2 ? -1 : 1) / n);
function atanSmall(x) { // |x| <= tan(pi/12)
  const z = x * x;
  let s = 0;
  for (let i = 0; i < ATAN_C.length; i++) s = z * (ATAN_C[i] + s);
  return x * (1 + s);
}
export function datan(x) {
  if (x !== x) return NaN;
  let neg = false, inv = false, add = 0;
  if (x < 0) { neg = true; x = -x; }
  if (x > 1) { inv = true; x = 1 / x; }
  if (x > TAN_PI12) { x = (x * SQRT3 - 1) / (x + SQRT3); add = PIO6; }
  let r = add + atanSmall(x);
  if (inv) r = PIO2 - r;
  return neg ? -r : r;
}
export function datan2(y, x) {
  if (x !== x || y !== y) return NaN;
  if (x > 0) return datan(y / x);
  if (x < 0) return (y > 0 || (y === 0 && 1 / y > 0)) ? datan(y / x) + PI : datan(y / x) - PI;
  if (y > 0) return PIO2;
  if (y < 0) return -PIO2;
  return 0;
}
