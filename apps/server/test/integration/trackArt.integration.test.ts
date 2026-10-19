/**
 * Emby shape: the album's cover comes from PrimaryImageItemId while each track
 * carries its own image path. Run with: pnpm --filter @tracearr/server test:integration trackArt
 */
import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestServer } from '@tracearr/test-utils/factories';
import { db } from '../../src/db/client.js';
import { libraryItems } from '../../src/db/schema.js';
import { alignTrackArtToAlbums } from '../../src/services/library/trackArt.js';

const ALBUM_ART = '/Items/70217/Images/Primary?tag=48364e5c';

describe('alignTrackArtToAlbums', () => {
  it('gives tracks their album path and leaves tracks of untagged or artless albums alone', async () => {
    const { id: serverId } = await createTestServer({ type: 'emby' });
    const { id: otherServerId } = await createTestServer({ type: 'emby' });
    const row = (
      server: string,
      ratingKey: string,
      mediaType: 'album' | 'track',
      thumbPath: string | null,
      parentRatingKey: string | null = null
    ) => ({
      serverId: server,
      libraryId: 'music',
      ratingKey,
      title: ratingKey,
      mediaType,
      thumbPath,
      parentRatingKey,
    });
    await db
      .insert(libraryItems)
      .values([
        row(serverId, '76952', 'album', ALBUM_ART),
        row(serverId, '70217', 'track', '/Items/70217/Images/Primary?tag=aaa', '76952'),
        row(serverId, '70218', 'track', '/Items/70218/Images/Primary?tag=bbb', '76952'),
        row(serverId, '80000', 'album', '/Items/80000/Images/Primary'),
        row(serverId, '80001', 'track', '/Items/80001/Images/Primary?tag=ccc', '80000'),
        row(serverId, '81000', 'album', null),
        row(serverId, '81001', 'track', '/Items/81001/Images/Primary?tag=fff', '81000'),
        row(otherServerId, '90000', 'album', '/Items/90000/Images/Primary?tag=ddd'),
        row(otherServerId, '90001', 'track', '/Items/90001/Images/Primary?tag=eee', '90000'),
      ]);

    expect(await alignTrackArtToAlbums(serverId)).toBe(2);
    expect(await alignTrackArtToAlbums(serverId)).toBe(0);

    const paths = new Map(
      (
        await db
          .select({ ratingKey: libraryItems.ratingKey, thumbPath: libraryItems.thumbPath })
          .from(libraryItems)
          .where(eq(libraryItems.mediaType, 'track'))
      ).map((r) => [r.ratingKey, r.thumbPath])
    );
    expect(paths.get('70217')).toBe(ALBUM_ART);
    expect(paths.get('70218')).toBe(ALBUM_ART);
    expect(paths.get('80001')).toBe('/Items/80001/Images/Primary?tag=ccc');
    expect(paths.get('81001')).toBe('/Items/81001/Images/Primary?tag=fff');
    expect(paths.get('90001')).toBe('/Items/90001/Images/Primary?tag=eee');

    expect(await alignTrackArtToAlbums()).toBe(1);
  });
});
