/**
 * Radius the camera keeps in view: the skull with its labels (measured at about 4.8) plus a thin margin.
 * 5.35 fills about 83% of the brain view's height, the most that still clears the top bar and the search bar
 * (Owner, Nov 3 2026: "make skull and brain bigger").
 */
export const HEAD_RADIUS = 5.35;

/**
 * Fit the whole schematic head inside the limiting viewport dimension. Recomputed whenever the brain view
 * changes size, so closing the chat makes the brain bigger and opening it fits it back (Owner, Nov 3 2026).
 */
export function headViewDistance(width: number, height: number, fov = 40): number {
  const aspect = Math.max(0.1, width / Math.max(1, height));
  const vertical = (fov * Math.PI) / 360;
  const horizontal = Math.atan(Math.tan(vertical) * aspect);
  return Math.max(12, HEAD_RADIUS / Math.sin(Math.min(vertical, horizontal)));
}
