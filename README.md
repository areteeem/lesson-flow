# lesson-flow

lesson-flow is a lesson builder and lesson player for teachers who want to create interactive lessons without hand-coding every screen.

The app combines three things in one place:

1. A visual builder for slides, tasks, media blocks, grouped activities, and linked layouts.
2. A DSL editor for people who want a faster, text-based way to author lessons.
3. A student-facing player and a lightweight live teaching mode.

The goal is practical classroom use. It is made for teachers, tutors, curriculum designers, and anyone building guided learning flows with a mix of explanation, practice, and interaction.

## What the app is for

lesson-flow is designed for lessons where content and interaction need to sit together, not in separate tools.

Typical use cases:

1. English lessons with reading, grammar, vocabulary, listening, and dialogue practice.
2. Teacher-led classroom sessions where the teacher advances content and students follow in real time.
3. Self-paced practice where students complete slides and tasks in play mode.
4. Rapid prototyping of lesson content through the DSL editor.

## Main features

### Builder

The builder supports a wide range of block types, including:

1. Content slides
2. Rich text slides
3. Structure and table slides
4. Split and grouped task blocks
5. Media-enhanced activities
6. A large task library for choice, text entry, drag/drop, matching, dialogue, matrix, highlight, and vocabulary interactions

### DSL editor

The DSL editor is a Monaco-based editor with:

1. Syntax highlighting
2. Snippets
3. Validation feedback
4. Problem list display
5. Local worker-based Monaco setup, so it does not depend on a CDN

### Play mode

Play mode is the student-facing lesson player. It supports:

1. Full lesson navigation
2. Linked block split views
3. Grouped activities
4. Session result tracking
5. End-of-lesson grading and summary
6. Safer fallback handling when lesson data is incomplete or empty

### Live mode

Live mode is teacher-controlled. The teacher advances through a lesson, and student clients receive the same current block.

The current implementation supports Supabase-backed live sync with local fallback:

1. `supabase` transport for cross-device live sessions and persisted event history.
2. `broadcast-local` fallback for same-browser / same-origin simulation.
3. Transport mode can be forced via `VITE_LIVE_TRANSPORT`.

The live session now supports the same visible lesson blocks as play mode, including slides and task rendering, instead of being restricted to quiz-only multiple-choice content.

## Stability work included

This codebase now includes several stability-focused protections:

1. Shared lesson-stage rendering between play mode and live mode
2. Live-mode preflight validation before a session starts
3. Safer empty-state handling when a lesson has no visible blocks
4. Safer grading summary behavior when there are no gradable tasks
5. Better error capture through an error boundary and global error logging
6. A debug mode panel for recent app events and captured errors

## Quick start

### Requirements

1. Node.js 18+ recommended
2. npm 9+ recommended

### Install

```bash
npm install
```

### Run in development

```bash
npm run dev
```

Then open the local Vite URL shown in the terminal.

### Create a production build

```bash
npm run build
```

### Preview the production build

```bash
npm run preview
```

### Configure backend live sync (Supabase)

```bash
npm install
```

Create `.env.local`:

