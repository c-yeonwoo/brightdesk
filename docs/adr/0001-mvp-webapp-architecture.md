# ADR 0001: MVP Web App Architecture

## Status

Accepted

## Context

BrightDesk MVP is a web-based investment desk that reads market context, classifies documents into a unified KB, surfaces sector/stock/ETF opportunities, and connects them to portfolio actions.

The product needs to be usable quickly without a separate mobile app, heavyweight worker platform, or broker integration.

## Decision

Use Vercel + Supabase as the MVP deployment architecture.

- Vercel hosts the TanStack Start web app and server functions.
- Supabase provides Postgres, Auth, RLS, and service-role server access.
- Cron endpoints remain protected by `CRON_SECRET`.
- Scheduled execution should be called by a scheduler that can send `X-CRON-SECRET` or `Authorization: Bearer <token>`.
- Vercel Cron is not the primary scheduler for protected jobs because it does not fit the current secret-header execution contract.
- LLM calls use OpenAI-compatible environment variables: `AI_API_KEY`, `AI_MODEL`, `AI_VISION_MODEL`, `AI_GATEWAY_URL`.
- User-provided text, PDF, and image inputs enter the system as `raw_documents` with `source = manual_upload`.
- KB facts remain the unified downstream format regardless of source.

## Consequences

- MVP deployment is simple and low-ops.
- The app can be deployed as a web app without native mobile work.
- Manual uploads, RSS sources, and future source strategies share the same KB pipeline.
- Long-running extraction/refinement may later need a queue/worker if document volume or PDF size grows.
- Cron scheduling must be configured with a service that can send auth headers, or the endpoint contract must be changed in a future ADR.

## Follow-ups

- Add asynchronous document processing if upload latency becomes a blocker.
- Add a fact review queue before recommendations are shown to end users.
- Add storage-backed large file ingestion for PDFs/images above the MVP size limit.
