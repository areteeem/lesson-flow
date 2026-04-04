<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/React_Router-7-CA4245?logo=reactrouter&logoColor=white" alt="React Router 7" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS 4" />
  <img src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white" alt="Vite 8" />
  <img src="https://img.shields.io/badge/Supabase-Realtime_+_Auth-3FCF8E?logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/Monaco-DSL_Studio-0078D4?logo=visualstudiocode&logoColor=white" alt="Monaco Editor" />
</p>

# Lesson Flow

Lesson Flow is an interactive lesson platform for authoring, delivering, and grading classroom experiences in one product. It combines a visual lesson builder, a Monaco-powered DSL studio, a student player, live classroom controls, assignment delivery, grading workflows, and an AI-assisted content pipeline.

It is designed around one core idea: a lesson should be authored once and then reused consistently across builder preview, self-paced play, live sessions, and grading without maintaining separate content models.

## What Makes It Stand Out

### Top Features

- **Dual authoring workflow**: teachers can build lessons visually or switch to a structured DSL editor with validation, snippets, parser trace, and template shortcuts.
- **Live classroom delivery**: host-led, hybrid, and student-paced live sessions with deadlines, auto-advance policies, team mode, spotlighting, Quick Pulse, and response warmth indicators.
- **Assignment and grading pipeline**: homework links, one-attempt or capped-attempt delivery, moderation queue, manual review flows, rubric templates, assisted feedback drafts, and result sharing.
- **One rendering model everywhere**: the same lesson structure powers builder preview, the player, the live host, and grading context, which keeps behavior consistent across the app.

### Hot Features

- **AI to DSL generation** with lesson-context-aware prompting and direct insertion into the editor.
- **Monaco DSL Studio** with compact tooling, problem filters, quick template loading, safe normalize, and parsed-model inspection.
- **Live teaching controls** like question deadlines, skip/reopen actions with audit trail, spotlight answers, and per-question leaderboard options.
- **Accessibility-first runtime** with high contrast, dyslexia-friendly reading options, reduced motion, text zoom, keyboard shortcuts, and fullscreen controls.

## Screenshots

## Product Overview

Lesson Flow covers the full teacher loop:

1. **Author** lessons in the visual builder or DSL editor.
2. **Deliver** them as self-paced activities, live sessions, or assignments.
3. **Collect** structured answers, manual-review tasks, and live participation data.
4. **Review and publish** results through grading, moderation, and shareable result views.

The project already includes a broad task library across choice, text input, matching, sequencing, tables, image/video tasks, branching prompts, vocabulary tools, and reading interactions.

## AI Implementation

The AI layer is intentionally implemented as a same-origin server-proxy flow rather than a direct browser-to-provider call.

### Why This Architecture

- avoids exposing the provider token in the browser
- avoids fragile client-side CORS and CSP behavior
- keeps the frontend AI interface stable even if the upstream provider changes

### Current AI Flow

1. The editor builds a prompt from lesson context such as title, topic, grammar focus, CEFR level, and teacher notes.
2. [src/utils/aiBridge.js](src/utils/aiBridge.js) sends requests to the local endpoint `/api/ai`.
3. In development, [vite.config.js](vite.config.js) proxies `/api/ai` to the upstream provider and injects the server-side token.
4. In production, [api/ai.js](api/ai.js) acts as the server endpoint that forwards the prompt to `https://apifreellm.com/api/v1/chat`.
5. The returned response is inserted back into the app as Lexor DSL and can be merged into the current lesson.

### AI Capabilities in the App

- context-aware prompt generation from lesson metadata
- DSL-first output requests instead of raw prose
- direct insert back into the lesson editor
- local rephrase variants for fast task rewriting without an API call
- centralized error handling for missing server token, rate limits, and provider rejection

## Stack

### Frontend

- **React 19** for the SPA shell and component model
- **React Router 7** for lesson, editor, grading, live, assignment, and share routes
- **Tailwind CSS 4** plus custom design tokens in CSS variables
- **Monaco Editor** for the DSL authoring environment

### App Runtime

- **Supabase JS** for auth, realtime, and cloud-backed grading/session flows
- **react-markdown**, **remark-gfm**, and **rehype-raw** for rich lesson content rendering
- **DOMPurify** for safe HTML rendering
- **pako** for payload compression used in sharing flows
- **mobile-drag-drop** for touch-friendly drag interactions

### Tooling and Delivery

- **Vite 8** for local development and production builds
- **ESLint 9** for static checks
- **Node-based smoke scripts** for DSL validation and live flow checks
- **Server-side AI proxy endpoint** via [api/ai.js](api/ai.js)

## Architecture Notes

The important design decision in this codebase is that builder, player, live delivery, and grading all operate on the same lesson structure.

- the builder produces structured lesson blocks
- the DSL parser and generator round-trip the same lesson model
- the player and live host render through shared lesson-stage logic
- grading and analytics consume the same answer/session structure produced during play

That shared model is what makes the product feel cohesive instead of like a set of disconnected tools.

## Local Setup

### Prerequisites

- Node.js 18+
- npm 9+

### Install

```bash
npm install
```

### Run the app

```bash
npm run dev
```

### Build for production

```bash
npm run build
npm run preview
```

### Optional environment variables

Create `.env.local` when you want live sync or AI enabled locally.

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
VITE_LIVE_TRANSPORT=supabase

AI_TOKEN=YOUR_SERVER_SIDE_AI_TOKEN
```

For AI specifically, the app expects the token on the server side. The frontend calls `/api/ai`; it does not send the provider token directly from the browser.

## Validation Commands

```bash
npm run build
npm run dsl:validate
npm run live:smoke
npm run ci:check
```

## Project Structure

```text
src/
  components/         UI flows for editor, player, live, grading, auth, and assignments
  components/tasks/   task-type implementations
  config/             task registry, slide registry, schema, DSL prompt templates
  context/            shared app state
  hooks/              focused reusable hooks
  utils/              AI bridge, cloud sync, grading, live transport, theme, storage helpers

api/
  ai.js               production AI proxy endpoint

scripts/
  validate-dsl.mjs    DSL validation checks
  live-flow-smoke.mjs live protocol smoke tests

supabase/
  schema.sql          core schema
  migrations/         incremental database changes
```

