# Operational-KB

Self-hosted operational code intelligence for medium full-stack products. It ingests React/TypeScript and C# source, preserves file/line evidence, retrieves relevant code and docs, and generates grounded Persian or English operational answers.

## MVP contract

For questions like «پرداخت آفلاین مشتری را از کجا ببینم و تأیید کنم؟», return the required access, UI path, action, backend effect and exact citations. Missing evidence must become an explicit unknown, never a guess.

## Run

```powershell
cp .env.example .env
# Set TARGET_REPO_PATH to the parent folder containing the frontend and backend
docker compose up -d
npm install
npm run db:migrate
npm run analyzer:roslyn:build
npm run ingest
npm run dev
```

Open http://127.0.0.1:5051 in your browser. The page uses the indexed project evidence and `/api/query`. Configure `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL` in `.env` for generated grounded answers; without them, the UI shows the evidence packet and citations instead of inventing an answer.

## Important

Do not run `npm audit fix --force` blindly. Review vulnerabilities before changing the dependency tree.

See [the roadmap](docs/ROADMAP.md).
