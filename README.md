<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS 4" />
  <img src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white" alt="Vite 8" />
  <img src="https://img.shields.io/badge/Supabase-Realtime-3FCF8E?logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/Monaco_Editor-Integrated-0078D4?logo=visualstudiocode&logoColor=white" alt="Monaco" />
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="MIT License" />
</p>

# Lesson Flow

**A full-stack interactive lesson builder, player, and live classroom platform — built for teachers who need more than slides.**

Lesson Flow replaces fragmented classroom tools with a single authoring + delivery system. Teachers create rich, interactive lessons combining content slides, task activities, media blocks, and live synchronization — then deliver them to students in real time or as self-paced assignments.

---

## Why Lesson Flow?

| Problem | Lesson Flow's Answer |
|---|---|
| Teachers juggle 4+ tools to build one lesson | One unified builder with visual + code editing modes |
| Live class tools are separate from content tools | Built-in real-time sync with teacher-led, student-paced, and hybrid modes |
| Existing platforms lack task variety | 15+ interactive task types (drag-drop, matching, dialogue, matrix, highlight, and more) |
| Accessibility is an afterthought | WCAG-aligned ARIA roles, keyboard navigation, Zen mode, high-contrast, and dyslexia-friendly options |
| No instant feedback loop | Real-time grading, engagement gauges, and per-question analytics during live sessions |

---

## Key Features

### Lesson Builder
Build lessons visually with drag-and-drop block arrangement, or switch to the Monaco-powered DSL editor for rapid text-based authoring with syntax highlighting, validation, and snippets.

- **Block types**: Content slides, rich text, structure diagrams, tables, split views, grouped activities, media blocks
- **15+ task types**: Multiple choice, text entry, drag-and-drop ordering, matching pairs, dialogue completion, matrix selection, word highlight, vocabulary builders, and more
- **Dual editing modes**: Visual builder with instant preview, or code-first DSL with real-time validation
- **Template library**: Start from curated templates or blank canvas

### Student Player
A polished, mobile-responsive lesson player with:

- **Zen Mode**: Minimalist UI that hides chrome so students focus on content
- **Ghost Mode**: Revisiting completed tasks shows previous answers as faded watermarks
- **Accessibility panel**: High contrast, dyslexia-friendly fonts, reduced motion, text zoom (85–150%), vibration cues
- **Session persistence**: Progress auto-saves to sessionStorage; resume prompts on return
- **Keyboard-first navigation**: Arrow keys, shortcuts for fullscreen, sidebar, accessibility, and hotkey reference

### Live Classroom Mode
Real-time teacher-to-student synchronization powered by Supabase Realtime:

- **Three pace modes**: Teacher-led, student-paced, and hybrid
- **Auto-advance policies**: Timer-based, all-submitted, or submission threshold triggers
- **Quick Pulse**: One-tap engagement polls (👍 Got it / 👎 Lost / 😕 Confused) with live results visualization
- **Session Warmth gauge**: Real-time response rate indicator (Cold → Warming → Hot)
- **Team mode**: Auto-assigned groups with rotating captains and team leaderboards
- **Spotlight answers**: Surface individual student responses during class discussion
- **Per-question leaderboards**: Top 3 rankings after each task question
- **Question deadlines**: Optional countdown timers per question

### Grading & Analytics
- **Auto-grading** with manual override support
- **Results board**: Student × question matrix with accessibility-compliant screen reader support
- **Multiple views**: Student summary, question breakdown, moderation, analytics dashboard
- **Cloud sync**: Session grades sync to Supabase for cross-device access

### Assignments & Sharing
- **Assignment center**: Create homework with deadlines, time limits, randomization, and anti-cheat policies
- **Lesson sharing**: Generate shareable links with compressed lesson payloads
- **Result sharing**: Students can share graded results with unique URLs

