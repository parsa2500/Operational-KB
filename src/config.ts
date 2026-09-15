import 'dotenv/config';
import { z } from 'zod';
export const config=z.object({PORT:z.coerce.number().default(5051),DATABASE_URL:z.string().min(1),TARGET_REPO_PATH:z.string().default('./fixtures/sample-fullstack'),LLM_BASE_URL:z.string().optional(),LLM_API_KEY:z.string().optional(),LLM_MODEL:z.string().optional()}).parse(process.env);
