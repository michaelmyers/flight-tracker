# External Control API Documentation

## Overview

The Flight Tracker External Control system allows remote control of viewer displays through WebSocket connections. Controllers can manipulate viewer displays by sending control messages that change modes, ranges, and other display parameters.

## Architecture

```
┌─────────────┐         WebSocket          ┌──────────────┐
│  Controller ├──────────────────────────►  │    Server    │
│   (ESP32)   │                             │              │
└─────────────┘                             └──────┬───────┘
                                                   │
                                           State Updates
                                                   │
                                            ┌──────▼───────┐
                                            │    Viewers   │
                                            │  (Browsers)  │
                                            └──────────────┘
```

## Session Management

### Session Structure

- **Session ID**: 4-digit numeric string (e.g., "1234", "0001")
- **Session State**: Persistent state shared across all viewers in a session
- **Cleanup**: Sessions auto-cleanup after 1 hour of inactivity

### Creating Sessions

Sessions are automatically created when accessing controlled routes:

- `GET /:sessionId/radar` - Creates session and opens radar view
- `GET /:sessionId/area` - Creates session and opens area/zone view
- `GET /:sessionId/controls` - Creates session and opens control panel

## WebSocket Connection

### Endpoint

```
ws://[host]:[port]/
wss://[host]:[port]/ (for SSL)
```

### Connection Flow

1. Connect to WebSocket endpoint
2. Send registration message (REGISTER_CONTROLLER or REGISTER_VIEWER)
3. Receive initial state
4. Send/receive control messages

## Message Formats

All messages are JSON-encoded with a `type` field indicating the message type.

### Registration Messages

#### REGISTER_CONTROLLER

Registers a client as a controller that can send control commands.

**Request:**

```json
{
  "type": "REGISTER_CONTROLLER",
  "sessionId": "1234"
}
```

**Response:** Initial STATE_UPDATE message (see below)

#### REGISTER_VIEWER

Registers a client as a viewer that receives state updates.

**Request:**

```json
{
  "type": "REGISTER_VIEWER",
  "sessionId": "1234",
  "currentView": {
    "mode": "radar",
    "range": 10
  }
}
```

**Fields:**

- `currentView` (optional): Current state of the viewer to sync with server

**Response:** Initial STATE_UPDATE message

### Control Messages

#### MODE

Changes the display mode (cycles through radar and zones).

**Request:**

```json
{
  "type": "MODE",
  "sessionId": "1234",
  "direction": "forward"
}
```

**Fields:**

- `direction`: "forward" | "backward"
- Forward cycles: radar → zone_1 → zone_2 → ... → zone_n → radar
- Backward cycles in reverse

**Triggers:** STATE_UPDATE broadcast to all viewers

#### RANGE

Adjusts the range/time window of the current display.

**Request:**

```json
{
  "type": "RANGE",
  "sessionId": "1234",
  "direction": "forward"
}
```

**Fields:**

- `direction`: "forward" | "backward"

**Range Values:**

- Radar mode: [5, 10, 15, 25, 50, 100] miles
- Zone mode: [1, 4, 12, 24] hours

**Triggers:** STATE_UPDATE broadcast to all viewers

#### ZONES

Toggles zone overlay display in radar mode.

**Request:**

```json
{
  "type": "ZONES",
  "sessionId": "1234"
}
```

**Note:** Only works in radar mode; ignored in zone views

**Triggers:** STATE_UPDATE broadcast to all viewers

#### SELECT

Cycles through aircraft selection in radar mode.

**Request:**

```json
{
  "type": "SELECT",
  "sessionId": "1234",
  "direction": "forward"
}
```

**Fields:**

- `direction`: "forward" | "backward"
- Forward: selects next aircraft in sidebar list
- Backward: selects previous aircraft in sidebar list

**Note:** Only works in radar mode

**Triggers:** SELECT_AIRCRAFT message to viewers (not STATE_UPDATE)

### State Messages

#### STATE_UPDATE

Broadcast to all viewers when state changes.

**Message:**

```json
{
  "type": "STATE_UPDATE",
  "sessionId": "1234",
  "state": {
    "mode": "zone_1",
    "range": 10,
    "zonesEnabled": false
  }
}
```

**State Fields:**

- `mode`: Current display mode
  - `"radar"`: Radar view
  - `"zone_1"`, `"zone_2"`, etc.: Zone views (number is zone ID)
