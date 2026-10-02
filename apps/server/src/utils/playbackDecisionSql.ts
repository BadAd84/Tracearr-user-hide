import { type SQL, sql } from 'drizzle-orm';

/** SQL twin of `playbackDecision()` in @tracearr/shared; the two must agree. */
export function playbackDecisionSql(alias?: string): SQL {
  const col = (name: string) => sql.raw(alias ? `${alias}.${name}` : name);
  return sql`CASE
    WHEN ${col('is_transcode')} = true AND ${col('audio_decision')} = 'transcode' AND ${col('video_decision')} IS DISTINCT FROM 'transcode' THEN 'audio_transcode'
    WHEN ${col('is_transcode')} = true THEN 'transcode'
    WHEN ${col('video_decision')} = 'copy' OR ${col('audio_decision')} = 'copy' THEN 'copy'
    ELSE 'directplay'
  END`;
}
