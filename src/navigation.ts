export type View = 'home' | 'setup' | 'study' | 'play';
export function viewFromHash(hash: string): View | undefined {
  return (
    { '#home': 'home', '#play': 'play', '#study': 'study', '#research': 'setup' } as Record<
      string,
      View
    >
  )[hash];
}
export const hashForView = (view: View) => (view === 'setup' ? '#research' : `#${view}`);
export const assetUrl = (path: string) => import.meta.env.BASE_URL + path.replace(/^\//, '');
// Only this deliberate request opens historical V1. Hashes and saved sessions never select it.
export const isLegacyRequest = (search: string) => new URLSearchParams(search).get('v1') === '1';
