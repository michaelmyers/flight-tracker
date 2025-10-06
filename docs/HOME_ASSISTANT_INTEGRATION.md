# Home Assistant Integration Guide

This guide shows how to integrate Flight Tracker alerts with Home Assistant for home automation based on aircraft activity.

## Prerequisites

- Home Assistant instance running (local or cloud)
- Flight Tracker with alert system configured
- Network connectivity between Flight Tracker and Home Assistant

## Method 1: Webhook Automation (Simplest)

### Step 1: Create Webhook in Home Assistant

Add to `configuration.yaml`:
```yaml
# Enable webhook support
webhook:

# Create input helpers to store aircraft data
input_text:
  last_aircraft_hex:
    name: Last Aircraft Hex
    initial: "none"
    max: 10

  last_aircraft_operator:
    name: Last Aircraft Operator
    initial: "Unknown"
    max: 50

  last_aircraft_zone:
    name: Last Aircraft Zone
    initial: "none"
    max: 50

input_number:
  last_aircraft_altitude:
    name: Last Aircraft Altitude
    initial: 0
    min: 0
    max: 60000
    step: 1
    unit_of_measurement: "ft"
```

### Step 2: Create Automation for Webhook

Create file `automations.yaml` or add via UI:
```yaml
- id: 'aircraft_alert_webhook'
  alias: Aircraft Alert Handler
  description: 'Process aircraft alerts from Flight Tracker'
  trigger:
    - platform: webhook
      webhook_id: aircraft_alerts
      local_only: false  # Set to true if only local network
  action:
    # Store aircraft data
    - service: input_text.set_value
      target:
        entity_id: input_text.last_aircraft_hex
      data:
        value: '{{ trigger.json.aircraft.hex }}'

    - service: input_text.set_value
      target:
        entity_id: input_text.last_aircraft_operator
      data:
        value: '{{ trigger.json.aircraft.operator | default("Unknown") }}'

    - service: input_text.set_value
      target:
        entity_id: input_text.last_aircraft_zone
      data:
        value: '{{ trigger.json.zone.name }}'

    - service: input_number.set_value
      target:
        entity_id: input_number.last_aircraft_altitude
      data:
        value: '{{ trigger.json.aircraft.altitude | default(0) }}'

    # Send notification
    - service: notify.mobile_app_your_phone
      data:
        title: '✈️ Aircraft Alert'
        message: >
          {{ trigger.json.aircraft.operator | default("Unknown") }}
          ({{ trigger.json.aircraft.type | default("Unknown") }})
          entered {{ trigger.json.zone.name }}
          at {{ trigger.json.aircraft.altitude }}ft
        data:
          tag: 'aircraft_{{ trigger.json.aircraft.hex }}'
          group: 'aircraft_alerts'

    # Log to persistent notification
    - service: persistent_notification.create
      data:
        title: 'Aircraft Alert'
        message: >
          Time: {{ now().strftime('%H:%M:%S') }}
          Aircraft: {{ trigger.json.aircraft.hex }}
          Operator: {{ trigger.json.aircraft.operator | default("Unknown") }}
          Zone: {{ trigger.json.zone.name }}
          Altitude: {{ trigger.json.aircraft.altitude }}ft
        notification_id: 'aircraft_{{ trigger.json.aircraft.hex }}'
```

### Step 3: Get Your Webhook URL

Your webhook URL will be:
- Local: `http://YOUR_HA_IP:8123/api/webhook/aircraft_alerts`
- Nabu Casa: `https://YOUR_NABU_CASA_URL/api/webhook/aircraft_alerts`

### Step 4: Add Webhook to Flight Tracker

```bash
curl -X POST http://localhost:4040/api/alerts/1/subscribers \
  -H "Content-Type: application/json" \
  -d '{
    "type": "webhook",
    "endpoint": "http://YOUR_HA_IP:8123/api/webhook/aircraft_alerts"
  }'
```

## Method 2: REST Sensor (Real-time Monitoring)

### Step 1: Create REST Sensors

Add to `configuration.yaml`:
```yaml
sensor:
  - platform: rest
    name: Flight Tracker Alerts
    resource: http://localhost:4040/api/alerts
    method: GET
    scan_interval: 30
    json_attributes_path: "$.[0]"
    json_attributes:
      - name
      - enabled
      - zone_id
    value_template: '{{ value_json | length }}'
    unit_of_measurement: "alerts"

  - platform: rest
    name: Active Aircraft
    resource: http://localhost:4040/api/aircraft?current=true
    method: GET
    scan_interval: 10
    value_template: '{{ value_json | length }}'
    unit_of_measurement: "aircraft"
    json_attributes_path: "$.[0]"
    json_attributes:
      - hex
      - type
      - operator
```

## Method 3: MQTT Bridge (Advanced)

