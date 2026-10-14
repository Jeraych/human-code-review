import { expect, it } from 'vitest';
import { assetUrl, hashForView, viewFromHash } from '../src/navigation';
it('maps public and research routes without treating content anchors as navigation', () => {
  expect(viewFromHash('#play')).toBe('play');
  expect(viewFromHash('#research')).toBe('setup');
  expect(viewFromHash('#main-content')).toBeUndefined();
  expect(hashForView('study')).toBe('#study');
});
it('uses the configured base for pool URLs rather than assuming root hosting', () =>
  expect(assetUrl('/pools/example.json')).toBe(import.meta.env.BASE_URL + 'pools/example.json'));
it('historical V1 requires the explicit v1=1 request, never a presence-only flag', async () => {
  const { isLegacyRequest } = await import('../src/navigation');
  for (const query of ['', '?v1', '?v1=0', '?v1=false', '?mode=v1', '?v1=unexpected'])
    expect(isLegacyRequest(query)).toBe(false);
  expect(isLegacyRequest('?v1=1')).toBe(true);
});
