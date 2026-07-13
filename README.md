# Firewatch Lebanon

An independent operational map for recent satellite thermal anomalies over Lebanon. It reads NASA FIRMS active-fire feeds, can add MTG-FCI observations from the Tabula Caloris compatibility bridge, groups nearby observations into trackable events, and keeps the difference between a satellite detection and a mapped fire perimeter explicit.

The data layer can run without provider credentials using clearly labeled generated demo data. A free NASA FIRMS map key enables the live feed. Application access is protected by a server-side username and password configured in `.env`.

## Quick start

Requirements: Node.js 20.19 or newer and npm.

```powershell
npm install
Copy-Item .env.example .env
# Add FIRMS_MAP_KEY, APP_LOGIN_USER, and APP_LOGIN_PASSWORD to .env
npm run dev
```

Open `http://127.0.0.1:4173`. Request a free key from the [NASA FIRMS map-key page](https://firms.modaps.eosdis.nasa.gov/api/map_key/).

The sign-in form is always shown before the map. Without `FIRMS_MAP_KEY`, the authenticated application starts in **Demo data** mode. If every configured live provider fails, it switches to **Demo fallback** and shows the failure in the interface. Demo records are generated locally and are never represented as satellite observations.

## Authentication

`APP_LOGIN_USER` and `APP_LOGIN_PASSWORD` are validated only by the Express server. A successful login creates a random, HttpOnly, SameSite session cookie; the password is not embedded in the browser bundle. Sessions expire after `APP_SESSION_HOURS` and are held in memory, so restarting the server signs users out. Five failed attempts from one address trigger a 15-minute rate limit.

For access beyond the local machine, serve the application through HTTPS so the session cookie and credentials are encrypted in transit.

## Data sources

The server queries the [NASA FIRMS Area API](https://firms.modaps.eosdis.nasa.gov/api/area/) for these near-real-time products:

| Product | Sensor/platform | Nominal active-fire pixel |
| --- | --- | --- |
| `VIIRS_SNPP_NRT` | VIIRS / Suomi NPP | 375 m |
| `VIIRS_NOAA20_NRT` | VIIRS / NOAA-20 | 375 m |
| `VIIRS_NOAA21_NRT` | VIIRS / NOAA-21 | 375 m |
| `MODIS_NRT` | MODIS / Terra and Aqua | 1 km |
| `MTG_FCI_LSA_SAF` | FCI / MTG-I1 | 1 km |

FIRMS is an open-data service with a free API key; it is not an anonymous unlimited endpoint. Sensor resolution and current product availability are documented by [NASA FIRMS Active Fire Data](https://firms.modaps.eosdis.nasa.gov/active_fire/).

The optional MTG bridge reads only FCI records from the public Tabula Caloris live index and attributes the underlying observations to [EUMETSAT LSA SAF](https://lsa-saf.eumetsat.int/en/data/products/fire-products/). It avoids duplicating VIIRS and MODIS records already retrieved from FIRMS. This is a compatibility endpoint rather than a documented service contract, so production systems should obtain direct LSA SAF data-service access and retain FIRMS-only fallback behavior.

The map uses MapLibre GL JS with OpenStreetMap and OpenTopoMap raster tiles. Their public tile servers are suitable for development and light use. A public production deployment should use an appropriate hosted or self-managed tile service and comply with attribution and usage policies.

## Collection pipeline

1. The browser asks the local Express server for a time window between 1 and 120 hours.
2. The server converts the window to a FIRMS day range and queries all four NASA products in parallel for `west,south,east,north`.
3. FIRMS and MTG retrieval run independently in parallel. The larger Caloris live index has its own timeout; transient index and event-file failures are retried, successful event files are retained, and a recent in-memory MTG snapshot can cover a failed refresh.
4. When enabled, the server reads recent Lebanon events from the Caloris live index and imports only MTG-FCI hotspot records. MTG positions are H3 resolution-9 cell centers from the compatibility record.
5. Responses are normalized to UTC timestamp, coordinates, instrument, platform, source product, confidence, Fire Radiative Power (FRP), day/night flag, and type when supplied.
6. Invalid dates and coordinates are dropped. The requested hour cutoff is applied after retrieval.
7. Successful source responses are combined and filtered to the comparison tracker's Lebanon H3 coverage, with explicit exclusions for the Syrian Rif Dimashq and Homs areas. This prevents rectangular FIRMS query bounds and coarse border cells from adding those foreign events.
8. Individual source failures produce a **Partial live** result instead of discarding valid data.
9. Results are cached server-side for four minutes by default. The browser refreshes every five minutes while a local CSV is not active.

The API key remains on the server. It is never included in browser JavaScript or browser network requests.

## Event methodology

The event layer is derived locally and is deliberately reproducible:

1. Valid detections are sorted by observation time.
2. Each detection is indexed into an [H3](https://h3geo.org/docs/) resolution-7 cell. An average resolution-7 hexagon is about 5.16 km2 with a 1.22 km edge; actual area varies by location.
3. A detection joins detections in its cell or one immediately adjacent H3 cell when the observation gap is at most 12 hours. Connected observations form one event; this preserves continuity across repeated satellite passes.
4. The displayed event marker is the center of a resolution-7 anchor cell. MTG compatibility records retain the source event's H3 anchor so those markers match the comparison tracker exactly. Other events use the cell containing the mean member coordinate; a source anchor is preferred for mixed events. Region names are nearest-region labels, not administrative point-in-polygon results.
5. The colored envelope is the union of resolution-9 H3 cells containing detections. It visualizes detection coverage only.

The envelope is **not** an observed fire perimeter, burned-area estimate, ignition point, spread model, or forecast. FIRMS usually supplies hotspot points; NASA explains this point-versus-footprint distinction in its [fire-footprint tutorial](https://firms.modaps.eosdis.nasa.gov/tutorials/fire-footprint/).

### Derived labels

Priority is a triage heuristic, not an official emergency classification:

| Priority | Rule; any condition is sufficient |
| --- | --- |
| Critical | maximum FRP >= 45 MW, summed FRP >= 240 MW, or at least 35 detections |
| High | maximum FRP >= 18 MW, summed FRP >= 75 MW, or at least 12 detections |
| Watch | all other visible events |

Status is based on the newest member detection: **Recent** up to 6 hours, **Monitoring** up to 24 hours, and **Stale** after 24 hours.

Categorical confidence values are normalized as low = 30, nominal = 65, and high = 90. Numeric values are clamped to 0-100. "Summed FRP" is the sum of instantaneous FRP samples across sensors and passes; it is useful for sorting this view but is not energy, burned area, or a deduplicated physical total.

## CSV interoperability

Use the upload button to inspect a downloaded FIRMS CSV or another comma/semicolon-delimited detection export. Import pauses automatic retrieval until the live feed is restored.

Required columns:

- `latitude`, `longitude`
- either `timestamp`, or FIRMS-style `acq_date` plus `acq_time`

Recognized optional columns include `frp`, `confidence`, `instrument`, `satellite`, `source_product`, `sourceProduct`, `daynight`, and `type`. This provides a direct adapter path for exported detections from LSA SAF, Copernicus workflows, or another platform without placing those systems' credentials in this application.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `FIRMS_MAP_KEY` | empty | Enables live NASA FIRMS retrieval |
| `FIRMS_CA_CERT` | empty | Optional extra PEM CA for inspected HTTPS connections |
| `CALORIS_MTG_BRIDGE` | `false` | Adds MTG-FCI records from the public Caloris live index |
| `CALORIS_BASE_URL` | Caloris public URL | Compatibility endpoint base URL |
| `CALORIS_TIMEOUT_MS` | `90000` | Overall MTG provider timeout |
| `CALORIS_INDEX_TIMEOUT_MS` | `60000` | Timeout per Caloris live-index attempt |
| `CALORIS_REQUEST_TIMEOUT_MS` | `15000` | Timeout per Caloris event-file attempt |
| `CALORIS_STALE_MS` | `1800000` | Maximum age for an in-memory MTG fallback snapshot |
| `APP_LOGIN_USER` | empty | Required application username |
| `APP_LOGIN_PASSWORD` | empty | Required application password; keep only in `.env` |
| `APP_SESSION_HOURS` | `12` | In-memory login session lifetime |
| `FIRE_BBOX` | `34.75,32.75,36.75,34.75` | Query bounds in west,south,east,north order |
| `FIRMS_CACHE_MS` | `240000` | Successful or fallback response cache duration |
| `FIRMS_TIMEOUT_MS` | `45000` | Overall NASA FIRMS provider timeout |
| `HOST` | `127.0.0.1` | Server bind address |
| `PORT` | `4173` | Server port |

For access from another machine, set `HOST=0.0.0.0`, restrict it with the firewall, and terminate HTTPS at a trusted reverse proxy.

## Build and verification

```powershell
npm run check
npm test
npm run build
npm start
```

`npm start` serves the production bundle and API from one process.

## Deploy on Render Free

This repository includes a `render.yaml` Blueprint for one free Node web service in Frankfurt. It binds Express to Render's public interface, builds the Vite client, starts the production server, and checks `/health`. The Blueprint deliberately leaves all secret values for entry in Render's dashboard.

1. Push the project to a private GitHub repository. `.env`, `.local-certs`, `node_modules`, logs, and build output are already ignored.
2. In Render, choose **New > Blueprint**, connect GitHub, and select the repository.
3. Keep the detected `render.yaml` path and continue.
4. Enter `FIRMS_MAP_KEY`, `APP_LOGIN_USER`, and `APP_LOGIN_PASSWORD` when Render prompts for the three `sync: false` variables. Do not add `FIRMS_CA_CERT`; it is only needed for this computer's inspected HTTPS connection.
5. Confirm the `firewatch-lebanon` service uses the **Free** instance and click **Deploy Blueprint**.
6. Wait for the build and `/health` check to pass, then open the generated `https://firewatch-lebanon-...onrender.com` URL and sign in.

The Render configuration uses a 15-minute data cache to reduce Caloris traffic and help stay within free outbound-bandwidth limits. A free service sleeps after 15 minutes without inbound traffic and can take about one minute to wake. Because sessions are in memory, a sleep, restart, or deployment signs users out. No database or persistent disk is required.

## Limitations and responsible use

- A hotspot is a thermal anomaly within a sensor pixel, not proof of a vegetation fire at the exact point.
- Industrial heat, flares, agricultural burns, volcanoes, and other hot surfaces can be detected. The type filter only works when the provider supplies a usable type field.
- Clouds, smoke, terrain, orbit timing, downlink gaps, and sensor thresholds can delay or hide detections.
- Multiple sensors or passes can observe the same physical fire. Counts and summed FRP are therefore observation metrics.
- Near-real-time records can be revised or replaced by science-quality standard products. Use standard products for retrospective scientific analysis.
- This application has no weather-driven spread model, ground reports, dispatch workflow, alert delivery, user directory, or durable database. Its single configured login and sessions are intentionally lightweight.
- Do not use this map as the sole basis for emergency response, evacuation, legal conclusions, or loss assessment. Confirm incidents with local authorities and ground observations.

## Project structure

```text
server.mjs              Express API, cache, demo/live mode switching
server/auth.mjs         Login validation, rate limiting, and in-memory sessions
server/firms.mjs        FIRMS requests and CSV normalization
server/caloris.mjs      Optional MTG-FCI compatibility decoder
server/http.mjs         Verified HTTPS transport with optional local CA
server/demo.mjs         Clearly labeled deterministic demo feed
src/lib/cluster.ts      H3 spatial-temporal event derivation
src/lib/csv.ts          Browser-side import/export adapter
src/components/         Operational map, filters, event detail, methodology
```
