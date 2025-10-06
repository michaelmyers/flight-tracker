# Flight Tracker

A real-time aircraft monitoring system that tracks flights entering and exiting user-defined geographic zones using ADS-B data from PiAware/dump1090.

## 🎯 Overview

Flight Tracker connects to your local PiAware/dump1090 receiver to monitor aircraft movements within custom-defined geographic areas. It provides real-time alerts, historical tracking, and a web-based interface for visualizing aircraft activity. Perfect for aviation enthusiasts, researchers, or anyone interested in monitoring air traffic in specific areas.

## ✨ Features

- **Real-time Aircraft Tracking**: Monitor aircraft entering/exiting custom zones
- **Custom Geographic Zones**: Define polygons for any area (airports, neighborhoods, facilities)
- **Live Radar View**: Visual representation of aircraft positions with range rings
- **Historical Data**: Query past observations with time-based filtering
- **Alert System**: Configurable alerts for specific aircraft types or zones
- **REST API**: Full-featured API for data access and integration
- **Web Interface**: Multiple views including radar, zone statistics, and aircraft lists
- **External Control**: Remote control capability for kiosk/display setups
- **Aircraft Enrichment**: Automatic lookup of aircraft metadata (manufacturer, model, operator)

## 📋 Prerequisites

- Node.js 18+ and npm/yarn
- A PiAware/dump1090 receiver accessible on your network
- SQLite3 (installed automatically via npm)

## 🚀 Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/michaelmyers/flight-tracker.git
cd flight-tracker

# Install dependencies
npm install

# Copy and configure environment file
cp .env.example .env
# Edit .env with your PiAware URL and antenna coordinates
```

### Configuration

Edit `.env` file:

```env
PIAWARE_URL=http://your-piaware-host:8080/data/aircraft.json
POLL_MS=10000  # Poll interval in milliseconds
PORT=4040      # Web server port
DB_PATH=data/tracker.db
ANTENNA_LAT=38.8977  # Your antenna latitude
ANTENNA_LON=-77.0365  # Your antenna longitude
```

### Running

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm run build
npm start
```

Visit `http://localhost:4040` to access the web interface.

## 🗺️ Creating and Adding Monitoring Areas

### Step 1: Create a Polygon Using GeoJSON.io

