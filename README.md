# CampusConnect

CampusConnect is a UAlbany-focused prototype for student delivery and campus ride help. The idea is simple: students can request food delivery after placing an order in GET, ask for a ride across campus, or pick up nearby requests to earn some extra money.

## What’s in the app

- Food delivery requests for Campus Center orders
- Ride and general campus help requests
- Courier-side request pickup and messaging
- Demo auth flows for requester and courier views

Discount Dollars are still just a placeholder for now.

## Project layout

The codebase is split up by feature so it is a little easier to follow:

- `src/app/pages/public` holds the landing page, auth page, and public error screen
- `src/app/pages/app` holds the signed-in app pages like home, profile, requests, messages, and admin
- `src/app/components/layout` has the shared shell and navigation pieces
- `src/app/components/marketing` has public-facing landing page visuals
- `src/app/components/maps` has map-related display components
- `src/app/components/ui` has the reusable UI building blocks
- `src/app/lib` has frontend helpers, shared utilities, and the API client
- `server` contains the backend entrypoint and data logic
- `public` contains static frontend assets

Generated or local-only files like `dist`, `.npm-cache`, `*.log`, and `server/data/app-data.json` should stay out of Git.

## Running it locally

Start the frontend:

```bash
npm run dev
```

Start the backend:

```bash
npm run dev:server
```

If you want to test Stripe locally, make a copy of the example env file first:

```bash
copy .env.example .env
```

Then fill in the values you need:

- `PUBLIC_APP_URL`
- `VITE_API_BASE_URL`
- `VITE_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`

The backend reads both `.env` and `.env.local`, so either one works.

For food delivery requests, payment happens through Stripe as soon as the request is submitted. After checkout finishes, the request opens in chat and shows the payment status there.

## Notes for the team

- Do not share `.env.local`
- Do not commit `server/data/app-data.json`
- The repo includes demo data so everyone can start from roughly the same place

Demo accounts:

- `ariana.green@albany.edu` / `demo1234`
- `marcus.hall@albany.edu` / `demo1234`

## GitHub Pages

This repo can deploy the frontend with GitHub Actions.

To turn that on:

1. Push the repo to GitHub.
2. Open `Settings` in the repository.
3. Open `Pages`.
4. Set the source to `GitHub Actions`.
5. Push again or run the `Deploy Frontend To GitHub Pages` workflow manually.

The URL will look like this:

```text
https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPOSITORY_NAME/
```

## One important limitation

GitHub Pages only hosts the frontend. The React app can live there, but the backend in `server/index.mjs` cannot. That means login, requests, chat, and local JSON persistence will not work unless the backend is hosted somewhere else too.

If you want the full app online, the easiest setup is:

- GitHub Pages or Vercel for the frontend
- Render or Railway for the backend

## Suggested hosting setup

### Backend

- Root: `418 final`
- Build command: `npm install`
- Start command: `node server/index.mjs`

### Frontend

- Root: `418 final`
- Build command: `npm run build`
- Output directory: `dist`

### Frontend env vars

- `VITE_API_BASE_URL=https://YOUR-BACKEND-URL/api`
- `VITE_AZURE_REDIRECT_URI=https://YOUR-FRONTEND-URL`

### Backend env vars

- `PUBLIC_APP_URL=https://YOUR-FRONTEND-URL`
- `STRIPE_SECRET_KEY=...`
- `VITE_STRIPE_PUBLISHABLE_KEY=...`
- `AZURE_CLIENT_ID=...`
- `AZURE_TENANT_ID=...`
