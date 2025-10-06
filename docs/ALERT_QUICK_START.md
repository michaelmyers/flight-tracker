# Alert System Quick Start

## 1. Create an Alert

### Via Web UI
1. Go to http://localhost:4040/alerts
2. Click "CREATE NEW" tab
3. Enter alert name and select zone
4. Click "CREATE ALERT"

### Via API
```bash
curl -X POST http://localhost:4040/api/alerts \
  -H "Content-Type: application/json" \
  -d '{"name": "My Alert", "zone_id": 1}'
```

## 2. Add a Webhook Subscriber

### Via Web UI
1. Click "SUBSCRIBERS" button on your alert
2. Select "Webhook" from dropdown
3. Enter your webhook URL
4. Click "ADD"

### Via API
```bash
curl -X POST http://localhost:4040/api/alerts/1/subscribers \
  -H "Content-Type: application/json" \
  -d '{"type": "webhook", "endpoint": "https://your-server.com/webhook"}'
```

## 3. Test Your Webhook

### Quick Test with webhook.site
1. Go to https://webhook.site
2. Copy your unique URL
3. Add it as a webhook subscriber
4. Wait for an aircraft to enter the zone
5. View the payload at webhook.site

### Local Testing with ngrok
```bash
# Install ngrok
npm install -g ngrok

# Start your local server (port 3000)
node webhook-server.js

# Expose it to the internet
ngrok http 3000

# Use the ngrok URL as your webhook endpoint
```

## 4. Simple Webhook Server

Create `webhook-server.js`:
```javascript
const express = require('express');
const app = express();
app.use(express.json());

app.post('/webhook', (req, res) => {
  const { alert, aircraft, zone } = req.body;

  console.log(`🚨 ALERT: ${alert.name}`);
  console.log(`✈️  Aircraft: ${aircraft.hex} (${aircraft.operator || 'Unknown'})`);
  console.log(`📍 Zone: ${zone.name}`);
  console.log(`🎯 Altitude: ${aircraft.altitude}ft`);
  console.log('---');

  res.status(200).send('OK');
});

app.listen(3000, () => {
  console.log('Webhook server running on port 3000');
});
```

Run it:
```bash
npm init -y
npm install express
node webhook-server.js
```

## 5. Discord Integration

Send alerts to Discord channel:
```javascript
const axios = require('axios');

async function sendToDiscord(alertData) {
  const webhookUrl = 'YOUR_DISCORD_WEBHOOK_URL';

  await axios.post(webhookUrl, {
    content: `🚨 **${alertData.alert.name}**`,
    embeds: [{
      color: 0x00ff00,
      fields: [
        { name: 'Aircraft', value: alertData.aircraft.hex, inline: true },
        { name: 'Operator', value: alertData.aircraft.operator || 'Unknown', inline: true },
        { name: 'Altitude', value: `${alertData.aircraft.altitude}ft`, inline: true }
      ]
    }]
  });
}
```

## 6. Manage Alerts

### Enable/Disable Alert
Click the toggle switch in the web UI or:
```bash
# Disable
curl -X PATCH http://localhost:4040/api/alerts/1 \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'

# Enable
curl -X PATCH http://localhost:4040/api/alerts/1 \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

### Delete Alert
Click "DELETE" in web UI or:
```bash
curl -X DELETE http://localhost:4040/api/alerts/1
```

### Remove Subscriber
Click × next to subscriber in web UI or:
```bash
curl -X DELETE http://localhost:4040/api/subscribers/1
```

## Common Webhook Endpoints

### Slack
```javascript
{
  "type": "webhook",
  "endpoint": "https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK"
}
```

### Microsoft Teams
```javascript
{
  "type": "webhook",
  "endpoint": "https://outlook.office.com/webhook/YOUR/TEAMS/WEBHOOK"
}
```

### IFTTT
```javascript
{
  "type": "webhook",
  "endpoint": "https://maker.ifttt.com/trigger/aircraft_alert/with/key/YOUR_KEY"
}
```

### Zapier
```javascript
{
  "type": "webhook",
  "endpoint": "https://hooks.zapier.com/hooks/catch/YOUR/ZAPIER/WEBHOOK"
}
```

## Alert Payload Structure

Every webhook receives this JSON:
```json
{
  "alert": {
    "id": 1,
    "name": "Zone Entry Alert",
    "zone_id": 1
  },
  "aircraft": {
    "hex": "abc123",           // ICAO24 hex code
    "type": "B738",            // Aircraft type
    "callsign": "UAL123",      // Flight callsign
    "altitude": 5000,          // Altitude in feet
    "speed": 250,              // Speed in knots
    "track": 180,              // Heading in degrees
    "manufacturer": "Boeing",   // Manufacturer name
    "model": "737-800",        // Aircraft model
    "operator": "United",      // Airline/operator
    "registration": "N12345"   // Registration number
  },
  "zone": {
    "id": 1,
    "name": "Airport Zone"
  },
  "triggered_at": "2025-01-20T20:30:00.000Z"
}
```

## Troubleshooting

### Not receiving alerts?
1. Check alert is enabled (toggle switch should be ON)
2. Verify webhook URL is accessible from server
3. Check server logs: `journalctl -u flight-tracker -f`
4. Ensure webhook responds within 5 seconds
5. Test with webhook.site first

### Testing without real aircraft
Create a test observation in the database:
```sql
sqlite3 data/tracker.db
INSERT INTO observations (hex, area_id, entered, type)
VALUES ('TEST01', 1, strftime('%s', 'now') * 1000, 'TEST');
```

## Need Help?

- Full documentation: [ALERT_SUBSCRIPTIONS.md](./ALERT_SUBSCRIPTIONS.md)
- API reference: [CONTROL_API.md](./CONTROL_API.md)
- Report issues: https://github.com/your-repo/issues