# MVP Roadmap

## M0: benchmark
Collect 50 real Persian operational questions and label expected UI, API, permission, state and source evidence. Targets: answer correctness >=85%, citation precision >=95%, unsupported claims <2%, warm p95 <5s.

## M1: trustworthy ingest
Replace heuristics with Roslyn and TypeScript Compiler API; report file coverage and block unhealthy snapshots; extract routes, actions, API calls, authorization, entities and states.

## M2: workflow graph
Model Role -> Screen -> Action -> Endpoint -> Service -> Entity -> State. Link frontend clients to backend endpoints and require evidence on every edge.

## M3: grounded chat
Add multilingual embeddings, hybrid retrieval, structured operator answers, clarification, streaming and inline citations. Enforce unknown/abstention.

## M4: evaluation and hardening
Run human-reviewed benchmarks; add injection/secret tests, auth, audit, rate limits, backups, metrics and deployment docs.

## M5: incremental sync and pilot
Invalidate affected workflows, prove delta matches full ingest >=99%, then pilot with 3-5 users and measure time saved.
