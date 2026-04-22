# CampusConnect

CampusConnect is a UAlbany student-to-student campus service app prototype.

## What the app includes

- food pickup from GET / Campus Center restaurants
- discount dollar runs
- rides and campus help requests
- courier-side job acceptance and chat
- a frontend campus map for campus delivery zones

## Local development

Frontend:

```bash
npm run dev
```

Backend:

```bash
npm run dev:server
```

## Team sharing notes

- Do not share `.env.local`
- Do not commit `server/data/app-data.json`
- The app now includes a clean demo data file, so each teammate can start from the same baseline
- Demo accounts:
  - `ariana.green@albany.edu` / `demo123`
  - `marcus.hall@albany.edu` / `demo123`

## GitHub Pages

This repo is set up to deploy the frontend automatically with GitHub Actions.

After you push to `main`:

1. Go to your GitHub repository.
2. Open `Settings`.
3. Open `Pages`.
4. Set the source to `GitHub Actions`.
5. Push again or run the `Deploy Frontend To GitHub Pages` workflow manually.

Your site URL will be:

```text
https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPOSITORY_NAME/
```

## Important limitation

GitHub Pages only hosts the frontend.

That means:

- the React app can be hosted there
- the Node backend in `server/index.mjs` will not run there
- login, requests, chat, and local JSON persistence will not work unless you also host the backend somewhere else

If you want the full app online, use:

- GitHub Pages for frontend only, plus Render/Railway/Glitch for backend
- or use Vercel/Netlify for frontend and Render/Railway for backend