### Step 1: Create MQTT Bridge Script

Create `mqtt_bridge.js`:
```javascript
const express = require('express');
const mqtt = require('mqtt');
const app = express();

app.use(express.json());

// Connect to MQTT broker
const client = mqtt.connect('mqtt://YOUR_HA_IP:1883', {
  username: 'mqtt_user',
  password: 'mqtt_password'
});

// Home Assistant discovery config
const discoveryConfig = {
  name: 'Flight Tracker Alert',
  unique_id: 'flight_tracker_alert',
  state_topic: 'flight_tracker/alert/state',
  json_attributes_topic: 'flight_tracker/alert/attributes',
  device: {
    identifiers: ['flight_tracker'],
    name: 'Flight Tracker',
    model: 'Alert System',
    manufacturer: 'Custom'
  }
};

// Publish discovery config on connect
client.on('connect', () => {
  console.log('Connected to MQTT');

  // Publish Home Assistant discovery
  client.publish(
    'homeassistant/sensor/flight_tracker/alert/config',
    JSON.stringify(discoveryConfig),
    { retain: true }
  );
});

// Webhook endpoint
app.post('/webhook', (req, res) => {
  const data = req.body;

  // Publish state
  client.publish(
    'flight_tracker/alert/state',
    data.aircraft.hex
  );

  // Publish attributes
  client.publish(
    'flight_tracker/alert/attributes',
    JSON.stringify({
      aircraft_hex: data.aircraft.hex,
      aircraft_type: data.aircraft.type,
      operator: data.aircraft.operator,
      altitude: data.aircraft.altitude,
      zone: data.zone.name,
      triggered_at: data.triggered_at
    })
  );

  // Publish event
  client.publish(
    'flight_tracker/events',
    JSON.stringify(data)
  );

  res.status(200).send('OK');
});

app.listen(3001, () => {
  console.log('MQTT Bridge running on port 3001');
});
```

### Step 2: Configure MQTT in Home Assistant

Add to `configuration.yaml`:
```yaml
mqtt:
  sensor:
    - name: "Flight Alert Aircraft"
      state_topic: "flight_tracker/alert/state"
      json_attributes_topic: "flight_tracker/alert/attributes"
      icon: "mdi:airplane"

    - name: "Flight Alert Zone"
      state_topic: "flight_tracker/alert/attributes"
      value_template: "{{ value_json.zone }}"
      icon: "mdi:map-marker-radius"

    - name: "Flight Alert Altitude"
      state_topic: "flight_tracker/alert/attributes"
      value_template: "{{ value_json.altitude }}"
      unit_of_measurement: "ft"
      icon: "mdi:airplane-takeoff"
```

## Example Automations

### Turn on Lights for Low-Flying Aircraft
```yaml
- id: 'low_flying_aircraft'
  alias: Low Flying Aircraft Alert
  trigger:
    - platform: webhook
      webhook_id: aircraft_alerts
  condition:
    - condition: template
      value_template: '{{ trigger.json.aircraft.altitude < 2000 }}'
  action:
    - service: light.turn_on
      target:
        entity_id: light.living_room
      data:
        brightness: 255
        color_name: red
        flash: short

    - delay:
        seconds: 5

    - service: light.turn_off
      target:
        entity_id: light.living_room
```

### Airport Activity Monitor
```yaml
- id: 'airport_activity'
  alias: Airport Activity Monitor
  trigger:
    - platform: webhook
      webhook_id: aircraft_alerts
  condition:
    - condition: template
      value_template: '{{ trigger.json.zone.name == "Airport" }}'
  action:
    - service: counter.increment
      target:
        entity_id: counter.daily_aircraft

    - service: logbook.log
      data:
        name: Airport Activity
        message: >
          {{ trigger.json.aircraft.operator | default("Unknown") }}
          {{ trigger.json.aircraft.type }}
          at {{ trigger.json.aircraft.altitude }}ft
        entity_id: sensor.airport_activity
```

### Military Aircraft Notification
```yaml
- id: 'military_aircraft'
  alias: Military Aircraft Notification
  trigger:
    - platform: webhook
      webhook_id: aircraft_alerts
  condition:
    - condition: template
      value_template: >
        {{ trigger.json.aircraft.operator is defined and
           ('Military' in trigger.json.aircraft.operator or
            'Air Force' in trigger.json.aircraft.operator or
            'Navy' in trigger.json.aircraft.operator) }}
  action:
    - service: notify.all_devices
      data:
        title: '🚁 Military Aircraft'
        message: >
          {{ trigger.json.aircraft.operator }}
          {{ trigger.json.aircraft.type | default("") }}
          in {{ trigger.json.zone.name }}
        data:
          priority: high
          ttl: 0
```

