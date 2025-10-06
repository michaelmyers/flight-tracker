# API Reference

Complete reference for Flight Tracker REST API and WebSocket endpoints.

## Base URL

```
http://localhost:4040
```

## REST API Endpoints

### Aircraft

#### Get Current Aircraft
```http
GET /api/aircraft?current=true
```

Returns all aircraft currently in tracked zones.

**Response:**
```json
[
  {
    "hex": "a126e7",
    "type": "B738",
    "altitude": 5000,
    "speed": 250,
    "track": 180,
    "lat": 38.8977,
    "lon": -77.0365,
    "manufacturer": "Boeing",
    "model": "737-800",
    "operator": "United Airlines",
    "registration": "N12345"
  }
]
```

### Zones

#### List All Zones
```http
GET /api/areas
```

Returns all defined tracking zones.

**Response:**
```json
[
  {
    "id": 1,
    "name": "DCA Airport",
    "polygon": [[lat,lon], ...],
    "min_altitude": 0,
    "max_altitude": 10000
  }
]
```

#### Get Single Zone
```http
GET /api/areas/:id
```

#### Update Zone
```http
PATCH /api/zones/:id
Content-Type: application/json

{
  "name": "Updated Name",
  "min_altitude": 500,
  "max_altitude": 15000
}
```

### Observations

#### Get Historical Observations
```http
GET /api/observations
```

**Query Parameters:**
- `since` - ISO 8601 date string (e.g., `2025-01-20T00:00:00Z`)
- `until` - ISO 8601 date string
- `areas` - Comma-separated area IDs (e.g., `1,2,3`)
- `type` - Aircraft type filter (e.g., `B737`)
- `limit` - Maximum results (default: 100)

**Response:**
```json
[
  {
    "icao24": "a126e7",
    "area_id": 1,
    "enteredAt": "2025-01-20T12:00:00Z",
    "exitedAt": "2025-01-20T12:15:00Z",
    "type": "B738",
    "altitude": 5000,
    "speed": 250,
    "manufacturer": "Boeing",
    "model": "737-800",
    "operator": "United Airlines"
  }
]
```

### Alerts

#### List All Alerts
```http
GET /api/alerts
```

**Response:**
```json
[
  {
    "id": 1,
    "name": "Airport Entry Alert",
    "zone_id": 1,
    "zone_name": "DCA Airport",
    "enabled": 1,
    "created_at": 1234567890000
  }
]
```

#### Get Alert Details
```http
GET /api/alerts/:id
```

Returns alert with subscribers and recent history.

**Response:**
```json
{
  "id": 1,
  "name": "Airport Entry Alert",
  "zone_id": 1,
  "enabled": 1,
  "subscribers": [
    {
      "id": 1,
      "type": "webhook",
      "endpoint": "https://example.com/webhook",
      "active": 1
    }
  ],
  "history": [
    {
      "aircraft_hex": "a126e7",
      "triggered_at": 1234567890000
    }
  ]
}
```

#### Create Alert
```http
POST /api/alerts
Content-Type: application/json

{
  "name": "New Alert",
  "zone_id": 1
}
```

#### Update Alert
```http
PATCH /api/alerts/:id
Content-Type: application/json

{
  "name": "Updated Name",
  "enabled": false
}
```

#### Delete Alert
```http
DELETE /api/alerts/:id
```

### Alert Subscribers

#### Add Subscriber
```http
POST /api/alerts/:alertId/subscribers
Content-Type: application/json

{
  "type": "webhook",
  "endpoint": "https://your-server.com/webhook"
}
```

**Subscriber Types:**
- `webhook` - HTTP POST endpoint
- `websocket` - Session ID for WebSocket
- `email` - Email address (planned)

#### Remove Subscriber
```http
DELETE /api/subscribers/:id
```

## WebSocket API

### Connection
```javascript
const ws = new WebSocket('ws://localhost:4040');
```

### Message Types

#### Aircraft Updates
Sent every 10 seconds with current aircraft positions.

```json
{
  "type": "AIRCRAFT_UPDATE",
  "data": [
    {
      "hex": "a126e7",
      "lat": 38.8977,
      "lon": -77.0365,
      "altitude": 5000,
      "track": 180
    }
  ]
}
```

