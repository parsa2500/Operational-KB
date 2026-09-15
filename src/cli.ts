import { config } from './config.js';
import { ingest } from './ingest.js';
import { db } from './db.js';

try {
  if (process.argv[2] !== 'ingest') throw new Error('Usage: npm run ingest');
  console.log(`Indexing ${config.TARGET_REPO_PATH} ...`);
  const result = await ingest(config.TARGET_REPO_PATH);
  console.log(JSON.stringify(result, null, 2));
  if ('warnings' in result && result.warnings?.length) console.warn('Ingest completed with analyzer warnings. TypeScript and fallback evidence are still available.');
} finally { await db.end(); }
