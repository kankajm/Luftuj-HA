# Luftujha Home Assistant Add-on

The Luftujha add-on provides a real-time dashboard for valves exposed as `number.luftator_*` entities in Home Assistant. It discovers all matching entities, mirrors their state using the Supervisor WebSocket API, and offers control sliders with optional advanced automation (coming soon).

## Features

- Discovers every `number.luftator_*` entity automatically
- Streams live updates via Home Assistant WebSocket API
- Provides an ingress-enabled MUI dashboard for monitoring and control
- Proxies valve adjustments to Home Assistant using `number.set_value`

## Configuration

The add-on currently exposes only one option:

- `log_level` (`trace`, `debug`, `info`, `notice`, `warning`, `error`, `fatal`) – defaults to `info`

Future versions will add automation-specific options.

## Installation

1. Copy the `addon/` directory into your Home Assistant add-ons folder (e.g., `/addons/luftujha`).
2. From the Home Assistant UI, navigate to **Settings → Add-ons → Add-on Store** and use the three-dot menu to **Repositories**, then add the repository containing this add-on.
3. Locate "Luftujha" in the store, install it, and enable Ingress.
4. Start the add-on. On first launch it will index all `number.luftator_*` entities and begin streaming updates.

## Usage

Open the add-on via Ingress to access the dashboard. Valves appear as cards with sliders reflecting their current position. Adjusting a slider sends a `number.set_value` service call back to Home Assistant; the add-on will refresh immediately on WebSocket confirmation.

## Development Notes

- Backend located in `addon/rootfs/usr/src/app/app/`
- Frontend React app in `src/` (built during the add-on image build and served from `/usr/share/luftujha/www`)
- Add-on runtime entry point is `addon/rootfs/etc/services.d/luftujha/run`

Run `npm run dev` in the project root for frontend development and `uvicorn app.main:app --reload` within `addon/rootfs/usr/src/app` for backend iteration outside the Supervisor environment.

### Local Home Assistant Connectivity

When running the backend outside of the Supervisor, provide your Home Assistant endpoint and token via environment variables:

```
HA_BASE_URL=http://homeassistant.local:8123
HA_TOKEN=<long-lived-access-token>
STATIC_ROOT=<path-to-frontend-dist-optional>
uvicorn app.main:app --reload
```

- `HA_BASE_URL` defaults to `http://supervisor/core` inside the add-on. Override it to point at your development instance.
- `HA_TOKEN` must be a valid long-lived access token when the Supervisor token is not available.
- `STATIC_ROOT` can reference your local `dist/` folder if you want the backend to serve the React build.

For the React dev server, set `VITE_API_BASE_URL` (only respected in development builds) so API/WebSocket calls reach the locally running backend:

```
VITE_API_BASE_URL=http://localhost:8000/ npm run dev
```

With these variables in place you can iterate on the UI and backend while connected to your live Home Assistant instance.

### Python Environment Setup

Home Assistant base images ship with Python 3.12. To avoid compiling `pydantic-core` from source (which otherwise requires a Rust + MSVC toolchain), mirror that version locally:

1. Download and install **Python 3.12 (64-bit)** from [python.org](https://www.python.org/downloads/release/python-3128/). During the installer:
   - Enable **Add Python to PATH**.
   - Keep **pip** and the **py launcher** selected.
2. Verify the interpreter is available:
   ```powershell
   py -0
   ```
   You should see a `3.12` entry.
3. Create and activate a virtual environment inside `addon/rootfs/usr/src/app/`:
   ```powershell
   py -3.12 -m venv .venv
   .\.venv\Scripts\Activate.ps1
   ```
4. Upgrade pip and install dependencies:
   ```powershell
   pip install --upgrade pip
   pip install -r requirements.txt
   ```
5. Launch the backend using your `.env` configuration:
   ```powershell
   uvicorn app.main:app --reload
   ```
6. In a separate terminal (env activation optional), start the React dev server pointing at the backend:
   ```powershell
   VITE_API_BASE_URL=http://localhost:8000/ npm run dev
   ```

These steps keep the local environment aligned with the production add-on and prevent unexpected build toolchain requirements.
