-- Materialized view for hot posts, refreshed every 10 minutes by a cron job.
-- Definition from docs/db_schema.md

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_post_hot AS
SELECT
  p.id,
  p.author_id,
  p.title,
  p.cover_img,
  p.remix_count,
  p.like_count,
  p.comment_count,
  -- Hotness score formula: Remixes are weighted higher
  (COALESCE(p.remix_count, 0) * 2 + COALESCE(p.like_count, 0) + COALESCE(p.comment_count, 0)) AS score,
  p.created_at,
  u.username AS author_username, -- Added for convenience
  u.avatar_url AS author_avatar_url -- Added for convenience
FROM
  posts p
LEFT JOIN
  users u ON p.author_id = u.id
WHERE
  p.visibility = 'public';

-- Index to quickly sort by score
CREATE UNIQUE INDEX IF NOT EXISTS ix_mv_post_hot_pk ON mv_post_hot (id);
CREATE INDEX IF NOT EXISTS ix_mv_post_hot_score ON mv_post_hot (score DESC, created_at DESC);

-- Note: The REFRESH command is executed by the refreshHotWorker.
-- e.g., REFRESH MATERIALIZED VIEW CONCURRENTLY mv_post_hot; 