- `range`: Current range setting
  - In radar mode: miles (5-100)
  - In zone mode: hours (1-24)
- `zonesEnabled`: Whether zones overlay is shookwn (radar mode only)

#### SELECT_AIRCRAFT

Sent to viewers to change aircraft selection.

**Message:**

```json
{
  "type": "SELECT_AIRCRAFT",
  "direction": "forward"
}
```

**Fields:**

- `direction`: "forward" | "backward"

### Information Messages

#### STATE_REQUEST

Request current state from server.

**Request:**

```json
{
  "type": "STATE_REQUEST",
  "sessionId": "1234"
}
```

**Response:** STATE_UPDATE message with current state

## HTTP Endpoints

### View Endpoints

- `GET /:sessionId/radar` - Controlled radar view
- `GET /:sessionId/area` - Controlled area/zone view
- `GET /:sessionId/controls` - Web-based control panel

### API Endpoints

These endpoints support the zone management:

#### Get All Zones

```
GET /api/zones
```

**Response:**

```json
[
  {
    "id": 1,
    "name": "Zone Name",
    "polygon": "[[lat1,lon1],[lat2,lon2],...]",
    "min_altitude": 0,
    "max_altitude": 10000
  }
]
```

#### Get Zone Details

```
GET /api/zones/:id
```

#### Get Zone Statistics

```
GET /api/zones/:id/stats
```

**Response:**

```json
{
  "currentAircraft": 3,
  "todayTotal": 42,
  "avgAltitude": 5500,
  "lastSeen": 1234567890000
}
```

#### Update Zone

```
PATCH /api/zones/:id
Content-Type: application/json
```

**Request Body:**

```json
{
  "name": "New Name",
  "min_altitude": 0,
  "max_altitude": 15000,
  "polygon": "[[lat1,lon1],[lat2,lon2],...]"
}
```

## Client Implementation Notes

### Viewer Behavior

1. On connection, send REGISTER_VIEWER with current state
2. Listen for STATE_UPDATE messages
3. Update display based on new state
4. Handle SELECT_AIRCRAFT messages for selection changes
5. Use channel change animations for smoother transitions

### Controller Behavior

1. On connection, send REGISTER_CONTROLLER
2. Send control messages based on user input
3. Optionally listen for STATE_UPDATE to show current state
4. Handle reconnection on disconnect

### Reconnection Strategy

```javascript
function connectWebSocket() {
  ws = new WebSocket(wsUrl);

  ws.onclose = () => {
    // Reconnect after 3 seconds
    setTimeout(connectWebSocket, 3000);
  };

  ws.onopen = () => {
    // Re-register
    ws.send(
      JSON.stringify({
        type: "REGISTER_CONTROLLER",
        sessionId: sessionId,
      })
    );
  };
}
```

## Error Handling

### Common Errors

- Session not found: Create session first via HTTP endpoint
- Invalid message format: Check JSON syntax
- Unknown message type: Verify type field matches documentation
- WebSocket connection lost: Implement reconnection logic

### Debugging

Enable console logging to see:

- Registration confirmations
- State updates
- Control message acknowledgments
- Connection status changes

## Example: Complete Control Flow

1. **Controller connects and registers:**

```json
→ {"type":"REGISTER_CONTROLLER","sessionId":"1234"}
← {"type":"STATE_UPDATE","sessionId":"1234","state":{"mode":"radar","range":10,"zonesEnabled":false}}
```

2. **User rotates MODE encoder forward:**

```json
→ {"type":"MODE","sessionId":"1234","direction":"forward"}
```

3. **Server broadcasts to all viewers:**

```json
← {"type":"STATE_UPDATE","sessionId":"1234","state":{"mode":"zone_1","range":1,"zonesEnabled":false}}
```

4. **Viewers update their display to show zone_1 with 1-hour range**

5. **User adjusts RANGE:**

```json
→ {"type":"RANGE","sessionId":"1234","direction":"forward"}
← {"type":"STATE_UPDATE","sessionId":"1234","state":{"mode":"zone_1","range":4,"zonesEnabled":false}}
```

## Security Considerations

- Session IDs should be treated as access tokens
- Consider implementing authentication for production use
- WebSocket connections should use WSS (TLS) in production
- Implement rate limiting to prevent abuse
- Validate all input data before processing
