/**
 * Jellyfin and Emby give every track its own image path even when the bytes are
 * the album's cover, so the cache held one copy of each cover per track. Tracks
 * take their album's path instead; a track whose album has no art keeps its own.
 */

import { sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { LI_HAS_KNOWN_IMAGE } from '../../routes/library/utils.js';

export async function alignTrackArtToAlbums(serverId?: string): Promise<number> {
  // li is the album row, the alias LI_HAS_KNOWN_IMAGE tests.
  const result = await db.execute(sql`
    UPDATE library_items AS track
    SET thumb_path = li.thumb_path
    FROM library_items AS li
    WHERE track.media_type = 'track'
      AND track.removed_at IS NULL
      AND li.server_id = track.server_id
      AND li.rating_key = track.parent_rating_key
      AND li.media_type = 'album'
      AND li.removed_at IS NULL
      AND ${LI_HAS_KNOWN_IMAGE}
      AND track.thumb_path IS DISTINCT FROM li.thumb_path
      ${serverId ? sql`AND track.server_id = ${serverId}` : sql``}
  `);
  return result.rowCount ?? 0;
}
