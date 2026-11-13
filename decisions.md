# Always Scheming Terminal — Decisions Log

Decisions recorded by the orchestrator (Hermanito). Append new entries at the top.

---

## [2026-09] Auth bypass for ingest/extract/retag cron routes: `x-vercel-cron: 1`

**Context:** Ingest, extract-signals, and retag endpoints needed to be callable by Vercel cron without user auth while still being protected from public abuse.  
**Decision:** Check `x-vercel-cron: 1` header as the bypass condition on those three routes.  
**Alternatives considered:** Secret token in env var, IP allowlist.  
**Rationale:** Vercel injects `x-vercel-cron: 1` on cron-triggered requests. It's reliable, zero-config, and doesn't require a rotating secret. Routes still reject unauthenticated browser requests.  
**Consequences:** Any route using this bypass must check the header explicitly. Do not apply the bypass broadly — only ingest, extract-signals, and retag.

---

## [2026-09] AST MCP tool: `ast_brief` live (Phase 5)

**Context:** Phase 5 goal was to expose AST intelligence via MCP so Hermanito can query it directly.  
**Decision:** `ast_brief` tool is live. Answers natural-language queries about gaming industry signals, news, and entities.  
**Consequences:** Hermanito can call `mcp__ast__ast_brief` for gaming intel without leaving the conversation. Auth flows through the existing AST API.

---

## [2026-xx] Data pipeline architecture: ingest → extract-signals → retag

**Context:** Needed a reliable pipeline for processing gaming industry news at scale.  
**Decision:** Three-stage pipeline: (1) ingest raw articles, (2) extract signals via LLM, (3) retag entities. Each stage is an independent endpoint, callable by cron or manually.  
**Alternatives considered:** Single monolithic ingest + process job, stream processing.  
**Rationale:** Independent stages allow partial re-runs without full reprocessing. Retag can be re-run after entity resolution changes without re-ingesting. Easier to debug failures per stage.  
**Consequences:** Pipeline state must be tracked per article (ingested / signals-extracted / tagged). Failed stages are retryable independently.

---

## [2026-xx] Stack: Next.js + Supabase + Vercel

**Context:** Needed a stack for a real-time news aggregation and intelligence platform.  
**Decision:** Next.js App Router + Supabase (Postgres) + Vercel hosting.  
**Alternatives considered:** Remix, plain Express + Postgres.  
**Rationale:** Next.js App Router + Vercel is a tight deployment loop. Supabase provides Postgres with RLS and a JS client over HTTPS — consistent with other projects in the stack.  
**Consequences:** Supabase ref: `ekynojgesnxhjtblwbyq`. Do not mix with household-planner ref (`rzykrbnpnafqtcxtyual`).

---

## [2026-xx] Repo: WALTAHHH/Always-Scheming-Terminal — Wolo pushes branch, orchestrator merges to main

**Context:** Wolo's committer email blocks Vercel preview deploys.  
**Decision:** Wolo pushes feature branches. Orchestrator merges to main after card is done. No PRs opened from Wolo branches.  
**Consequences:** Orchestrator must actively merge branches after each completed card. `git checkout main && git merge origin/<branch>` with GH_TOKEN-authenticated remote.
