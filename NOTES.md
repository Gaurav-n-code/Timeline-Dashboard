# Notes

## Token Storage Decision

- I store the access token in `localStorage`.
- Reasoning:
  - The assignment requires the session to survive a full page refresh.
  - `localStorage` gives the simplest persistent session restore without requiring backend cookie changes.
  - The app centralizes token access in one place, so the token is not wired ad hoc through components.
- Trade-off:
  - `localStorage` is less safe than an `httpOnly` cookie if the app ever has an XSS issue.
  - I accepted that trade-off because the assignment is focused on client-side session handling and the backend already returns the token in the login response body.

## Session Restoration

- On app start, the auth provider reads the stored token.
- If a token exists, the app calls `GET /auth/me` before showing the protected dashboard.
- If `GET /auth/me` succeeds, the session is restored and the current user is stored in auth state.
- If `GET /auth/me` fails with `401` or any other fatal auth error, the stored token is cleared and the user is sent back to `/login`.

## Authorization Flow

- `POST /auth/login` returns `{ access_token, token_type }`.
- After a successful login:
  - the token is persisted,
  - the app calls `GET /auth/me`,
  - the current user profile is stored in auth state,
  - the app navigates to the dashboard.
- A single Axios request interceptor reads the stored token and attaches `Authorization: Bearer <token>` to authenticated requests.
- `POST /auth/logout` is called during logout, and the stored token is cleared in all cases.
- Any authenticated request that returns `401` is treated as an expired session, which clears auth state and redirects to `/login`.

## Chart Optimization Approach

- I used a canvas-based chart instead of SVG.
- Why:
  - The assignment explicitly requires the chart to stay responsive with `10,000–20,000` individual produce markers.
  - Canvas is a better fit for dense, time-based rendering than per-element SVG updates.
- Performance decisions:
  - Segment geometry and marker geometry are precomputed before drawing.
  - Marker lookup for hover is narrowed with binary search and a small local scan instead of walking the full list.
  - No per-marker date parsing or color resolution happens inside the hot render path.
  - The chart re-renders only when the model, zoom range, hover, or container size changes.
- Failure markers are never dropped.
  - If marker thinning is ever introduced, FAIL markers must remain visible.
  - I did not add a downsampling layer that could hide defects.

## UTC to IST Handling

- The API is treated as UTC end-to-end.
- The UI is treated as IST (`Asia/Kolkata`).
- Shift windows are built from `date + shift HH:MM` in IST, then converted to UTC before sending the request.
- Response timestamps are converted back to IST for:
  - chart axis labels,
  - tooltips,
  - hourly table headers,
  - hourly summary bucketing.
- This avoids the common `+05:30` shift error and keeps the visual timeline aligned with the operator’s local time.

## Hourly Bucketing

- The hourly summary table is built from the same timeline data used by the chart.
- Runtime, downtime, and stoppage segments are split across hour boundaries in IST.
- For each segment:
  - convert its UTC start/end to IST,
  - intersect it with each hourly bucket,
  - add only the overlapping minutes to that hour row.
- Produce totals come from `produce_counts`.
  - Counts are summed across part models for the same hour.
  - `Total = Pass + Fail`.
- Hourly cycle metrics come from `POST /analytics-query`.
  - The table matches rows by `bucket_start`.
  - `null` cycle metric values are rendered as blank cells.
- The chart and table share the same hour alignment so the summary and visual timeline stay consistent.

## Assumptions

- The selected asset node from the asset tree is the intended machine/line scope for the dashboard.
- The backend data in this task is expected for `22–25 June 2026`, so I defaulted the dashboard date to `2026-06-23` to avoid an empty first load.
- The backend already returns tiled, non-overlapping runtime/downtime/stoppage segments, so the client only buckets them by hour.
- `unknown` downtime is treated as the "Unknown Downtime" row in the summary table.
- `produce_counts` is the primary source for hourly pass/fail totals unless the API response does not include it, in which case the app can fall back to individual produces.

## Trade-offs

- I chose `localStorage` over an `httpOnly` cookie because the backend already exposes the token in the response body and the assignment values refresh persistence.
- I chose a custom canvas chart over a charting library because it gave tighter control over marker performance and hover behavior.
- I kept derived hourly math on the client so the chart and table can share one source of truth and stay visually aligned.
- I accepted a slightly larger client bundle in exchange for reducing runtime complexity and avoiding a brittle chart abstraction.

## Performance Decisions

- Centralized API access through one Axios client.
- Reused the same machine-interval request for chart and summary generation.
- Added retry with backoff for retryable `500` responses.
- Precomputed chart data and hourly rows in pure helper modules.
- Used stable hour keys so the table does not drift when the request is refreshed or the toggle changes.
- Kept the UI responsive by separating loading, error, empty, and ready states instead of trying to render partial data in one branch.

## How To Run

```bash
npm install
```

Set the backend base URL in `.env.local`:

```bash
VITE_API_BASE_URL=your-backend-base-url-here
```

Then start the app:

```bash
npm run dev
```
