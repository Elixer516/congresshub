# CongressHub — Youth Congress Management (Portfolio Demo)

A phone-first web app for running a multi-diocese youth congress: online applications, delegate records,
colour-coded QR ID cards, live attendance scanning, room/group/immersion assignments, a working-committee
module, transport tracking and printable reports.

> **This is a demo.** There is no database: the app runs on invented sample data held in memory, which
> resets every day. Every name, phone number and email is made up. Pick a role on the sign-in page to
> look around; when an action asks for a PIN, use **123456**.

## What it does

- **Applications** — public form with photo upload, review queue, approve → delegate record + QR badge.
- **Delegates** — search and filters (region, diocese, role, kit, status), profiles, edit history, kit hand-out,
  shirt sizes, active vs. backed-out headcounts.
- **ID cards** — region-coloured card design drawn on the server; bulk download per region as a zip of PNGs.
- **Attendance** — sessions with time-in/time-out scanning from several phones at once, offline queue,
  manual entry, per-scanner history, CSV export.
- **Assignments** — dynamic groups, community immersion places and host parishes, reassignment, and
  one-page facilitator name lists.
- **Working Committee** — staff with their own ID cards, duty time-in/out with late/no-show flags,
  deliverables board, committee-head logins.
- **Transport** — trip updates with optional GPS location; the secretariat and admins get notified.
- **Reports** — delegates per diocese and shirt sizes per colour, downloadable for suppliers.
- **Ranks** — Head admin, Admin, Secretariat, Transportation, Committee head, each seeing only what they need;
  notification bell; full audit log.

## Built with

Next.js (App Router), React, TypeScript, Tailwind CSS, Zod, `next/og` for ID cards, ZXing for QR reading,
fflate for zip downloads. The production version uses Supabase (Postgres with row-level security,
storage), PIN + TOTP two-step sign-in, and is hosted on Vercel.

In this demo, `src/lib/server/mock-db.ts` stands in for the database client and
`src/lib/server/demo-seed.ts` generates the sample data.

## Run it locally

```bash
npm install
cp .env.example .env.local   # then put random values in both lines
npm run dev
```

Open http://localhost:3000 and choose **Admin** (or go to `/admin/sign-in`).