### Device Storage Management
- **Auto-cleanup dashboard**: Monitor localStorage usage, clear session data while preserving preferences
- **Smart preservation**: Theme, accessibility settings, and favorites are never cleared

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  React 19 SPA                    │
│  ┌───────────┐  ┌──────────┐  ┌──────────────┐  │
│  │  Builder   │  │  Player  │  │  Live Host   │  │
│  │  (Visual + │  │          │  │  + Student   │  │
│  │   DSL)     │  │          │  │   Join       │  │
│  └─────┬─────┘  └────┬─────┘  └──────┬───────┘  │
│        │              │               │          │
│  ┌─────┴──────────────┴───────────────┴───────┐  │
│  │          Shared Block Model (DSL)          │  │
│  │  slides · tasks · groups · splits · media  │  │
│  └────────────────────┬───────────────────────┘  │
│                       │                          │
│  ┌────────────────────┴───────────────────────┐  │
│  │         LessonStage Renderer               │  │
│  │  (unified across builder, player, live)    │  │
│  └────────────────────────────────────────────┘  │
└───────────────────────┬─────────────────────────┘
                        │
          ┌─────────────┼─────────────┐
          │             │             │
   localStorage    Supabase     sessionStorage
   (lessons,     (live sync,   (session state,
    settings)    cloud grades)  play progress)
```

**Unified rendering core**: Builder preview, student player, and live mode all share the same `LessonStage` component. A block that works in one mode works in all modes — zero drift.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **UI Framework** | React 19 with functional components and hooks |
| **Styling** | Tailwind CSS 4 (config-less) + CSS custom properties design tokens |
| **Build Tool** | Vite 8 with HMR |
| **Code Editor** | Monaco Editor (local worker setup, no CDN dependency) |
| **Backend** | Supabase (Realtime channels, PostgreSQL with RLS, auth) |
| **Markdown** | react-markdown + remark-gfm + rehype-raw |
| **Sanitization** | DOMPurify for safe HTML rendering |
| **Compression** | pako (zlib) for lesson payload sharing |
| **Touch Support** | mobile-drag-drop polyfill for cross-device drag interactions |

---

## Quick Start

### Prerequisites

- Node.js 18+
- npm 9+

### Install & Run

```bash
npm install
npm run dev
```

Open the local URL printed in the terminal. No backend needed for local authoring and play mode.

### Production Build

```bash
npm run build
npm run preview
```

### Enable Live Mode (Supabase)

Create `.env.local`:

```env
VITE_LIVE_TRANSPORT=supabase
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

Apply the database schema:

```bash
# In Supabase SQL Editor, run:
supabase/schema.sql
supabase/migrations/20260330_account_grading.sql
supabase/migrations/20260330_security_hardening.sql
```

See [LIVE_MODE_SETUP.md](LIVE_MODE_SETUP.md) for the full setup checklist.

### CI Checks

```bash
npm run ci:check
# Runs: build → DSL validation → live protocol smoke tests
```

---

## Who Is This For?

- **Teachers** building interactive lessons with embedded practice activities
- **Tutors** running structured live sessions with real-time feedback
- **Curriculum designers** prototyping activity flows with the DSL editor
- **Education startups** extending a proven lesson platform
- **Hackathon teams** looking for a polished, feature-complete education tool to build on

---

## Project Structure

```
src/
├── components/          # UI components (Builder, Player, Live, Grading, etc.)
│   └── tasks/           # 15+ interactive task type implementations
├── config/              # DSL schema, task registry, slide registry, templates
├── context/             # React context (AppContext)
├── hooks/               # Shared hooks (favorites, shuffle seed)
└── utils/               # Core utilities
    ├── lesson.js         # Block validation and transformation
    ├── grading.js        # Score normalization and grading logic
    ├── liveChannel.js    # Live session channel adapter
    ├── liveTransport.js  # Transport layer (Supabase / BroadcastChannel)
    ├── cloudSync.js      # Cloud lesson sync
    └── theme.js          # Dark mode and theme management

supabase/
├── schema.sql           # Core database schema
└── migrations/          # Incremental schema updates

scripts/
├── live-flow-smoke.mjs  # Live protocol smoke tests
└── validate-dsl.mjs     # DSL fixture validation
```

---

## License

MIT
