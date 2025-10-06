# External Control System

The external control system enables remote control of Flight Tracker displays through WebSocket connections, perfect for kiosk setups, hardware controllers, or multi-screen configurations.

## Overview

External control allows you to:
- Set up kiosk displays (e.g., on Raspberry Pi) with no on-screen controls
- Use hardware controllers (ESP32 with rotary encoders and switches)
- Control displays from a separate browser tab or device
- Synchronize multiple displays to show the same view
- Create retro TV-style channel switching animations

## How It Works

1. **Session Creation** - A 4-digit session ID links controllers to viewers
2. **WebSocket Connection** - Both controllers and viewers connect via WebSocket
3. **State Synchronization** - Controller actions update all connected viewers
4. **UI Adaptation** - On-screen controls hide when external control is active

## Session Management

Sessions use simple 4-digit numeric codes (e.g., `1234`):
- **Viewer URL**: `http://localhost:4040/1234/radar` or `/1234/area`
- **Controller URL**: `http://localhost:4040/1234/controls`
- Sessions persist until all connections close

## Controls

### MODE

The "MODE" will switch through all the zones available and radar screen. It is represented by a rotary encoder (typically with detents). As the encoder is turned, each detent will switch to a different screen. For example, with 3 defined zones would have the following order:

--> Zone 1, Zone 2, Zone 3, Radar, Zone 1, Zone 2, Zone 3, Radar, Zone 1, etc.

It can go both left (backwards) or right (forwards).

### RANGE

The "RANGE" will also be represented by a rotary encoder with detents. Depending on the current view (zone vs radar) it will change different fields. On zone it will change the number of hours to report recent activity on (1, 4, 12, 24). On the radar it will change the mileage range (5, 10, 15, 25, 50, 100). For both, when it surpasses the last value it will look back around to the beginning.

### SELECT

The "SELECT" will be represented by a rotary encoder with detents. Primarily used on the radar view, when rotated it will cycle through aircraft on the radar screen similar to if you have clicked on them. The order it cycles through them will be dependent on closeness to the center of the radar. If the aircraft leaves the screen, it will be deselected and nothing will be selected.

### ZONES

A toggle switch, "ZONES", will turn zones off and on on the radar screen.

## Web Based Controls

A separate view `/:id/controls` can be opened in another tab and that will then act as controls for the other tab at `/:id/radar` or `/:id/area`.

## Quick Setup Guide

### Browser-to-Browser Control

1. **Open Viewer**: Navigate to `http://localhost:4040/1234/radar`
2. **Open Controller**: In another tab/device, go to `http://localhost:4040/1234/controls`
3. **Control**: Use the web interface to control the viewer display

### Hardware Controller

1. **Build Hardware**: See [ESP32 Implementation](./ESP32_IMPLEMENTATION.md)
2. **Configure WiFi**: Update ESP32 with your network credentials
3. **Set Server URL**: Point ESP32 to your Flight Tracker server
4. **Connect**: ESP32 will establish WebSocket connection automatically

### Kiosk Mode Setup

```bash
# Raspberry Pi full-screen kiosk
chromium-browser --kiosk --app=http://server:4040/1234/radar

# Auto-start on boot
echo '@chromium-browser --kiosk --app=http://server:4040/1234/radar' >> ~/.config/lxsession/LXDE-pi/autostart
```

## Status Indicators

When external control is active:
- Green status box shows "EXTERNAL CONTROL ACTIVE"
- Session ID displayed for reference
- On-screen navigation controls are hidden
- Channel change animations play during transitions

## Troubleshooting

**Controller not connecting**
- Verify session ID matches between controller and viewer
- Check WebSocket port 4040 is accessible
- Review browser console for connection errors

**Controls not responding**
- Ensure viewer is connected first
- Check network connectivity
- Verify controller has correct session ID

## Related Documentation

- [Control API Reference](./CONTROL_API.md) - Technical WebSocket protocol details
- [ESP32 Implementation](./ESP32_IMPLEMENTATION.md) - Hardware controller build guide
- [Hardware Integration](./HARDWARE_INTEGRATION.md) - Additional hardware projects
