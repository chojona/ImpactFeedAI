@AGENTS.md

# ImpactFeedAI — News-to-Market-Reaction Platform

## What This Is
A platform that turns major news events (tariffs, Fed decisions, CPI prints, geopolitical events)
into visual, cross-asset market reaction stories. Target user: retail trader learning to trade macro.

## Tech Stack
- Framework: Next.js 14 (App Router), TypeScript
- Styling: Tailwind CSS
- Charts: TradingView Lightweight Charts library
- Animations: Framer Motion
- Database: PostgreSQL via Prisma
- AI: Anthropic Claude API (event explainers, chat)
- Price Data: Polygon.io API
- State: React useState/useContext (no Redux yet)

## Project Structure
- src/app/ — Next.js routes and layouts
- src/components/ — Reusable UI components
- src/components/events/ — Event card components
- src/components/charts/ — Chart and replay components
- src/lib/ — API clients, utilities, types
- src/lib/polygon.ts — Polygon.io price data fetcher
- src/lib/anthropic.ts — Claude API wrapper
- prisma/schema.prisma — Database schema

## Coding Rules
- Always use TypeScript with strict types — no `any`
- Functional components only, no class components
- Use async/await, never raw .then() chains
- Keep components under 150 lines — extract if longer
- Use named exports, not default exports for components
- Tailwind for all styling — no inline styles except dynamic values
- Mobile-first responsive design always

## Current Phase
MVP — Phase 1. Building the curated event library.
Do NOT add AI features yet. Focus on core event card display,
chart rendering, and the expectation vs reality component.

## Design Direction
Dark theme. Professional fintech aesthetic. Fast, clean, data-dense.
Think Bloomberg terminal meets a modern consumer app.
Color palette: dark backgrounds (#080C10), green accent (#00FF94), 
orange secondary (#FF6B35).

## Do NOT
- Add authentication yet
- Add payments yet  
- Use any external CSS libraries other than Tailwind
- Install new dependencies without flagging it first