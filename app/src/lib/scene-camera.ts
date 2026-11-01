/** Fit the whole schematic head inside the limiting viewport dimension. */
export function headViewDistance(width: number, height: number, fov = 40): number {
  const aspect = Math.max(0.1, width / Math.max(1, height));
  const vertical = (fov * Math.PI) / 360;
  const horizontal = Math.atan(Math.tan(vertical) * aspect);
  // Radius includes the skull and labels; leave room for controls and search.
  return Math.max(24, (7 * 1.15) / Math.sin(Math.min(vertical, horizontal)));
}
