# Alert System Overview

The Flight Tracker alert system provides real-time notifications when aircraft enter monitored zones, with support for multiple notification methods and flexible configuration options.

## How Alerts Work

1. **Zone Monitoring** - The observer service continuously tracks aircraft positions
2. **Entry Detection** - When an aircraft enters a zone (and meets altitude criteria), the alert engine is triggered
3. **Alert Evaluation** - The system checks if any active alerts are configured for that zone
4. **Notification Dispatch** - All subscribers for matching alerts receive notifications
5. **History Logging** - The alert trigger is logged for auditing and analysis

## Alert Components

### Alerts
An alert is a configuration that links a zone to a set of subscribers:
- **Name** - Descriptive name for the alert
- **Zone** - The geographic area being monitored
- **Enabled** - Whether the alert is currently active
- **Subscribers** - List of notification endpoints

### Zones
Zones define the geographic boundaries and altitude filters:
- **Polygon** - Geographic boundary (GeoJSON format)
- **Min Altitude** - Aircraft below this are ignored (optional)
- **Max Altitude** - Aircraft above this are ignored (optional)

### Subscribers
Multiple notification methods per alert:
- **Webhook** - HTTP POST to your server
- **WebSocket** - Real-time push to connected clients
- **Email** - Email notifications (planned)

## Alert Triggers

Alerts are triggered when:
1. Aircraft enters a zone's geographic boundary
2. Aircraft altitude is within zone's min/max limits (if set)
3. Alert is enabled
4. Aircraft was not already in the zone

Alerts are NOT triggered when:
- Aircraft exits a zone (exit events are logged but don't trigger alerts)
- Aircraft is already being tracked in the zone
- Alert is disabled
- Aircraft altitude is outside zone limits

## Alert Payload Structure

```json
{
  "alert": {
    "id": 1,
    "name": "Airport Approach Alert",
    "zone_id": 3
  },
  "aircraft": {
    "hex": "a126e7",           // ICAO24 identifier
    "type": "B738",             // Aircraft type code
    "callsign": "UAL123",       // Flight callsign
    "altitude": 5000,           // Current altitude in feet
    "speed": 250,               // Ground speed in knots
    "track": 180,               // Heading in degrees
    "manufacturer": "Boeing",    // From OpenSky Network
    "model": "737-800",         // Aircraft model
    "operator": "United Airlines", // Airline/operator
    "registration": "N12345"    // Tail number
  },
  "zone": {
    "id": 3,
    "name": "DCA Airport"
  },
  "triggered_at": "2025-01-20T20:30:00.000Z"
}
```

## Alert Engine Architecture

```
Observer Service
    ↓
Aircraft Entry Detected
    ↓
Alert Engine (checkAircraftEntry)
    ↓
Query Active Alerts for Zone
    ↓
For Each Alert:
    ├── Check if Enabled
    ├── Get Subscribers
    └── Send Notifications
        ├── Webhook (5s timeout)
        ├── WebSocket (instant)
        └── Email (future)
```

## Performance Considerations

- **Deduplication** - Same aircraft entering zone won't retrigger until it exits and re-enters
- **Timeout Protection** - Webhook calls timeout after 5 seconds to prevent blocking
- **Concurrent Dispatch** - Notifications sent in parallel, not sequentially
- **Error Isolation** - Failed notifications don't affect other subscribers

## Database Schema

```sql
-- Alert configuration
CREATE TABLE alerts (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  zone_id INTEGER NOT NULL,
  enabled INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(zone_id) REFERENCES areas(id)
);

-- Notification endpoints
CREATE TABLE alert_subscribers (
  id INTEGER PRIMARY KEY,
  alert_id INTEGER NOT NULL,
  type TEXT CHECK(type IN ('webhook', 'email', 'websocket')),
  endpoint TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(alert_id) REFERENCES alerts(id)
);

-- Alert trigger history
CREATE TABLE alert_history (
  id INTEGER PRIMARY KEY,
  alert_id INTEGER NOT NULL,
  aircraft_hex TEXT NOT NULL,
  triggered_at INTEGER NOT NULL,
  payload TEXT,
  FOREIGN KEY(alert_id) REFERENCES alerts(id)
);
```

## Best Practices

1. **Zone Design**
   - Keep zones focused and specific
   - Use altitude filters for airport zones
   - Test zones with historical data first

2. **Alert Naming**
   - Use descriptive names indicating purpose
   - Include zone name for clarity
   - Consider naming convention for multiple alerts

3. **Webhook Security**
   - Use HTTPS in production
   - Implement authentication tokens
   - Validate payload signatures
   - Rate limit incoming alerts

4. **Performance**
   - Limit subscribers per alert
   - Monitor webhook response times
   - Use WebSocket for real-time needs
   - Batch process historical data

## Troubleshooting

See [Alert Quick Start](./ALERT_QUICK_START.md#troubleshooting) for common issues and solutions.
