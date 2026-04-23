# CampusConnect

CampusConnect is a UAlbany student-to-student campus service app prototype.

## What the app includes

- food pickup from GET / Campus Center restaurants
- Discount Dollars marked as a coming-soon feature
- rides and campus help requests
- courier-side job acceptance and chat

## Local development

Frontend:

```bash
npm run dev
```

Backend:

```bash
npm run dev:server
```

Stripe test checkout:

```bash
copy .env.example .env
```

Then fill in:

- `PUBLIC_APP_URL` with your frontend URL
- `VITE_API_BASE_URL` with your backend API base URL like `http://127.0.0.1:4174/api` for local dev or `https://your-backend.onrender.com/api` for production
- `VITE_STRIPE_PUBLISHABLE_KEY` with your Stripe publishable test key
- `STRIPE_SECRET_KEY` with your Stripe secret test key

The backend reads both `.env` and `.env.local`, so either works.

For food pickup requests, the requester now pays in Stripe immediately when the order is submitted. After Stripe returns, the request opens in the chat page with payment status shown there.

## Team sharing notes

- Do not share `.env.local`
- Do not commit `server/data/app-data.json`
- The app now includes a clean demo data file, so each teammate can start from the same baseline
- Demo accounts:
  - `ariana.green@albany.edu` / `demo1234`
  - `marcus.hall@albany.edu` / `demo1234`

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

## Full online hosting

Recommended setup:

- Frontend on Vercel
- Backend on Render web service

Backend settings:

- Root: `418 final`
- Build command: `npm install`
- Start command: `node server/index.mjs`

Frontend settings:

- Root: `418 final`
- Build command: `npm run build`
- Output directory: `dist`

Frontend environment variables:

- `VITE_API_BASE_URL=https://YOUR-BACKEND-URL/api`
- `VITE_AZURE_REDIRECT_URI=https://YOUR-FRONTEND-URL`

Backend environment variables:

- `PUBLIC_APP_URL=https://YOUR-FRONTEND-URL`
- `STRIPE_SECRET_KEY=...` if using Stripe
- `VITE_STRIPE_PUBLISHABLE_KEY=...` if using Stripe
- `AZURE_CLIENT_ID=...` and `AZURE_TENANT_ID=...` if using Microsoft sign-in
