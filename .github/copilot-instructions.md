# Neurovault Copilot Instructions

You are working on Neurovault V2.

## Product context
Neurovault is a Next.js + Supabase + pgvector + Gemini application for multi-brain knowledge workspaces, document ingestion, grounded chat, and knowledge graph exploration.

## Engineering priorities
1. Reliability before new features
2. Security before convenience
3. Small, reviewable diffs
4. Backward-compatible changes when possible
5. Clear docs for every non-trivial change

## Required workflow
1. Explore the relevant code first
2. Create a short implementation plan
3. Then make changes
4. Run lint/build/tests for touched areas
5. Summarize what changed, risks, and follow-ups

## Coding standards
- Prefer TypeScript-safe code
- Do not silently swallow errors
- Add structured error messages
- Avoid duplicating logic
- Keep functions focused and named clearly
- Prefer server-side validation for all API inputs
- Preserve auth and ownership checks
- Avoid logging secrets or private user content

## For database work
- Always inspect current schema before editing
- Make migrations explicit
- Avoid destructive schema changes without a migration path
- Keep vector dimensions and embedding model usage consistent

## For AI/RAG work
- Prefer grounded responses with source references
- Reduce hallucination risk through stricter retrieval and prompt construction
- Make chunking/embedding/citation behavior explicit and testable

## For output
Always include:
- changed files
- why each change was made
- how to verify
- remaining risks
