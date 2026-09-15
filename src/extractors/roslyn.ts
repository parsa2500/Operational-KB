import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { config } from '../config.js';
import type { ExtractedEvidence } from './typescript.js';

export async function extractRoslyn(root: string): Promise<ExtractedEvidence[]> {
  const project = path.resolve('analyzers/roslyn/OperationalKb.Roslyn.csproj');
  const child = spawn('dotnet', ['run', '--project', project, '--configuration', 'Release', '--no-build', '--no-launch-profile', '--', path.resolve(root)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: { ...process.env, DOTNET_NOLOGO: '1', DOTNET_CLI_TELEMETRY_OPTOUT: '1' },
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  const timer = setTimeout(() => child.kill(), config.ROSLYN_TIMEOUT_MS);
  const [result] = await once(child, 'close') as [number | null];
  clearTimeout(timer);
  if (result !== 0) throw new Error(`Roslyn analyzer failed (${result ?? 'timeout'}): ${stderr.slice(-6000)}`);
  if (stderr.trim()) console.warn(stderr.trim());
  return stdout.split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line) as ExtractedEvidence]; } catch { return []; }
  });
}
