# Alert Subscription Guide

## Overview

The Flight Tracker alert system supports multiple subscription methods to receive notifications when aircraft enter monitored zones. Each alert can have multiple subscribers, and each subscriber can use a different notification method.

## Subscription Types

### 1. Webhook Subscriptions

Webhooks are HTTP POST requests sent to your specified URL when an alert triggers.

**Setup:**
1. Navigate to `/alerts` in the web interface
2. Click "SUBSCRIBERS" on the alert you want to subscribe to
3. Select "Webhook" from the dropdown
4. Enter your webhook URL (must be HTTPS for production)
5. Click "ADD"

**Via API:**
```bash
curl -X POST http://localhost:4040/api/alerts/1/subscribers \
  -H "Content-Type: application/json" \
  -d '{
    "type": "webhook",
    "endpoint": "https://your-server.com/webhook/endpoint"
  }'
```

**Webhook Payload:**
Your webhook endpoint will receive a POST request with this JSON payload:
```json
{
  "alert": {
    "id": 1,
    "name": "DCA Airport Entry Alert",
    "zone_id": 3
  },
  "aircraft": {
    "hex": "a126e7",
    "type": "B738",
    "callsign": "UAL123",
    "altitude": 5000,
    "speed": 250,
    "track": 180,
    "manufacturer": "Boeing",
    "model": "737-800",
    "operator": "United Airlines",
    "registration": "N12345"
  },
  "zone": {
    "id": 3,
    "name": "DCA"
  },
  "triggered_at": "2025-01-20T20:30:00.000Z"
}
```

**Webhook Requirements:**
- Must respond within 5 seconds (timeout enforced)
- Should return 2xx status code for success
- Failed webhooks are logged but not retried
- Headers sent: `Content-Type: application/json`, `User-Agent: FlightTracker-AlertSystem/1.0`

**Example Webhook Handler (Node.js/Express):**
```javascript
app.post('/webhook/flight-alerts', (req, res) => {
  const payload = req.body;

  console.log(`Alert triggered: ${payload.alert.name}`);
  console.log(`Aircraft: ${payload.aircraft.hex} (${payload.aircraft.operator})`);
  console.log(`Zone: ${payload.zone.name}`);
  console.log(`Time: ${payload.triggered_at}`);

  // Process the alert (send email, SMS, log to database, etc.)
  processAlert(payload);

  // Respond quickly to avoid timeout
  res.status(200).json({ received: true });
});
```

### 2. WebSocket Subscriptions

WebSocket subscriptions receive real-time notifications through an active WebSocket connection.

**Setup:**
1. Navigate to `/alerts` in the web interface
2. Click "SUBSCRIBERS" on the alert
3. Select "WebSocket" from the dropdown
4. Enter the session ID (4-digit code like "1234")
5. Click "ADD"

**Via API:**
```bash
curl -X POST http://localhost:4040/api/alerts/1/subscribers \
  -H "Content-Type: application/json" \
  -d '{
    "type": "websocket",
    "endpoint": "1234"
  }'
```

**WebSocket Client Example:**
```javascript
const ws = new WebSocket('ws://localhost:4040');

ws.on('message', (data) => {
  const message = JSON.parse(data);

  if (message.type === 'ALERT_NOTIFICATION') {
    console.log('Alert received:', message.payload);
    // Handle the alert
  }
});
```

**WebSocket Message Format:**
```json
{
  "type": "ALERT_NOTIFICATION",
  "sessionId": "1234",
  "payload": {
    // Same payload structure as webhook
  }
}
```

### 3. Email Subscriptions (Future)

Email subscriptions are defined but not yet implemented. When available:

**Setup:**
1. Navigate to `/alerts` in the web interface
2. Click "SUBSCRIBERS" on the alert
3. Select "Email" from the dropdown
4. Enter the email address
5. Click "ADD"

**Via API:**
```bash
curl -X POST http://localhost:4040/api/alerts/1/subscribers \
  -H "Content-Type: application/json" \
  -d '{
    "type": "email",
    "endpoint": "alerts@example.com"
  }'
```

## Managing Subscriptions

### List Alert Subscribers

View all subscribers for a specific alert:

```bash
curl http://localhost:4040/api/alerts/1
```

Response includes subscribers array:
```json
{
  "id": 1,
  "name": "DCA Airport Entry Alert",
  "subscribers": [
    {
      "id": 1,
      "alert_id": 1,
      "type": "webhook",
      "endpoint": "https://example.com/webhook",
      "active": 1,
      "created_at": 1234567890000
    }
  ],
  "history": []
}
```

### Remove a Subscriber

Via Web UI:
1. Go to `/alerts`
2. Click "SUBSCRIBERS" on the alert
3. Click the × button next to the subscriber

Via API:
```bash
curl -X DELETE http://localhost:4040/api/subscribers/1
```

### Enable/Disable Alerts

Alerts can be temporarily disabled without deleting them:

Via Web UI:
- Toggle the switch next to each alert

Via API:
```bash
curl -X PATCH http://localhost:4040/api/alerts/1 \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

## Integration Examples

### Python Webhook Server

```python
from flask import Flask, request, jsonify
import logging

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

@app.route('/alerts/aircraft', methods=['POST'])
def handle_alert():
    data = request.json

    # Log the alert
    logging.info(f"Aircraft {data['aircraft']['hex']} entered {data['zone']['name']}")

    # Process based on alert type
    if data['aircraft'].get('altitude', 0) < 1000:
        send_low_altitude_warning(data)

    # Quick response
    return jsonify({"status": "received"}), 200

def send_low_altitude_warning(data):
    # Send SMS, email, or other notification
    pass

if __name__ == '__main__':
    app.run(port=5000)
