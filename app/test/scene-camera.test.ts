import { describe, expect, it } from 'vitest';
import { headViewDistance } from '../src/lib/scene-camera';

describe('whole-head camera framing', () => {
  it('keeps the head inside both viewport dimensions on a desktop and a phone', () => {
    for (const [width, height] of [
      [1050, 900],
      [390, 608],
      [280, 800],
    ]) {
      const distance = headViewDistance(width, height);
      const vertical = (40 * Math.PI) / 360;
      const horizontal = Math.atan((Math.tan(vertical) * width) / height);
      const visibleRadius = distance * Math.sin(Math.min(vertical, horizontal));
      expect(visibleRadius).toBeGreaterThanOrEqual(7 * 1.14);
    }
  });

  it('pulls back for narrow screens instead of cropping the sides', () => {
    expect(headViewDistance(390, 800)).toBeGreaterThan(headViewDistance(1200, 800));
    expect(headViewDistance(1200, 800)).toBeGreaterThan(18.5);
  });
});
