import 'dotenv/config';
import { z } from 'zod';

const emptyToUndefined = (value: unknown) => value === '' ? undefined : value;

export const config = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(5051),
  HOST: z.string().default('127.0.0.1'),
  DATABASE_URL: z.string().min(1),
  TARGET_REPO_PATH: z.string().default('./fixtures/sample-fullstack'),
  LLM_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  LLM_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  LLM_MODEL: z.preprocess(emptyToUndefined, z.string().optional()),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
  RETRIEVAL_LIMIT: z.coerce.number().int().min(3).max(30).default(14),
  ROSLYN_TIMEOUT_MS: z.coerce.number().int().min(10000).max(600000).default(180000),
}).parse(process.env);

export const llmConfigured = Boolean(config.LLM_BASE_URL && config.LLM_API_KEY && config.LLM_MODEL);
