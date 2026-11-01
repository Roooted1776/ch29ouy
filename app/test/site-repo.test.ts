import { describe, expect, it } from 'vitest';
import { siteRepo } from '../src/lib/github';

describe('siteRepo', () => {
  it('reads the repo from a GitHub Pages address, and nothing elsewhere', () => {
    expect(siteRepo({ hostname: 'roooted1776.github.io', pathname: '/ch29ouy/' })).toBe('roooted1776/ch29ouy');
    expect(siteRepo({ hostname: 'localhost', pathname: '/ch29ouy/' })).toBe('');
    expect(siteRepo({ hostname: 'roooted1776.github.io', pathname: '/' })).toBe('');
    expect(siteRepo(undefined)).toBe('');
  });
});