```bash
VITE_LIVE_TRANSPORT=supabase
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

Then apply the schema from `supabase/schema.sql` in Supabase SQL Editor.

Required tables created by the schema:

1. `live_users`
2. `live_sessions`
3. `live_participants`
4. `live_events`
5. `live_responses`
6. `live_manual_scores`

The app uses Supabase Realtime on `live_events` and stores durable session/response state in these tables.

If `VITE_LIVE_TRANSPORT` is not set (or set to `auto`), the app tries Supabase first and falls back to local BroadcastChannel transport.

## Debug mode

There is a built-in debug panel intended for crash investigation and state tracing.

Enable it in either of these ways:

1. Add `?debug=1` to the URL
2. Set `localStorage.setItem('lf_debug_mode', '1')` in the browser console

When debug mode is enabled, the app records recent errors and important lifecycle events to a local session log and shows them in a floating debug panel.

## How lesson data works

Lessons are stored client-side and are passed between views through session storage and the app context.

Important pieces:

1. Builder output becomes normalized lesson blocks.
2. The DSL parser turns text into the same internal block shape used by the builder.
3. Play mode and live mode both render from the same block model.

This shared model is important for feature parity. If a block works in the builder but not in playback, that is a bug, not a separate feature request.

## Live mode architecture notes

### Current approach

The app now supports two live transports through one shared channel adapter:

1. `supabase` transport (backend-supported, cross-device + persistent)
2. `broadcast-local` transport (local same-browser / same-origin fallback)

Why it exists:

1. Very fast local iteration
2. Optional backend support for real cross-device classes
3. Easy to debug in both local tabs and backend-backed sessions

Current limitations:

1. Demo policies in `supabase/schema.sql` are permissive and should be tightened for production.
2. Session IDs are short and should be protected with stronger access controls for production.
3. Event retention cleanup should be scheduled to avoid unbounded `live_events` growth.

### Backend event contract (current)

Client to backend:

1. `client_hello`
2. `join`
3. `leave`
4. `request_sync`
5. `sync` (host authoritative snapshot)
6. `heartbeat` / `student_heartbeat`
7. `response_update`
8. `host-exit`

Backend to client:

1. `join_ack`
2. `join` (student join notice to host)
3. `sync` (latest snapshot)
4. `heartbeat`
5. `response_update`
6. `leave`
7. `host-exit`

### Recommended production architecture

For production deployments:

1. Keep host snapshot state authoritative in `live_sessions`.
2. Use Realtime subscriptions for low-latency event fanout.
3. Persist participant activity and responses in database tables.
4. Add stricter RLS policies, membership checks, and retention jobs.

### Reconnect / latency / packet loss strategy

If this app moves to a backend-backed live mode, the recommended pattern is:

1. Every session message carries a monotonic revision number
2. Clients request a snapshot when they reconnect or detect drift
3. The server keeps the current lesson snapshot and current block pointer as the source of truth
4. Student task responses are idempotent and keyed by session, user, block, and attempt
5. Heartbeats detect disconnected clients
6. The host UI shows sync health, reconnects, and stale clients explicitly

### Live protocol smoke checks

Run a local protocol smoke harness (no browser required):

```bash
npm run live:smoke
```

This verifies three critical paths on the local channel adapter:

1. Student join receives `join_ack` and initial `sync`
2. Reconnect path receives latest requested snapshot
3. Late join receives host's current snapshot state

## Feature summary

Short version of what is in the app:

1. Lesson builder
2. Monaco DSL editor
3. Play mode with grading
4. Live teacher/student mode
5. Media blocks
6. Drag and touch-friendly interaction patterns in several task types
7. Recent lessons and local session saving
8. Settings and student profile views

## Testing guidance

If you are validating stability, these are the first scenarios to run:

1. Finish a lesson with only slides
2. Finish a lesson with only tasks
3. Finish a lesson with grouped and split blocks
4. Start live mode with a valid lesson
5. Start live mode with an empty or broken lesson
6. Join live mode from another tab
7. Advance quickly through blocks in live mode
8. Run drag/drop tasks on both mouse and touch devices
9. Test lessons with missing optional fields
10. Test very small and very large lessons

### Release checks

Use the consolidated CI parity command before release:

```bash
npm run ci:check
```

This runs:

1. Production build (`npm run build`)
2. DSL fixture validation (`npm run dsl:validate`)
3. Live protocol smoke coverage (`npm run live:smoke`)

## Known architectural direction

The app is moving toward one shared rendering core across:

1. Builder preview
2. Play mode
3. Live mode

That is the right long-term direction because it reduces drift, avoids mode-specific bugs, and makes task parity easier to maintain.

## Project structure overview

Some useful folders:

1. `src/components` for core UI and mode screens
2. `src/components/tasks` for task implementations
3. `src/config` for DSL schema, registries, and prompt templates
4. `src/utils` for lesson shaping, grading, logging, storage helpers, and builders
5. `src/hooks` for shared React hooks

## Who should use this

This project is for:

1. Teachers building interactive lessons
2. Tutors running structured live practice
3. Education teams prototyping activity flows quickly
4. Developers extending a lesson authoring system without starting from scratch

## Final note

This is not a generic template anymore. It is a purpose-built lesson authoring and delivery tool focused on practical classroom workflows, interactive practice, and stable playback.
