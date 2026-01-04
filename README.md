# Cloudflare Observer

A real-time dashboard for monitoring Cloudflare usage and estimating costs across all your services.

## Features

- **Workers** - Track requests, CPU time, and overage costs
- **R2 Storage** - Monitor Class A/B operations and storage usage
- **KV** - Track reads, writes, deletes, lists, and storage
- **D1** - Monitor rows read/written and storage per database
- **Images** - Track transformations, stored and delivered images
- **Workers AI** - Monitor neuron usage
- **Vectorize** - Track queried and stored vector dimensions

### Dashboard Features

- Real-time usage percentages with color-coded progress bars
- Overage cost calculation based on Cloudflare pricing
- Cost summary with total estimated monthly costs
- Pricing rates displayed for each metric
- Error handling with frontend display for failed services
- Auto-refresh every minute
- Dark mode support

## Tech Stack

- [TanStack Start](https://tanstack.com/start) - Full-stack React framework
- [TanStack Query](https://tanstack.com/query) - Data fetching and caching
- [Cloudflare Workers](https://workers.cloudflare.com) - Edge deployment
- [shadcn/ui](https://ui.shadcn.com) - UI components
- [Tailwind CSS](https://tailwindcss.com) - Styling

## Environment Variables

Create a `.dev.vars` file in the project root with the following variables:

```env
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_API_TOKEN=your_api_token
CLOUDFLARE_EMAIL=your_email@example.com
```

### Getting Your Credentials

1. **Account ID**: Found in the Cloudflare dashboard URL or in the right sidebar of any zone
2. **API Token**: Create one at [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens) with the following permissions:
   - Account > Account Analytics > Read
   - Account > Workers Scripts > Read
   - Account > D1 > Read
   - Account > Workers AI > Read
   - Account > Cloudflare Images > Read
3. **Email**: Your Cloudflare account email

## Development

```bash
# Install dependencies
pnpm install

# Start the development server
pnpm dev
```

The app will be available at `http://localhost:3000`.

## Deployment

Deploy to Cloudflare Workers:

```bash
# Build and deploy
pnpm deploy
```

Make sure to set the environment variables in your Cloudflare Workers settings:

```bash
wrangler secret put CLOUDFLARE_ACCOUNT_ID
wrangler secret put CLOUDFLARE_API_TOKEN
wrangler secret put CLOUDFLARE_EMAIL
```

## License

MIT
