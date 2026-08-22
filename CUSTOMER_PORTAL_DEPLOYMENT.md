# Customer Portal Deployment

This is the independent customer website. It uses the OpsIQ API as its source of schedule data but does not expose the internal OpsIQ application UI.

## Free Cloudflare Pages setup

Create a Cloudflare Pages project from the GitHub repository and use:

- Build command: `npm run build:react`
- Output directory: `dist/renderer`
- Node version: `20`
- `VITE_CUSTOMER_PORTAL_ONLY`: `true`
- `VITE_API_BASE`: the production customer API or same-origin proxy URL

Do not set `VITE_API_BASE` to `localhost` in Cloudflare Pages.

## Domain

After registering `producedepotschedule.com`, add it under Cloudflare Pages > Custom domains. Cloudflare provides the DNS target and HTTPS certificate. The site can use either:

- `https://producedepotschedule.com`
- `https://www.producedepotschedule.com`

No Namecheap web hosting is required.

## API production requirement

For production, expose only the customer portal routes through a same-origin proxy or a dedicated API hostname:

- `GET /api/customer-portal/schedule`
- `POST /api/customer-portal/requests`

The API must keep the customer PIN validation and server-side customer filtering. Do not expose broad appointment or work-order endpoints to the public site. Configure CORS to allow only the deployed customer website origin.

## Local preview

Run the API and customer build separately:

```powershell
$env:PORT='3001'; npm run dev:server
$env:VITE_API_BASE='http://localhost:3001'; $env:VITE_CUSTOMER_PORTAL_ONLY='true'; npm run dev:react -- --port=5175
```

Open `http://localhost:5175/#/customer-portal`.
