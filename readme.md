# WPI Planner

A port of the WPI course planner to Svelte, with some improvements. Fully client-side apart from one small endpoint that keeps the course catalog fresh.

Improvements include:
- Nameable favorite saved schedules.
- Import current schedule from Workday into the planner.
- Export to .ics calendar (can be imported into Outlook Calendar, Google Calendar, etc.), with holidays and recesses left out.
- Search bar for classes by name and professors by name.
- Reorganized class selection by lecture and then lab/discussion & separated out by term.
- Evening sections (up to 9 PM) are schedulable.
- Shorter, human readable share links.


## Quick Start

> _Tip: Use pnpm. It's nicer and more performant than npm. To install, run `npm install -g pnpm` or see https://pnpm.io/installation if you don't have npm installed._

```sh
# Install dependencies (esbuild's postinstall must be allowed to run)
pnpm install

# Start development server (also serves the live catalog at /api/catalog/)
pnpm dev

# Build the static site into build/
pnpm build

# Preview production build
pnpm preview
```

## Other commands

```sh
pnpm test          # all tests (converter tools + app)
pnpm run check     # svelte-check; keep it at 0 errors, 0 warnings
pnpm updateData    # refresh the committed fallback catalog (static/schedb.json) from Workday
```

## Deployment

Deployed on Vercel (`vercel.json`). The site is a static bundle plus one
function, `api/catalog.ts`, which serves the live catalog; if that endpoint is
down, the app falls back to the committed `static/schedb.json`. See
[`server/README.md`](server/README.md) to host the endpoint elsewhere.

**Every academic year:** term dates, holidays, and breaks for calendar export
are hand-maintained in `src/lib/config/academicCalendar.ts` — they are not in
the Workday data. The checklist is at the bottom of that file.

## License

GNU AGPL v3 — see [`LICENSE`](LICENSE).

> Based off https://github.com/Jmckeen8/wpiplanner