```

### Node.js with Multiple Handlers

```javascript
const express = require('express');
const app = express();

app.use(express.json());

// Map different alerts to different handlers
const alertHandlers = {
  'DCA Airport Entry Alert': handleAirportAlert,
  'Restricted Zone Alert': handleRestrictedZone,
  'Low Altitude Alert': handleLowAltitude
};

app.post('/webhook/alerts', async (req, res) => {
  const { alert, aircraft, zone, triggered_at } = req.body;

  // Find appropriate handler
  const handler = alertHandlers[alert.name] || defaultHandler;

  try {
    await handler({ alert, aircraft, zone, triggered_at });
    res.status(200).json({ processed: true });
  } catch (error) {
    console.error('Alert processing failed:', error);
    res.status(500).json({ error: 'Processing failed' });
  }
});

async function handleAirportAlert(data) {
  // Log to database
  await logToDatabase(data);

  // Send to Discord
  await sendDiscordNotification(
    `✈️ Aircraft ${data.aircraft.registration || data.aircraft.hex} ` +
    `(${data.aircraft.operator || 'Unknown'}) entered ${data.zone.name}`
  );
}

function handleRestrictedZone(data) {
  // High priority notification
  sendSMS(`RESTRICTED ZONE BREACH: ${data.aircraft.hex} at ${data.aircraft.altitude}ft`);
}

function handleLowAltitude(data) {
  if (data.aircraft.altitude < 500) {
    sendEmergencyAlert(data);
  }
}
```

### Integrating with Discord

```javascript
const axios = require('axios');

async function sendDiscordWebhook(alertData) {
  const webhookUrl = 'https://discord.com/api/webhooks/YOUR_WEBHOOK_URL';

  const embed = {
    title: '✈️ Aircraft Alert',
    color: 0x00ff00,
    fields: [
      {
        name: 'Zone',
        value: alertData.zone.name,
        inline: true
      },
      {
        name: 'Aircraft',
        value: alertData.aircraft.hex,
        inline: true
      },
      {
        name: 'Operator',
        value: alertData.aircraft.operator || 'Unknown',
        inline: true
      },
      {
        name: 'Altitude',
        value: `${alertData.aircraft.altitude || 'Unknown'} ft`,
        inline: true
      },
      {
        name: 'Model',
        value: alertData.aircraft.model || 'Unknown',
        inline: true
      }
    ],
    timestamp: alertData.triggered_at
  };

  await axios.post(webhookUrl, {
    content: `Alert: ${alertData.alert.name}`,
    embeds: [embed]
  });
}
```

### Home Assistant Integration

```yaml
# configuration.yaml
rest_command:
  aircraft_alert_webhook:
    url: "http://localhost:4040/api/alerts/1/subscribers"
    method: POST
    headers:
      Content-Type: application/json
    payload: '{"type": "webhook", "endpoint": "{{ webhook_url }}"}'

automation:
  - alias: "Process Aircraft Alerts"
    trigger:
      - platform: webhook
        webhook_id: aircraft_alerts
    action:
      - service: notify.mobile_app
        data:
          title: "Aircraft Alert"
          message: >
            {{ trigger.json.aircraft.operator }} entered {{ trigger.json.zone.name }}
            at {{ trigger.json.aircraft.altitude }}ft
```

## Testing Webhooks

### Using ngrok for Local Development

1. Install ngrok: `npm install -g ngrok`
2. Start your local webhook server on port 3000
3. Expose it: `ngrok http 3000`
4. Use the ngrok URL as your webhook endpoint

### Using webhook.site for Testing

1. Go to https://webhook.site
2. Copy your unique URL
3. Add it as a webhook subscriber
4. View incoming alerts in real-time

### Manual Testing

Simulate an alert trigger:
```bash
# Create a test alert
curl -X POST http://localhost:4040/api/alerts \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Alert", "zone_id": 1}'

# Add a webhook subscriber
curl -X POST http://localhost:4040/api/alerts/1/subscribers \
  -H "Content-Type: application/json" \
  -d '{"type": "webhook", "endpoint": "https://webhook.site/YOUR-UUID"}'
```

## Best Practices

1. **Webhook Security**
   - Use HTTPS in production
   - Implement webhook signature verification
   - Add IP whitelisting if possible
   - Use authentication tokens in headers

2. **Error Handling**
   - Respond quickly (< 5 seconds)
   - Log failures for debugging
   - Implement retry logic on your end if needed
   - Use queue systems for heavy processing

3. **Performance**
   - Process webhooks asynchronously
   - Use message queues for complex workflows
   - Batch process if receiving many alerts

4. **Monitoring**
   - Track webhook delivery success rates
   - Monitor response times
   - Set up alerts for failures

## Troubleshooting

### Webhook Not Receiving Alerts
- Check if the alert is enabled
- Verify the endpoint URL is correct and accessible
- Check server logs for connection errors
- Ensure your webhook responds within 5 seconds

### WebSocket Not Receiving Alerts
- Verify WebSocket connection is active
- Check the session ID matches
- Ensure the client is listening for ALERT_NOTIFICATION messages

### Alerts Not Triggering
- Verify the zone has altitude limits set appropriately
- Check that aircraft are actually entering the zone
- Ensure the alert engine is running (check server logs)
- Verify the alert is enabled

## API Reference

### Create Alert Subscriber
```
POST /api/alerts/:alertId/subscribers
Content-Type: application/json

{
  "type": "webhook|email|websocket",
  "endpoint": "URL, email address, or session ID"
}
```

### Delete Subscriber
```
DELETE /api/subscribers/:subscriberId
```

### Get Alert with Subscribers
```
GET /api/alerts/:alertId
```

Returns alert details including all active subscribers and recent history.