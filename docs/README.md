# Flight Tracker Documentation

Welcome to the Flight Tracker documentation. This system monitors aircraft within defined geographic areas using PiAware dump1090 data feeds.

## Quick Start Guides

- [Alert Quick Start](./ALERT_QUICK_START.md) - Get alerts running in 5 minutes
- [External Control Setup](./EXTERNAL_CONTROL.md) - Set up remote control capabilities

## Core Features

### Alert System
- [Alert Subscriptions](./ALERT_SUBSCRIPTIONS.md) - Complete guide to webhook, WebSocket, and email notifications
- [Alert System Overview](./ALERTS.md) - Technical overview of the alert engine

### External Control
- [Control API Reference](./CONTROL_API.md) - WebSocket API for remote control
- [ESP32 Implementation](./ESP32_IMPLEMENTATION.md) - Hardware controller with rotary encoder

## Integration Guides

### Home Automation
- [Home Assistant Integration](./HOME_ASSISTANT_INTEGRATION.md) - Connect to Home Assistant for automation

### Hardware Projects
- [Hardware Integration](./HARDWARE_INTEGRATION.md) - Build physical alert indicators with LEDs, buzzers, and displays

## System Overview

### Architecture
The Flight Tracker consists of three main components:

1. **Observer Service** - Polls PiAware data and tracks aircraft
2. **REST API** - Provides endpoints for data access
3. **Web Interface** - Real-time display and control

### Key Features
- Real-time aircraft tracking within polygon zones
- Altitude-based filtering for airport monitoring
- WebSocket-based external control system
- Multi-channel alert notifications
- Hardware integration support

### Data Flow
```
PiAware → Observer → Database → API/WebSocket → Clients
                 ↓
           Alert Engine → Webhooks/WebSocket/Email
```

## API Endpoints

### REST API
- `GET /api/aircraft` - Current aircraft positions
- `GET /api/areas` - Defined tracking zones
- `GET /api/alerts` - Alert configurations
- `GET /api/observations` - Historical data

### WebSocket
- `ws://localhost:4040` - Real-time updates and control

## Configuration

### Environment Variables
```bash
PIAWARE_URL=http://piaware.local/dump1090-fa/data/aircraft.json
POLL_MS=10000
DB_PATH=data/tracker.db
PORT=4040
```

### Database Schema
- `areas` - Geographic polygon definitions
- `observations` - Aircraft entry/exit events
- `aircraft_info` - Enriched metadata
- `alerts` - Alert configurations
- `alert_subscribers` - Notification endpoints
- `alert_history` - Triggered alert log

## Deployment

### Systemd Service
```bash
sudo systemctl start flight-tracker
sudo systemctl enable flight-tracker
journalctl -u flight-tracker -f
```

### Docker
```bash
docker build -t flight-tracker .
docker run -p 4040:4040 flight-tracker
```

## Development

### Setup
```bash
npm install
npm run dev  # Development with auto-reload
```

### Testing
```bash
npm test     # Run tests
npm run lint # Check code style
```

### Building
```bash
npm run build # Compile TypeScript
npm start     # Run production
```

## Troubleshooting

### Common Issues

**No aircraft showing**
- Verify PiAware URL is accessible
- Check zones have appropriate altitude limits
- Ensure observer service is running

**Alerts not triggering**
- Confirm alert is enabled
- Check zone altitude configuration
- Verify subscribers are configured

**WebSocket connection issues**
- Check firewall allows port 4040
- Verify WebSocket upgrade headers
- Review proxy configuration if using reverse proxy

## Support

For issues, feature requests, or questions:
- GitHub Issues: [Report a problem](https://github.com/your-repo/issues)
- Documentation: You're reading it!

## License

[Your License Here]