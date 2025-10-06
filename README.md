# summit-2025-eda-space-project
# SCUI site

## Ansible Automation Platform integration

This site can trigger AAP Job Templates when scenario buttons are clicked.

### Configure

1. Set environment variables on the container (via Ansible role defaults/inventory or a `.env` file):

   - `aap_base_url`: Base URL to your AAP host ONLY (no path, no trailing slash), e.g. `https://aap.example.com`
   - `aap_bearer_token`: Bearer token for a service account with permission to launch the required Job Templates

   These are passed into the container as `AAP_BASE_URL` and `AAP_BEARER_TOKEN` and injected into Nginx.

   Optional client bearer for demo protection:

   - `API_CLIENT_BEARER_TOKEN`: A shared bearer token required on UI control and AAP proxy API calls.
     Example `.env`:
     ```env
     API_CLIENT_BEARER_TOKEN=DEMO_SECRET
     ```

2. Assign Job Template IDs to buttons in `index.html` by filling `data-aap-jt` attributes, e.g.:

```html
<button data-video="assets/video/home.mp4" data-aap-jt="42" class="change-video">Engine Failure</button>
```

3. Optional: `.env` for local runs (Podman/Docker):

   Create `.env` in repository root (do not quote values):

   ```env
   # Must be the full controller API base and end with '/'
   AAP_BASE_URL=https://aap.sandbox127.opentlc.com/api/controller/v2/
   AAP_BEARER_TOKEN=YOUR_TOKEN
   ```

   Then run the container:

   ```bash
   podman --env-file .env run --rm -p 8080:80 --name scui-nginx scui-site:latest
   ```

### How it works

- Nginx exposes `POST /api/controller/aap/launch/{job_template_id}/` inside the container.
  - Requests are proxied to `${AAP_BASE_URL}job_templates/{id}/launch/` with `Authorization: Bearer ${AAP_BEARER_TOKEN}`.
  - Frontend sends an empty JSON body when a button with `data-aap-jt` is clicked.
  - If `API_CLIENT_BEARER_TOKEN` is set, API calls require header `Authorization: Bearer ${API_CLIENT_BEARER_TOKEN}`.

### UI control: Return to Home via API

- Stream events: `GET /api/controller/ui/events` (SSE)
- Trigger Home: `POST /api/controller/ui/home`

Examples:
```bash
curl -X POST http://localhost:8080/api/controller/ui/home | cat
curl -X POST http://localhost:8080/api/controller/ui/home \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${API_CLIENT_BEARER_TOKEN}" \
  -d '{"scenario":"shields_down_resolved"}' | cat
```

### Scenario control via API (start and resolve)

- Start scenarios (plays initiation once, then loops runtime):
```bash
# Engine Failure
curl -X POST http://localhost:8080/api/controller/ui/home \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${API_CLIENT_BEARER_TOKEN}" \
  -d '{"scenario":"engine_failure_init"}' | cat

# Solar Storm
curl -X POST http://localhost:8080/api/controller/ui/home \
  -H 'Content-Type: application/json' \
  -d '{"scenario":"solar_storm_init"}' | cat

# Docking Refused
curl -X POST http://localhost:8080/api/controller/ui/home \
  -H 'Content-Type: application/json' \
  -d '{"scenario":"docking_refused_init"}' | cat

# Shields Down
curl -X POST http://localhost:8080/api/controller/ui/home \
  -H 'Content-Type: application/json' \
  -d '{"scenario":"shields_down_init"}' | cat
```

- Resolve scenarios (plays resolved once, then returns Home):
```bash
# Engine Failure
curl -X POST http://localhost:8080/api/controller/ui/home \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${API_CLIENT_BEARER_TOKEN}" \
  -d '{"scenario":"engine_failure_resolved"}' | cat

# Solar Storm
curl -X POST http://localhost:8080/api/controller/ui/home \
  -H 'Content-Type: application/json' \
  -d '{"scenario":"solar_storm_resolved"}' | cat

# Docking Refused
curl -X POST http://localhost:8080/api/controller/ui/home \
  -H 'Content-Type: application/json' \
  -d '{"scenario":"docking_refused_resolved"}' | cat

# Shields Down
curl -X POST http://localhost:8080/api/controller/ui/home \
  -H 'Content-Type: application/json' \
  -d '{"scenario":"shields_down_resolved"}' | cat
```

### Troubleshooting

- If the container logs show Nginx syntax errors like unexpected characters, ensure your `.env` values are NOT wrapped in quotes.
- Ensure `AAP_BASE_URL` includes the full controller path and ends with a trailing slash (e.g., `https://aap.example.com/api/controller/v2/`).
 

### Security notes

- The bearer token is stored as a container environment variable and only used server-side. Do not hardcode it in frontend files.
- Restrict network egress from the container to your AAP instance as needed.

## Media assets (videos and audio)

This repo ignores large media in git by default (.mp4/.mp3). Place your files locally in the following structure so the app can find them. The scenario key used in `index.html` (the `data-scenario` attribute) must match the directory name.

### Structure
- Base paths:
  - Videos: `assets/video/scenarios/<scenario>/<stage>/<stage>.mp4`
  - Audio: `assets/audio/<scenario>/<stage>/<stage>.mp3`
- Supported stages: `initiation`, `runtime`, `resolved`
- Home background audio (looped on the home screen):
  - `assets/audio/sc_home_background.mp3`

Example (engine_failure scenario):
```
assets/
  video/
    home.mp4
    scenarios/
      engine_failure/
        initiation/initiation.mp4
        runtime/runtime.mp4
        resolved/resolved.mp4
  audio/
    sc_home_background.mp3
    engine_failure/
      initiation/initiation.mp3
      runtime/runtime.mp3
      resolved/resolved.mp3
```

### Wiring a scenario button
- In `index.html`, add or edit a button with `data-scenario` set to your scenario key:
```
<button data-video="assets/video/home.mp4" data-scenario="engine_failure" class="change-video">Engine Failure</button>
```
- Behavior:
  - Click: plays `initiation` once, then `runtime` (audio and video).
  - API resolve: plays `resolved` once, then returns to home.

### Notes
- The app will return 404 if a required file is missing; check your browser Network tab.
- Git ignores media by default. Keep placeholder files (e.g., `.gitkeep`) if you want the empty directories tracked.
- When building an image, the media under `assets/` is copied into `/usr/share/nginx/html/assets/` by the Containerfile.
