import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import type { ExtractedEvidence } from './typescript.js';

export async function extractRoslyn(root: string): Promise<ExtractedEvidence[]> {
  const project = path.resolve('analyzers/roslyn/OperationalKb.Roslyn.csproj');
  const child = spawn('dotnet', ['run', '--project', project, '--configuration', 'Release', '--', root], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  const [result] = await once(child, 'close') as [number];
  if (result !== 0) throw new Error(`Roslyn analyzer failed (${result}): ${stderr.slice(-2000)}`);
  return stdout.split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line) as ExtractedEvidence]; } catch { return []; }
  });
}
