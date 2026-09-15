import { db } from './db.js';

await db.query(`
CREATE TABLE IF NOT EXISTS snapshots(
  id text PRIMARY KEY, revision text NOT NULL, root_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), status text NOT NULL CHECK(status IN('staging','active','failed')),
  files_total integer NOT NULL DEFAULT 0, files_failed integer NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_snapshot ON snapshots(status) WHERE status='active';
CREATE INDEX IF NOT EXISTS snapshots_revision_idx ON snapshots(revision);
CREATE TABLE IF NOT EXISTS evidence(
  id text PRIMARY KEY, snapshot_id text NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE, revision text NOT NULL,
  path text NOT NULL, line_start integer NOT NULL, line_end integer NOT NULL, kind text NOT NULL,
  title text NOT NULL, content text NOT NULL, metadata jsonb NOT NULL DEFAULT '{}',
  search_vector tsvector GENERATED ALWAYS AS(to_tsvector('simple',coalesce(title,'')||' '||coalesce(path,'')||' '||coalesce(content,''))) STORED
);
CREATE INDEX IF NOT EXISTS evidence_search_idx ON evidence USING gin(search_vector);
CREATE INDEX IF NOT EXISTS evidence_snapshot_kind_idx ON evidence(snapshot_id,kind);
`);
console.log('database migrated');
await db.end();
