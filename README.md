# Mayor Edits

A video editing portfolio. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how it works.

## Run it

1. Copy `.env.example` to `.env.local` and fill it in.
2. `npm install`, then `npm run dev`. The site is at http://localhost:3000, and the admin area at `/admin`.

| Command | What it does |
|---|---|
| `npm run typecheck`, `npm run lint` | Static checks |
| `npm run test:unit` | Upload logic, with stand-ins for storage |
| `npm run test:e2e` | The owner's whole journey against real services. See the top of the spec |
| `npm run build` | Production build. It reads the live portfolio, so the Supabase settings must be present |

## Preparing a video

- Export an **MP4 with H.264 video**, up to 500 MB. Other formats are refused, because not every browser can play them.
- Aim for **5 to 8 Mbps**. Each video is one file at one quality, so higher bitrates make visitors on slower connections
  stop to buffer. The uploader warns above 10 Mbps.
