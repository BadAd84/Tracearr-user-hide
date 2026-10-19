import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SQL } from 'drizzle-orm';
import { renderSql } from '../../../test/helpers.js';

vi.mock('../../../db/client.js', () => ({
  db: {
    execute: vi.fn(),
  },
}));

import { db } from '../../../db/client.js';
import { alignTrackArtToAlbums } from '../trackArt.js';

const SERVER = '33333333-3333-4333-8333-333333333333';

const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();
const executed = () => {
  const [query] = vi.mocked(db.execute).mock.calls[0] ?? [];
  const rendered = renderSql(query as unknown as SQL);
  return { sql: normalize(rendered.sql), params: rendered.params };
};

beforeEach(() => {
  vi.mocked(db.execute).mockReset();
  vi.mocked(db.execute).mockResolvedValue({ rowCount: 7, rows: [] } as never);
});

describe('alignTrackArtToAlbums', () => {
  it('copies the known image path of an active album onto its active tracks that differ', async () => {
    expect(await alignTrackArtToAlbums()).toBe(7);

    const { sql, params } = executed();
    expect(sql).toContain(
      'UPDATE library_items AS track SET thumb_path = li.thumb_path FROM library_items AS li'
    );
    expect(sql).toContain("track.media_type = 'track' AND track.removed_at IS NULL");
    expect(sql).toContain('li.server_id = track.server_id');
    expect(sql).toContain('li.rating_key = track.parent_rating_key');
    expect(sql).toContain("li.media_type = 'album' AND li.removed_at IS NULL");
    expect(sql).toContain(
      "li.thumb_path IS NOT NULL AND (li.thumb_path NOT LIKE '/Items/%' OR li.thumb_path LIKE '%?tag=%')"
    );
    expect(sql).toContain('track.thumb_path IS DISTINCT FROM li.thumb_path');
    expect(sql).not.toContain('track.server_id = $');
    expect(params).toEqual([]);
  });

  it('scopes the update to one server when given', async () => {
    await alignTrackArtToAlbums(SERVER);

    const { sql, params } = executed();
    expect(sql).toContain('AND track.server_id = $1');
    expect(params).toEqual([SERVER]);
  });
});
