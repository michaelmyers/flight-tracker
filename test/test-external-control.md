# External Control Test Guide

## Testing the External Control Features

### 1. Start the Application
```bash
npm run dev
```

### 2. Create a Control Session

Open a browser and navigate to one of these URLs:
- `http://localhost:3000/1234/radar` - Opens radar view with session ID 1234
- `http://localhost:3000/1234/area` - Opens area view with session ID 1234
- `http://localhost:3000/1234/controls` - Opens control panel for session ID 1234

You can use any 4-digit number as the session ID.

### 3. Test the Control Flow

1. Open the control panel: `http://localhost:3000/1234/controls`
2. In a separate tab/window, open the radar view: `http://localhost:3000/1234/radar`
3. In another tab/window, open the area view: `http://localhost:3000/1234/area`

### 4. Test Control Functions

From the control panel, test:

#### MODE Control
- Click "NEXT" and "PREV" buttons to cycle through radar and all defined zones
- The viewer tabs should automatically switch between radar and area views

#### RANGE Control
- In radar mode: Adjusts the mile range (5, 10, 15, 25, 50, 100)
- In zone mode: Adjusts the time range in hours (1, 4, 12, 24)
- Click "INCREASE" and "DECREASE" to change values

#### ZONES Toggle
- Only works when in radar mode
- Toggles the display of zone overlays on the radar

### 5. WebSocket Connection
- The control panel shows a connection indicator
- Controlled views show "EXTERNAL CONTROL ACTIVE" when a controller is connected
- Navigation buttons disappear from controlled views when a controller is active

### 6. Session Persistence
- Sessions persist for 30 minutes of inactivity
- Multiple controllers and viewers can connect to the same session
- The session ID appears in the top-right of controlled views

## API Endpoints

- `GET /:sessionId/radar` - Controlled radar view
- `GET /:sessionId/area` - Controlled area view
- `GET /:sessionId/controls` - Control panel interface

## WebSocket Messages

### Control Messages (sent by controller):
```json
{ "type": "MODE", "sessionId": "1234", "direction": "forward" }
{ "type": "RANGE", "sessionId": "1234", "direction": "backward" }
{ "type": "ZONES", "sessionId": "1234" }
```

### Registration Messages:
```json
{ "type": "REGISTER_VIEWER", "sessionId": "1234" }
{ "type": "REGISTER_CONTROLLER", "sessionId": "1234" }
```

### State Updates (sent by server):
```json
{
  "type": "STATE_UPDATE",
  "sessionId": "1234",
  "state": {
    "mode": "radar",
    "range": 10,
    "zonesEnabled": false
  }
}
```

## Hardware Integration

For ESP32 or other hardware controllers:
1. Connect to the WebSocket endpoint
2. Send `REGISTER_CONTROLLER` message with session ID
3. Send control messages based on hardware inputs (rotary encoders, switches)
4. The hardware can interpret the STATE_UPDATE messages to show current state on displays

## Notes

- The system supports multiple simultaneous sessions
- Sessions are cleaned up after 30 minutes of inactivity
- WebSocket reconnection is automatic on disconnect
- Views automatically redirect when mode changes between radar and zones