### Zone-Based Home Modes
```yaml
- id: 'zone_based_modes'
  alias: Adjust Home Mode Based on Aircraft
  trigger:
    - platform: webhook
      webhook_id: aircraft_alerts
  action:
    - choose:
        - conditions:
            - condition: template
              value_template: '{{ trigger.json.zone.name == "Overhead" }}'
          sequence:
            - service: input_select.select_option
              target:
                entity_id: input_select.home_mode
              data:
                option: 'Aircraft Overhead'

        - conditions:
            - condition: template
              value_template: '{{ trigger.json.zone.name == "Approach" }}'
          sequence:
            - service: media_player.volume_set
              target:
                entity_id: media_player.living_room
              data:
                volume_level: 0.3
```

## Lovelace Dashboard Cards

### Aircraft Alert Card
```yaml
type: entities
title: Latest Aircraft Alert
entities:
  - entity: input_text.last_aircraft_hex
    name: Aircraft ID
    icon: mdi:airplane

  - entity: input_text.last_aircraft_operator
    name: Operator
    icon: mdi:domain

  - entity: input_number.last_aircraft_altitude
    name: Altitude
    icon: mdi:airplane-takeoff

  - entity: input_text.last_aircraft_zone
    name: Zone
    icon: mdi:map-marker
```

### Statistics Card
```yaml
type: statistics-graph
title: Aircraft Activity
entities:
  - sensor.active_aircraft
stat_types:
  - mean
  - max
  - min
days_to_show: 7
```

### Map Card with Aircraft
```yaml
type: map
entities:
  - zone.home
  - device_tracker.aircraft_tracker
default_zoom: 12
dark_mode: true
```

## Advanced: Custom Component

Create `custom_components/flight_tracker/__init__.py`:
```python
"""Flight Tracker integration for Home Assistant."""
import logging
import asyncio
from datetime import timedelta

from homeassistant.core import HomeAssistant
from homeassistant.helpers.discovery import async_load_platform
from homeassistant.helpers.event import async_track_time_interval

_LOGGER = logging.getLogger(__name__)

DOMAIN = "flight_tracker"
SCAN_INTERVAL = timedelta(seconds=30)

async def async_setup(hass: HomeAssistant, config: dict):
    """Set up the Flight Tracker component."""
    hass.data[DOMAIN] = {}

    async def update_aircraft(now=None):
        """Update aircraft data."""
        # Fetch from Flight Tracker API
        pass

    # Schedule updates
    async_track_time_interval(hass, update_aircraft, SCAN_INTERVAL)

    # Load platforms
    hass.async_create_task(
        async_load_platform(hass, "sensor", DOMAIN, {}, config)
    )

    return True
```

## Testing Your Integration

### 1. Test Webhook Manually
```bash
curl -X POST http://YOUR_HA_IP:8123/api/webhook/aircraft_alerts \
  -H "Content-Type: application/json" \
  -d '{
    "alert": {"id": 1, "name": "Test Alert", "zone_id": 1},
    "aircraft": {
      "hex": "TEST123",
      "type": "B737",
      "operator": "Test Airlines",
      "altitude": 5000
    },
    "zone": {"id": 1, "name": "Test Zone"},
    "triggered_at": "2025-01-20T12:00:00Z"
  }'
```

### 2. Check Home Assistant Logs
```bash
# In Home Assistant
tail -f /config/home-assistant.log | grep aircraft
```

### 3. Verify in Developer Tools
Go to Developer Tools → States and search for:
- `input_text.last_aircraft_hex`
- `input_text.last_aircraft_operator`
- `input_number.last_aircraft_altitude`

## Troubleshooting

### Webhook Not Working
1. Check if webhook is enabled in configuration.yaml
2. Verify URL is correct (use internal IP for local network)
3. Check Home Assistant logs for errors
4. Test with curl command directly

### No Notifications
1. Verify mobile app is configured
2. Check notification service name
3. Test notification service separately

### MQTT Issues
1. Verify MQTT broker is running
2. Check username/password
3. Use MQTT Explorer to debug topics

## Security Considerations

1. **Use HTTPS for external webhooks**
   - Set up SSL certificate
   - Use Nabu Casa for easy HTTPS

2. **Restrict webhook access**
   ```yaml
   webhook:
     allowed_external: false  # Only local network
   ```

3. **Use secrets file**
   ```yaml
   # secrets.yaml
   flight_tracker_webhook: "http://localhost:4040/api/webhook"

   # configuration.yaml
   webhook_url: !secret flight_tracker_webhook
   ```

## Next Steps

1. Create a dedicated Lovelace dashboard for flight tracking
2. Set up long-term statistics for aircraft patterns
3. Integrate with other services (weather, FlightAware)
4. Create presence detection based on aircraft activity
5. Build historical analysis tools