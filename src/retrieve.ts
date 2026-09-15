import { db, type Evidence } from './db.js';

const aliases: Record<string, string[]> = {
  'پرداخت': ['payment', 'transaction', 'invoice'], 'آفلاین': ['offline', 'manual'], 'فیش': ['receipt'],
  'تایید': ['approve', 'confirm', 'verify'], 'کاربر': ['user', 'customer'], 'مشتری': ['customer', 'user'],
  'ورود': ['login', 'signin', 'auth'], 'دسترسی': ['permission', 'authorize', 'role'],
};
const ignored = new Set(['این','اون','برای','باید','چطور','چگونه','کجا','کدام','چی','من','ما','را','رو','از','به','در','the','how','what','where','and','for']);

export function queryTerms(question: string) {
  const base = question.toLowerCase().split(/[^\p{L}\p{N}_]+/u).filter((term) => term.length > 1 && !ignored.has(term));
  return [...new Set(base.flatMap((term) => [term, ...(aliases[term] ?? [])]))].slice(0, 24);
}

export async function retrieve(question: string, limit = 14): Promise<Evidence[]> {
  const terms = queryTerms(question);
  if (!terms.length) return [];
  const safeTerms = terms.map((term) => term.replace(/[^\p{L}\p{N}_]/gu, '')).filter(Boolean);
  if (!safeTerms.length) return [];
  const query = safeTerms.join(' | ');
  const patterns = safeTerms.slice(0, 12).map((term) => `%${term.toLowerCase()}%`);
  const result = await db.query(`
    SELECT e.id,e.revision,e.path,e.line_start AS "lineStart",e.line_end AS "lineEnd",e.kind,e.title,e.content,e.metadata,
      ts_rank_cd(e.search_vector,to_tsquery('simple',$1))
      + CASE WHEN e.kind IN ('ui.action','ui.navigation','ui.route_or_state','api.client_call','api.endpoint','permission','state.value') THEN 0.25 ELSE 0 END
      + CASE WHEN lower(e.path) LIKE ANY($2::text[]) THEN 0.2 ELSE 0 END AS score
    FROM evidence e JOIN snapshots s ON s.id=e.snapshot_id
    WHERE s.status='active' AND (e.search_vector @@ to_tsquery('simple',$1) OR lower(e.title || ' ' || e.path) LIKE ANY($2::text[]))
    ORDER BY score DESC, e.path, e.line_start LIMIT $3`, [query, patterns, limit]);
  if (result.rows.length) return result.rows;
  const fallback = await db.query(`SELECT e.id,e.revision,e.path,e.line_start AS "lineStart",e.line_end AS "lineEnd",e.kind,e.title,e.content,e.metadata FROM evidence e JOIN snapshots s ON s.id=e.snapshot_id WHERE s.status='active' AND lower(e.content) LIKE ANY($1::text[]) LIMIT $2`, [patterns, limit]);
  return fallback.rows;
}
