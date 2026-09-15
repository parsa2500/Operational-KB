# Operational-KB

Self-hosted operational code intelligence for medium full-stack products. It ingests React/TypeScript and C# source, preserves file/line evidence, retrieves relevant code and docs, and generates grounded Persian or English operational answers.

## MVP contract

For questions like «پرداخت آفلاین مشتری را از کجا ببینم و تأیید کنم؟», return the required access, UI path, action, backend effect and exact citations. Missing evidence must become an explicit unknown, never a guess.

## Current vertical slice

- PostgreSQL evidence store and atomic snapshots
- deterministic full-repository ingestion
- initial TS/React and C# heuristic extraction
- PostgreSQL lexical retrieval
- optional OpenAI-compatible grounded generation
- evidence-only fallback and abstention
- initial benchmark case

Embeddings, incremental sync, browser capture and Web UI are deliberately deferred until the evidence loop is measured.

## Run

```bash
cp .env.example .env
docker compose up -d
npm install
npm run db:migrate
TARGET_REPO_PATH=/path/to/project npm run ingest
npm run dev
```

```bash
curl -X POST http://localhost:5051/api/query -H 'content-type: application/json' -d '{"question":"پرداخت آفلاین را از کجا تایید کنم؟"}'
```

Without LLM settings, `/api/query` returns the retrieved evidence packet instead of inventing an answer. See [the roadmap](docs/ROADMAP.md).
