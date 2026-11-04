# OneShot App

Frontend for the OneShot submission. See the [root README](../README.md) for the full product overview, contract layout, and verification steps.

## Run

```bash
bun install
bun run dev      # http://localhost:3000
```

With the live API running (`bun run api` at the repo root, port 8787), the Demo Console's **LIVE MODE** streams real NEAR Sandbox runs through `VITE_API_URL`; every blocked retry is a real on-chain rejection. Without it, the console plays a recorded deterministic run (Replay Mode).

## Environment

Copy `.env.example` → `.env` and set:

| Variable | Description |
| --- | --- |
| `VITE_API_URL` | Base URL of the oneshot-api service. Unset (or unreachable) → Replay Mode. |

## Routes

- `/`: Landing page with the uncertainty-window animation, problem cards, lifecycle state table, and measured proof strip.
- `/demo`: Chaos console — side-by-side naive retry loop vs OneShot-guarded agent, live event stream, duplicate-fill damage meter, in-flight reservation bar.
- `/how-it-works`: Architecture diagrams (guard loop, dual-path resolution).
- `/builders`: SDK reference mirror, repo tree, and security matrix.