#### Alert Notifications
Sent when aircraft triggers an alert (for WebSocket subscribers).

```json
{
  "type": "ALERT_NOTIFICATION",
  "sessionId": "1234",
  "payload": {
    "alert": {...},
    "aircraft": {...},
    "zone": {...},
    "triggered_at": "2025-01-20T12:00:00Z"
  }
}
```

#### External Control Messages

##### Controller Registration
```json
{
  "type": "CONTROLLER_REGISTER",
  "sessionId": "1234"
}
```

##### Viewer Registration
```json
{
  "type": "VIEWER_REGISTER",
  "sessionId": "1234",
  "currentState": {
    "mode": "radar",
    "range": 10,
    "zonesEnabled": true
  }
}
```

##### Control Commands
```json
{
  "type": "CONTROL",
  "sessionId": "1234",
  "control": "MODE",
  "value": "next"
}
```

Control types:
- `MODE` - Switch between zones and radar (`next`/`previous`)
- `RANGE` - Change time/distance range (`increase`/`decrease`)
- `ZONES` - Toggle zone display (`toggle`)
- `SELECT` - Cycle through aircraft (`next`/`previous`)

##### State Updates
```json
{
  "type": "STATE_UPDATE",
  "state": {
    "mode": "area",
    "areaId": 1,
    "range": 4,
    "zonesEnabled": true,
    "selectedAircraft": "a126e7"
  }
}
```

## Authentication

Currently no authentication is required. In production, consider:
- API key authentication
- JWT tokens
- OAuth 2.0
- IP whitelisting

## Rate Limiting

No rate limiting is currently implemented. For production:
- Webhook calls: Consider 10 requests/minute per endpoint
- API calls: Consider 100 requests/minute per IP
- WebSocket: One connection per session

## Error Responses

### 400 Bad Request
```json
{
  "error": "Invalid parameters"
}
```

### 404 Not Found
```json
{
  "error": "Resource not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal Server Error"
}
```

## CORS

CORS headers are not currently set. For production, configure appropriate origins:
```javascript
app.use(cors({
  origin: ['https://your-domain.com'],
  credentials: true
}));
```

## Webhooks

### Webhook Requirements
- Must respond within 5 seconds
- Should return 2xx status code
- Must accept POST with JSON body
- Should handle retries gracefully

### Webhook Headers
```http
Content-Type: application/json
User-Agent: FlightTracker-AlertSystem/1.0
```

### Webhook Payload
See [Alert Payload Structure](./ALERTS.md#alert-payload-structure)

## Examples

### cURL

Get current aircraft:
```bash
curl http://localhost:4040/api/aircraft?current=true
```

Create alert with webhook:
```bash
curl -X POST http://localhost:4040/api/alerts \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Low Altitude Alert",
    "zone_id": 1
  }'

curl -X POST http://localhost:4040/api/alerts/1/subscribers \
  -H "Content-Type: application/json" \
  -d '{
    "type": "webhook",
    "endpoint": "https://webhook.site/unique-id"
  }'
```

### JavaScript/Node.js

```javascript
// Fetch current aircraft
const response = await fetch('http://localhost:4040/api/aircraft?current=true');
const aircraft = await response.json();

// WebSocket connection
const ws = new WebSocket('ws://localhost:4040');

ws.on('open', () => {
  // Register as controller
  ws.send(JSON.stringify({
    type: 'CONTROLLER_REGISTER',
    sessionId: '1234'
  }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data);
  console.log('Received:', message);
});
```

### Python

```python
import requests
import websocket
import json

# REST API
response = requests.get('http://localhost:4040/api/areas')
zones = response.json()

# WebSocket
ws = websocket.WebSocket()
ws.connect('ws://localhost:4040')

# Register viewer
ws.send(json.dumps({
    'type': 'VIEWER_REGISTER',
    'sessionId': '1234',
    'currentState': {
        'mode': 'radar',
        'range': 10
    }
}))

# Receive messages
result = ws.recv()
data = json.loads(result)
```

## Related Documentation

- [Alert System Overview](./ALERTS.md)
- [Control API](./CONTROL_API.md)
- [Alert Subscriptions](./ALERT_SUBSCRIPTIONS.md)