# Debugging External Control

## Testing Steps

### 1. Start the application
```bash
npm run dev
```

### 2. Use the Debug Tool
Open: `http://localhost:3000/debug/control`

This debug page lets you:
- Connect as a viewer or controller
- Send control messages manually
- See all WebSocket messages in real-time

### 3. Test Flow

1. Open the debug tool in one tab
2. Enter session ID "4444"
3. Click "Connect as Controller"
4. Open `http://localhost:3000/4444/radar` in another tab
5. Check browser console in the radar tab - you should see:
   - "External control client initializing..."
   - "Connecting to WebSocket..."
   - "External control WebSocket connected"

6. In the debug tool, click control buttons (MODE Forward, RANGE Increase, etc.)
7. Watch the log to see messages being sent and received

### 4. Check Server Logs
The server console will show:
- "Handling control message: [TYPE] for session: [ID]"
- "Registering viewer/controller for session: [ID]"
- "Broadcasting state update: [STATE]"
- "Viewers: [N] Controllers: [N]"

### What to Check

1. **WebSocket Connection**: Both viewer and controller should connect successfully
2. **Registration**: Server should log registration of viewers/controllers
3. **State Updates**: When you click control buttons, state updates should be broadcast
4. **View Updates**: The radar/area views should update when receiving state changes

### Common Issues

1. **WebSocket not connecting**: Check that the WebSocket server is running on the same port
2. **Session not found**: The session is created when you first visit a controlled URL
3. **No state updates**: Check that both viewer and controller are registered to the same session
4. **View not updating**: Check browser console for JavaScript errors

### Expected Console Output

When working correctly, you should see:

**In the radar/area view console:**
```
External control client initializing... {sessionId: "4444", isControlled: true}
Connecting to WebSocket: ws://localhost:3000
External control WebSocket connected
Received state update: {mode: "radar", range: 10, zonesEnabled: false}
```

**In the server console:**
```
Handling control message: REGISTER_VIEWER for session: 4444
Registering viewer for session: 4444
Handling control message: MODE for session: 4444
Changing mode, direction: forward
Broadcasting state update: {type: "STATE_UPDATE", sessionId: "4444", state: {...}}
Viewers: 1 Controllers: 1
```