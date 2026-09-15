# Operational-KB MVP

A self-hosted chat assistant grounded in a medium React/TypeScript + .NET codebase. It indexes UI actions, routes, API clients, endpoints, permissions, services, states and documentation, then answers Persian or English operational questions with file/line citations.

## Windows quick start

Requirements: Node.js 20+, Docker Desktop and the .NET SDK used by the target backend.

```powershell
git checkout feat/usable-mvp
npm install
Copy-Item .env.example .env
# Add LLM_BASE_URL, LLM_API_KEY and LLM_MODEL to .env for natural answers.
.\scripts\start-mvp.ps1 -ProjectPath "C:\Users\safapoor.p\Desktop\External Services\backup\ExternalService Full"
```

Open http://127.0.0.1:5051. The status badges must show API connected, a non-zero evidence count, and LLM active. Without an LLM, retrieval and citations still work in evidence-only mode.

## Manual run

```powershell
$env:TARGET_REPO_PATH = "C:\path\to\folder-containing-frontend-and-backend"
docker compose up -d
npm install
npm run db:migrate
npm run analyzer:roslyn:build
npm run ingest
npm run check
npm run dev
```

## LLM configuration

The provider must expose an OpenAI-compatible `/chat/completions` endpoint.

```env
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=your-key
LLM_MODEL=your-model
```

Every generated factual step must cite one of the retrieved evidence records. Answers without valid citations are rejected instead of shown. Chat keeps the latest six messages for follow-up questions.

## Useful checks

```powershell
Invoke-RestMethod http://127.0.0.1:5051/health/ready
Invoke-RestMethod http://127.0.0.1:5051/api/status
```

Re-run `npm run ingest` after source changes. An unchanged revision is detected and skipped. Roslyn failures no longer discard TypeScript and fallback evidence, but the ingest result prints the analyzer warning so degraded coverage is visible.

Do not run `npm audit fix --force` blindly. Review dependency changes first.
