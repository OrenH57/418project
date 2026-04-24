# CampusConnect

CampusConnect is a UAlbany-focused prototype for student food delivery and campus ride help. Students can request Campus Center food delivery after ordering in GET, request rides, accept courier jobs, and coordinate through in-app messaging.

## Project Structure

This project is now organized with clearer frontend and backend boundaries:

```text
418 final/
├── frontend/
│   ├── public/              # Static frontend assets
│   └── src/
│       ├── app/
│       │   ├── components/  # Reusable UI, layout, marketing, and map components
│       │   ├── context/     # React providers and auth state
│       │   ├── lib/         # Frontend helpers, API client, config helpers
│       │   ├── pages/       # Public and signed-in app pages
│       │   ├── App.tsx      # Root app shell
│       │   └── routes.tsx   # Frontend route map
│       ├── main.tsx         # Frontend entrypoint
│       └── styles.css       # Global styles
├── backend/
│   ├── data/                # Local prototype data storage
│   ├── lib/                 # Backend helpers and shared server logic
│   ├── tests/               # Backend-oriented automated tests
│   └── index.mjs            # Backend entrypoint
├── index.html               # Vite HTML entry
├── package.json             # Shared scripts for local development
├── vite.config.ts           # Frontend build config
└── tsconfig.app.json        # Frontend TypeScript config
```

## What Is In The App

- Campus Center food delivery requests
- Campus ride requests
- Courier-side request pickup and messaging
- UAlbany verification flows
- Admin moderation tools for flagged listings and suspensions

Discount Dollars are still a placeholder.

## Running It Locally

Start the frontend:

```bash
npm run dev
```

Start the backend:

```bash
npm run dev:server
```

Run tests:

```bash
npm test
```

Type-check the frontend:

```bash
npx tsc -b
```

## Environment Setup

If you want to test Stripe locally, make a copy of the example env file first:

```bash
copy .env.example .env
```

Then fill in the values you need:

- `PUBLIC_APP_URL`
- `VITE_API_BASE_URL`
- `VITE_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`

The backend reads both `.env` and `.env.local`.

## Demo Accounts

- Requester: `ariana.green@albany.edu` / `demo1234`
- Courier: `marcus.hall@albany.edu` / `demo1234`
- Admin: `jordan.reyes@albany.edu` / `demo1234`

## Notes For The Team

- Do not share `.env.local`
- Do not commit `backend/data/app-data.json`
- Generated or local-only files like `dist`, `.npm-cache`, `*.log`, and `*.tsbuildinfo` should stay out of Git

## Hosting Note

GitHub Pages can host the frontend, but not the backend. If you want the full app online, use a frontend host like GitHub Pages or Vercel and a backend host like Render or Railway.
