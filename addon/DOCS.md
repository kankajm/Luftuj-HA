# Luftator Home Assistant Add-on

The Luftator add-on, built by **Luftuj**, provides a real-time dashboard for valves exposed as `number.luftator_*` entities in Home Assistant. A single Home Assistant environment can control multiple Luftator hardware controllers at once. The add-on discovers all matching entities, mirrors their state using the Supervisor WebSocket API, and offers control sliders with optional advanced automation (coming soon).

## Features

- Discovers every `number.luftator_*` entity automatically
- Streams live updates via Home Assistant WebSocket API
- Provides an ingress-enabled MUI dashboard for monitoring and control
- Proxies valve adjustments to Home Assistant using `number.set_value`

## Configuration

The add-on currently exposes the following options:

- `log_level` (`trace`, `debug`, `info`, `notice`, `warning`, `error`, `fatal`) – defaults to `info`
- `web_port` (1024-65535) - Internal port for the web server, defaults to 8099.

### MQTT Configuration (Optional)

To enable HRU sensor integration into Home Assistant via MQTT Discovery:

- `mqtt_host`: Hostname or IP of the MQTT broker (e.g., `core-mosquitto` or `192.168.1.50`). Leave empty to disable MQTT.
- `mqtt_port`: MQTT broker port (default `1883`).
- `mqtt_user`: MQTT username (optional).
- `mqtt_password`: MQTT password (optional).

When configured, the add-on will publish sensors for:

- Requested Power (%)
- Requested Temperature (°C)
- Mode

Future versions will add automation-specific options.

## Installation

1. Copy the `addon/` directory into your Home Assistant add-ons folder (e.g., `/addons/luftujha`).
2. From the Home Assistant UI, navigate to **Settings → Add-ons → Add-on Store** and use the three-dot menu to **Repositories**, then add the repository containing this add-on.
3. Locate "Luftujha" in the store, install it, and enable Ingress.
4. Start the add-on. On first launch it will index all `number.luftator_*` entities and begin streaming updates.

## Usage

Open the add-on via Ingress to access the dashboard. Valves appear as cards with sliders reflecting their current position. Adjusting a slider sends a `number.set_value` service call back to Home Assistant; the add-on will refresh immediately on WebSocket confirmation.

- **Settings → Database tools**: Export the current SQLite database (`luftator.db`) for backup or import a previously exported file when migrating Home Assistant. Imports replace the active DB after creating a timestamped backup.

## Development Notes

- Backend located in `addon/rootfs/usr/src/app/src/` (Bun + Express)
- Frontend React app in `src/` (built during the add-on image build and served from `/usr/share/luftujha/www`)
- Add-on runtime entry point is `addon/rootfs/etc/services.d/luftujha/run`
- Persistent storage uses SQLite (`bun:sqlite`). The database file defaults to `/data/luftator.db` inside Home Assistant; local development falls back to `addon/rootfs/data/luftator.db` unless `LUFTATOR_DB_PATH` is provided. Schema migrations run automatically at startup and are tracked in the `migrations` table.

### Local Backend Development (Bun)

From `addon/rootfs/usr/src/app/` install dependencies and launch the backend:

```bash
bun install
bun run dev
```

Environment variables mirror Supervisor options. Common overrides while developing outside Home Assistant:

```bash
HA_BASE_URL=http://homeassistant.local:8123 \
HA_TOKEN=<long-lived-access-token> \
STATIC_ROOT=/absolute/path/to/dist \
PORT=8000 \
bun run dev
```

If no token is provided the backend runs in offline mode and skips Home Assistant calls.

### Frontend Development

Run the React dev server from the repository root and point it at the Bun backend:

```bash
VITE_API_BASE_URL=http://localhost:8000/ npm run dev
```

### Building for the Add-on

The production image installs Bun inside the container (`addon/Dockerfile`) and executes `bun run src/server.ts` via `addon/rootfs/etc/services.d/luftujha/run`. Ensure the frontend build assets are synced into `addon/rootfs/usr/share/luftujha/www/` before publishing.
