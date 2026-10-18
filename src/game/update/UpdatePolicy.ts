/** GitHub Actions publishes the exact 40-character commit SHA for each build. */
export function isReleaseBuildId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{40}$/i.test(value);
}

export type UpdateDecision = 'current' | 'refresh' | 'manual' | 'invalid';

/**
 * The query string is the reload-loop guard: if we already requested this
 * version but the currently running bundle is still old, never auto-reload again.
 */
export function decideUpdate(
  currentBuild: string,
  availableBuild: unknown,
  requestedBuild: string | null,
): UpdateDecision {
  if (!isReleaseBuildId(availableBuild)) return 'invalid';
  if (currentBuild === 'local' || currentBuild === availableBuild) return 'current';
  return requestedBuild === availableBuild ? 'manual' : 'refresh';
}

/** Retain the installed app's origin/path, discarding old manual cache-busting tags. */
export function updateUrl(currentHref: string, availableBuild: string): string {
  if (!isReleaseBuildId(availableBuild)) throw new Error('Invalid build identifier');
  const url = new URL(currentHref);
  url.searchParams.delete('v');
  url.searchParams.delete('retry');
  url.searchParams.set('build', availableBuild);
  return url.toString();
}