1. Go to [geojson.io](http://geojson.io)
2. Use the polygon drawing tool (pentagon icon) in the toolbar
3. Click on the map to create points for your area boundary
4. Close the polygon by clicking on the first point
5. The GeoJSON will automatically appear in the right panel
6. Copy the entire GeoJSON object

### Step 2: Format for the API

The API expects a GeoJSON FeatureCollection with a name. Here's the format:

```json
{
  "name": "Your Area Name",
  "type": "FeatureCollection",
  "features": [
    // Paste the feature array from geojson.io here
  ]
}
```

### Step 3: Add via Postman

1. Open Postman
2. Create a new POST request
3. Set URL: `http://your-server:3000/api/areas`
4. Set Headers:
   - `Content-Type: application/json`
5. In Body tab:
   - Select "raw"
   - Select "JSON" format
   - Paste your formatted GeoJSON
6. Send the request

### Example Areas

**DCA (with Approach)**

```json
{
  "name": "DCA",
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {},
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [-77.06259109279213, 38.90380997826247],
            [-77.07223483746209, 38.90023414517455],
            [-77.06381882934014, 38.88462655524745],
            [-77.04605921260514, 38.86626966161015],
            [-77.04590589490489, 38.83848449938833],
            [-77.0423828388593, 38.81248172175498],
            [-77.02584638370058, 38.81104062280383],
            [-77.02201806272798, 38.84253901934588],
            [-77.0238555345055, 38.85851898660829],
            [-77.03932328129218, 38.881888919955486],
            [-77.06259109279213, 38.90380997826247]
          ]
        ]
      }
    }
  ]
}
```

**ADW - Joint Base Andrews**

```json
{
  "name": "ADW",
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {},
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [-76.88203562386761, 38.86103252007746],
            [-76.88486849484413, 38.76246602944994],
            [-76.84633325861905, 38.76199232255789],
            [-76.84465926248949, 38.86101920711235],
            [-76.88203562386761, 38.86103252007746]
          ]
        ]
      }
    }
  ]
}
```

**Washington Hospital Complex:**

```json
{
  "name": "Washington Hospital Complex",
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {},
      "geometry": {
        "coordinates": [
          [
            [-77.01724937470199, 38.9314792065654],
            [-77.01724937470199, 38.9261429558386],
            [-77.00762354019557, 38.9261429558386],
            [-77.00762354019557, 38.9314792065654],
            [-77.01724937470199, 38.9314792065654]
          ]
        ],
        "type": "Polygon"
      }
    }
  ]
}
```

### Viewing Areas

- **Web Interface**: `http://your-server:4040/`
- **API Endpoint**: `http://your-server:4040/api/areas`

### Tips for Creating Areas

1. **Precision**: Draw polygons with enough points to accurately represent the area
2. **Closure**: Always close the polygon by clicking the first point again
3. **Naming**: Use descriptive names that clearly identify the monitoring zone
4. **Size**: Keep areas reasonably sized - very large areas may capture too many aircraft
5. **Testing**: After adding an area, check the web interface to confirm it appears correctly

## 🖥️ Production Deployment

### Option 1: Systemd Service (Recommended for Linux)

Create a systemd service file for automatic startup and management:

1. Build the application:
```bash
npm run build
```

2. Create the service file:
```bash
sudo nano /etc/systemd/system/flight-tracker.service
```

3. Add the following content (adjust paths as needed):
```ini
[Unit]
Description=Flight Tracker - Aircraft Monitoring System
After=network.target

[Service]
Type=simple
User=YOUR_USERNAME
WorkingDirectory=/home/YOUR_USERNAME/flight-tracker
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10

# Logging
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

4. Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable flight-tracker.service
sudo systemctl start flight-tracker.service
```

5. Check status:
```bash
sudo systemctl status flight-tracker.service
```

6. View logs:
```bash
journalctl -u flight-tracker.service -f
```

### Option 2: PM2 Process Manager

PM2 provides automatic restarts, log management, and clustering:

1. Install PM2 globally:
```bash
npm install -g pm2
```

2. Start the application:
```bash
pm2 start dist/index.js --name flight-tracker
```

3. Save PM2 configuration:
```bash
pm2 save
pm2 startup  # Follow the instructions to enable startup on boot
```

4. Useful PM2 commands:
```bash
pm2 status          # Check status
pm2 logs            # View logs
pm2 restart flight-tracker  # Restart
pm2 stop flight-tracker     # Stop
```

### Option 3: Docker (Coming Soon)

Docker support is planned for future releases.

### Network & Firewall Configuration

For homelab/local network access:

1. **Firewall Rules** - Open port 4040 (or your configured PORT):
```bash
# UFW (Ubuntu/Debian)
sudo ufw allow 4040/tcp

# Firewalld (RHEL/CentOS)
sudo firewall-cmd --permanent --add-port=4040/tcp
sudo firewall-cmd --reload
```

2. **Reverse Proxy** (Optional) - Use nginx for SSL and better URLs:
```nginx
server {
    listen 80;
    server_name flight-tracker.local;

    location / {
        proxy_pass http://localhost:4040;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

3. **Access from other devices** - Use your server's IP:
```
http://192.168.1.100:4040  # Replace with your server's IP
```

## 🏗️ Architecture

### Components

- **Observer Service**: Polls PiAware data and tracks aircraft movements
- **Database**: SQLite with automatic migrations and cleanup
- **REST API**: Express-based API for data access
- **Web Interface**: EJS templates with real-time updates via WebSocket
- **Alert Engine**: Configurable alerts with webhook support

### Data Flow

1. PiAware/dump1090 broadcasts ADS-B data
2. Observer polls aircraft.json at configured intervals
3. Geographic calculations determine zone entry/exit
4. Events stored in SQLite database
5. API serves data to web interface and external consumers

## 📡 API Endpoints

Key endpoints:

- `GET /api/areas` - List all monitoring zones
- `POST /api/areas` - Create new zone
- `GET /api/observations` - Query aircraft observations
- `GET /api/aircraft/:icao` - Get specific aircraft info
- `GET /api/stats` - Zone statistics

See [API Reference](docs/API_REFERENCE.md) for complete documentation.

## 🎮 External Control

Flight Tracker supports remote control for kiosk/display setups:

```
http://localhost:4040/1234/radar    # Controlled radar view
http://localhost:4040/1234/controls  # Control panel
```

See [External Control Guide](docs/EXTERNAL_CONTROL.md) for details.

## 🔧 Hardware Integration

Trigger physical alerts (lights, buzzers) when aircraft enter zones. Sample implementations for:

- Raspberry Pi GPIO
- Arduino with WiFi
- ESP32

See [Hardware Integration](docs/HARDWARE_INTEGRATION.md) for wiring and code examples.

## 📚 Documentation

- [API Reference](docs/API_REFERENCE.md) - Complete API documentation
- [Alert System](docs/ALERTS.md) - Setting up alerts and webhooks
- [External Control](docs/EXTERNAL_CONTROL.md) - Remote control setup
- [Hardware Integration](docs/HARDWARE_INTEGRATION.md) - Physical alert systems
- [Deployment Guide](docs/DEPLOYMENT.md) - Production deployment

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📝 License

This project is open source and available under the [MIT License](LICENSE).

## 🙏 Acknowledgments

- Built on top of [PiAware](https://flightaware.com/adsb/piaware/) and dump1090
- Aircraft metadata from [OpenSky Network](https://opensky-network.org/)
- Geographic calculations using point-in-polygon algorithms
