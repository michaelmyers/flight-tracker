# ESP32 Thing Plus - Flight Tracker Control Implementation

## Overview

This guide provides a complete implementation for using a SparkFun ESP32 Thing Plus as a hardware controller for the Flight Tracker system. The controller uses rotary encoders and buttons to send control messages via WebSocket.

## Hardware Requirements

- SparkFun ESP32 Thing Plus (or compatible ESP32 board)
- 3x Rotary encoders with push buttons
- 1x Toggle switch or button for ZONES control
- Pull-up resistors (10kΩ) for encoder pins
- Power supply (USB or battery)

## Pin Configuration

```
ESP32 Pin Assignments:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MODE Encoder:
  - CLK (A):     GPIO 25
  - DT (B):      GPIO 26
  - SW (Button): GPIO 27

RANGE Encoder:
  - CLK (A):     GPIO 32
  - DT (B):      GPIO 33
  - SW (Button): GPIO 34

SELECT Encoder:
  - CLK (A):     GPIO 18
  - DT (B):      GPIO 19
  - SW (Button): GPIO 21

ZONES Toggle:
  - Switch:      GPIO 22

Status LED:
  - LED:         GPIO 13 (built-in on Thing Plus)
```

## Wiring Diagram

```
     ESP32 Thing Plus
    ┌───────────────┐
    │               │
    │  GPIO25 ──────┼──── MODE CLK
    │  GPIO26 ──────┼──── MODE DT
    │  GPIO27 ──────┼──── MODE SW
    │               │
    │  GPIO32 ──────┼──── RANGE CLK
    │  GPIO33 ──────┼──── RANGE DT
    │  GPIO34 ──────┼──── RANGE SW
    │               │
    │  GPIO18 ──────┼──── SELECT CLK
    │  GPIO19 ──────┼──── SELECT DT
    │  GPIO21 ──────┼──── SELECT SW
    │               │
    │  GPIO22 ──────┼──── ZONES TOGGLE
    │               │
    │  GND ─────────┼──── Common Ground
    │  3V3 ─────────┼──── Pull-up Power
    └───────────────┘

Note: Each encoder pin needs a 10kΩ pull-up resistor to 3V3
```

## Arduino Code Implementation

### Prerequisites
Install the following libraries in Arduino IDE:
- ArduinoWebsockets by Gil Maimon
- ArduinoJson by Benoit Blanchon
- ESP32Encoder by Kevin Harrington

### Complete Code

```cpp
/**
 * Flight Tracker ESP32 Controller
 *
 * Controls Flight Tracker displays via WebSocket using rotary encoders
 *
 * Hardware: SparkFun ESP32 Thing Plus
 * Author: Flight Tracker Team
 * Version: 1.0.0
 */

#include <WiFi.h>
#include <ArduinoWebsockets.h>
#include <ArduinoJson.h>
#include <ESP32Encoder.h>

// ============== CONFIGURATION ==============
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* WEBSOCKET_HOST = "192.168.1.100";  // Your server IP
const uint16_t WEBSOCKET_PORT = 4040;
const char* SESSION_ID = "1234";  // 4-digit session ID

// ============== PIN DEFINITIONS ==============
// MODE Encoder
#define MODE_CLK 25
#define MODE_DT 26
#define MODE_SW 27

// RANGE Encoder
#define RANGE_CLK 32
#define RANGE_DT 33
#define RANGE_SW 34

// SELECT Encoder
#define SELECT_CLK 18
#define SELECT_DT 19
#define SELECT_SW 21

// ZONES Toggle
#define ZONES_TOGGLE 22

// Status LED
#define STATUS_LED 13

// ============== ENCODER SETUP ==============
ESP32Encoder modeEncoder;
ESP32Encoder rangeEncoder;
ESP32Encoder selectEncoder;

// Encoder state tracking
long lastModePosition = 0;
long lastRangePosition = 0;
long lastSelectPosition = 0;

// Button debouncing
unsigned long lastModePress = 0;
unsigned long lastRangePress = 0;
unsigned long lastSelectPress = 0;
unsigned long lastZonesToggle = 0;
const unsigned long DEBOUNCE_DELAY = 200;  // milliseconds

// Zones state
bool lastZonesState = false;

// ============== WEBSOCKET ==============
using namespace websockets;
WebsocketsClient wsClient;
bool wsConnected = false;
unsigned long lastReconnectAttempt = 0;
const unsigned long RECONNECT_INTERVAL = 5000;  // 5 seconds

// ============== STATUS LED ==============
unsigned long lastLedBlink = 0;
bool ledState = false;

void setup() {
  Serial.begin(115200);
  Serial.println("\nFlight Tracker ESP32 Controller");
  Serial.println("================================");

  // Initialize status LED
  pinMode(STATUS_LED, OUTPUT);
  digitalWrite(STATUS_LED, LOW);

  // Initialize encoder buttons with internal pull-ups
  pinMode(MODE_SW, INPUT_PULLUP);
  pinMode(RANGE_SW, INPUT_PULLUP);
  pinMode(SELECT_SW, INPUT_PULLUP);
  pinMode(ZONES_TOGGLE, INPUT_PULLUP);

  // Initialize encoders
  modeEncoder.attachHalfQuad(MODE_CLK, MODE_DT);
  rangeEncoder.attachHalfQuad(RANGE_CLK, RANGE_DT);
  selectEncoder.attachHalfQuad(SELECT_CLK, SELECT_DT);

  // Clear encoder counts
  modeEncoder.clearCount();
  rangeEncoder.clearCount();
  selectEncoder.clearCount();

  // Connect to WiFi
  connectWiFi();

  // Setup WebSocket callbacks
  setupWebSocket();

  // Initial connection attempt
  connectWebSocket();
}

void loop() {
  // Handle WebSocket connection
  if (!wsConnected && (millis() - lastReconnectAttempt > RECONNECT_INTERVAL)) {
    lastReconnectAttempt = millis();
    connectWebSocket();
  }

  if (wsConnected) {
    wsClient.poll();

    // Check for control inputs
    handleModeEncoder();
    handleRangeEncoder();
    handleSelectEncoder();
    handleZonesToggle();
    handleButtons();
  }

  // Update status LED
  updateStatusLED();
}

void connectWiFi() {
  Serial.print("Connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    digitalWrite(STATUS_LED, !digitalRead(STATUS_LED));
  }

  Serial.println("\nWiFi connected!");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
}

void setupWebSocket() {
  wsClient.onMessage([](WebsocketsMessage message) {
    Serial.print("Received: ");
    Serial.println(message.data());

    // Parse message
    StaticJsonDocument<512> doc;
    DeserializationError error = deserializeJson(doc, message.data());

    if (!error) {
      const char* type = doc["type"];
      if (strcmp(type, "STATE_UPDATE") == 0) {
        // Handle state update
        JsonObject state = doc["state"];
        const char* mode = state["mode"];
        int range = state["range"];
        bool zonesEnabled = state["zonesEnabled"];

        Serial.print("State - Mode: ");
        Serial.print(mode);
        Serial.print(", Range: ");
        Serial.print(range);
        Serial.print(", Zones: ");
        Serial.println(zonesEnabled ? "ON" : "OFF");
      }
    }
  });

  wsClient.onEvent([](WebsocketsEvent event, String data) {
    if (event == WebsocketsEvent::ConnectionOpened) {
      Serial.println("WebSocket connected!");
      wsConnected = true;
      digitalWrite(STATUS_LED, HIGH);

      // Register as controller
      registerController();
    } else if (event == WebsocketsEvent::ConnectionClosed) {
      Serial.println("WebSocket disconnected!");
      wsConnected = false;
      digitalWrite(STATUS_LED, LOW);
    } else if (event == WebsocketsEvent::GotPing) {
      Serial.println("Got ping");
      wsClient.pong();
    }
  });
}

void connectWebSocket() {
  Serial.println("Connecting to WebSocket server...");

  String url = "ws://" + String(WEBSOCKET_HOST) + ":" + String(WEBSOCKET_PORT);
  bool connected = wsClient.connect(url);

  if (connected) {
    Serial.println("WebSocket connection established!");
  } else {
    Serial.println("WebSocket connection failed!");
  }
}

void registerController() {
  StaticJsonDocument<128> doc;
  doc["type"] = "REGISTER_CONTROLLER";
  doc["sessionId"] = SESSION_ID;

  String message;
  serializeJson(doc, message);

  wsClient.send(message);
  Serial.println("Registered as controller for session " + String(SESSION_ID));
}

void handleModeEncoder() {
  long currentPosition = modeEncoder.getCount() / 2;  // Divide by 2 for detent counting

  if (currentPosition != lastModePosition) {
    if (currentPosition > lastModePosition) {
      sendControlMessage("MODE", "forward");
      Serial.println("MODE: Forward");
    } else {
      sendControlMessage("MODE", "backward");
      Serial.println("MODE: Backward");
    }
    lastModePosition = currentPosition;
  }
}

void handleRangeEncoder() {
  long currentPosition = rangeEncoder.getCount() / 2;

  if (currentPosition != lastRangePosition) {
    if (currentPosition > lastRangePosition) {
      sendControlMessage("RANGE", "forward");
      Serial.println("RANGE: Forward");
    } else {
      sendControlMessage("RANGE", "backward");
      Serial.println("RANGE: Backward");
    }
    lastRangePosition = currentPosition;
  }
}

void handleSelectEncoder() {
  long currentPosition = selectEncoder.getCount() / 2;

  if (currentPosition != lastSelectPosition) {
    if (currentPosition > lastSelectPosition) {
      sendControlMessage("SELECT", "forward");
      Serial.println("SELECT: Forward");
    } else {
      sendControlMessage("SELECT", "backward");
      Serial.println("SELECT: Backward");
    }
    lastSelectPosition = currentPosition;
  }
}

void handleZonesToggle() {
  bool currentState = !digitalRead(ZONES_TOGGLE);  // Active LOW

  if (currentState != lastZonesState &&
      (millis() - lastZonesToggle > DEBOUNCE_DELAY)) {
    lastZonesToggle = millis();
    lastZonesState = currentState;

    sendControlMessage("ZONES", nullptr);
    Serial.println("ZONES: Toggle");
  }
}

void handleButtons() {
  // MODE button - reset to radar view
  if (!digitalRead(MODE_SW) && (millis() - lastModePress > DEBOUNCE_DELAY)) {
    lastModePress = millis();
    Serial.println("MODE button pressed - resetting view");
    // Could send a specific reset command if implemented
  }

  // RANGE button - reset to default range
  if (!digitalRead(RANGE_SW) && (millis() - lastRangePress > DEBOUNCE_DELAY)) {
    lastRangePress = millis();
    Serial.println("RANGE button pressed");
    // Could send a specific reset command if implemented
  }

  // SELECT button - deselect aircraft
  if (!digitalRead(SELECT_SW) && (millis() - lastSelectPress > DEBOUNCE_DELAY)) {
    lastSelectPress = millis();
    Serial.println("SELECT button pressed - deselecting");
    // Could send deselect command if implemented
  }
}

void sendControlMessage(const char* type, const char* direction) {
  if (!wsConnected) {
    Serial.println("Not connected - cannot send message");
    return;
  }

  StaticJsonDocument<256> doc;
  doc["type"] = type;
  doc["sessionId"] = SESSION_ID;

  if (direction != nullptr) {
    doc["direction"] = direction;
  }

  String message;
  serializeJson(doc, message);

  wsClient.send(message);

  // Flash LED on send
  digitalWrite(STATUS_LED, LOW);
  delay(50);
  digitalWrite(STATUS_LED, HIGH);
}

void updateStatusLED() {
  if (!wsConnected) {
    // Blink when not connected
    if (millis() - lastLedBlink > 500) {
      lastLedBlink = millis();
      ledState = !ledState;
      digitalWrite(STATUS_LED, ledState);
    }
  } else {
    // Solid when connected
    digitalWrite(STATUS_LED, HIGH);
  }
}
```

## Platform.IO Configuration

If using PlatformIO instead of Arduino IDE:

```ini
; platformio.ini
[env:esp32thing_plus]
platform = espressif32
board = sparkfun_esp32_thing_plus
framework = arduino
monitor_speed = 115200

lib_deps =
    gilmaimon/ArduinoWebsockets@^0.5.3
    bblanchon/ArduinoJson@^6.21.0
    madhephaestus/ESP32Encoder@^0.10.1

; Optional: OTA updates
upload_protocol = espota
upload_port = 192.168.1.xxx
```

## Advanced Features

### 1. OLED Display Support

Add an SSD1306 OLED to show current state:

```cpp
#include <Adafruit_SSD1306.h>

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 32
#define OLED_RESET -1

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

void setupDisplay() {
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("SSD1306 allocation failed");
    return;
  }
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("Flight Tracker");
  display.println("Controller v1.0");
  display.display();
}

void updateDisplay(const char* mode, int range, bool zones) {
  display.clearDisplay();
  display.setCursor(0, 0);
  display.print("Mode: ");
  display.println(mode);
  display.print("Range: ");
  display.print(range);
  display.println(strcmp(mode, "radar") == 0 ? " mi" : " hr");
  display.print("Zones: ");
  display.println(zones ? "ON" : "OFF");
  display.display();
}
```

### 2. Haptic Feedback

Add haptic feedback using a vibration motor:

```cpp
#define HAPTIC_PIN 23

void setupHaptic() {
  pinMode(HAPTIC_PIN, OUTPUT);
  digitalWrite(HAPTIC_PIN, LOW);
}

void hapticPulse(int duration = 50) {
  digitalWrite(HAPTIC_PIN, HIGH);
  delay(duration);
  digitalWrite(HAPTIC_PIN, LOW);
}

// Call hapticPulse() when sending commands
```

### 3. Battery Monitoring

Monitor battery voltage on Thing Plus:

```cpp
#define VBAT_PIN A13  // Built-in voltage divider on Thing Plus

float getBatteryVoltage() {
  // Thing Plus has 1/2 voltage divider
  float voltage = analogRead(VBAT_PIN);
  voltage = (voltage / 4095.0) * 3.3 * 2.0;
  return voltage;
}

void checkBattery() {
  float voltage = getBatteryVoltage();
  if (voltage < 3.3) {
    Serial.println("Low battery warning!");
    // Flash LED or show on display
  }
}
```

### 4. Configuration via Web Interface

Add a web configuration interface:

```cpp
#include <WebServer.h>
#include <Preferences.h>

WebServer server(80);
Preferences preferences;

void setupWebConfig() {
  server.on("/", handleRoot);
  server.on("/config", handleConfig);
  server.begin();

  preferences.begin("flight-tracker", false);
  // Load saved config
  String savedHost = preferences.getString("host", WEBSOCKET_HOST);
  String savedSession = preferences.getString("session", SESSION_ID);
}

void handleRoot() {
  String html = R"(
    <html>
    <body>
    <h1>Flight Tracker Controller</h1>
    <form action='/config' method='POST'>
      Host: <input type='text' name='host'><br>
      Session: <input type='text' name='session'><br>
      <input type='submit' value='Save'>
    </form>
    </body>
    </html>
  )";
  server.send(200, "text/html", html);
}

void handleConfig() {
  String host = server.arg("host");
  String session = server.arg("session");

  preferences.putString("host", host);
  preferences.putString("session", session);

  server.send(200, "text/plain", "Configuration saved! Restarting...");
  delay(1000);
  ESP.restart();
}
```

## Troubleshooting

### Common Issues and Solutions

1. **Encoder not responding**
   - Check wiring and pull-up resistors
   - Verify pin assignments match your wiring
   - Try adjusting the division factor for detent counting

2. **WebSocket connection fails**
   - Verify server IP and port
   - Check firewall settings
   - Ensure ESP32 and server are on same network
   - Check serial monitor for error messages

3. **Erratic encoder behavior**
   - Add capacitors (100nF) between encoder pins and ground
   - Use shielded cable for encoder connections
   - Increase debounce delay

4. **WiFi connection issues**
   - Check SSID and password
   - Ensure 2.4GHz network (ESP32 doesn't support 5GHz)
   - Try static IP configuration

### Debug Commands

Add serial commands for testing:

```cpp
void handleSerialCommands() {
  if (Serial.available()) {
    String command = Serial.readStringUntil('\n');
    command.trim();

    if (command == "status") {
      Serial.println(wsConnected ? "Connected" : "Disconnected");
    } else if (command == "reconnect") {
      wsClient.close();
      connectWebSocket();
    } else if (command.startsWith("mode ")) {
      String dir = command.substring(5);
      sendControlMessage("MODE", dir.c_str());
    }
  }
}
```

## Power Optimization

For battery-powered operation:

```cpp
void enterLightSleep(int seconds) {
  esp_sleep_enable_timer_wakeup(seconds * 1000000);
  esp_light_sleep_start();
}

void setupPowerSave() {
  // Reduce CPU frequency
  setCpuFrequencyMhz(80);

  // Disable Bluetooth
  btStop();

  // Configure wake sources
  esp_sleep_enable_ext0_wakeup(GPIO_NUM_27, 0);  // Wake on MODE button
}
```

## Enclosure Recommendations

- Use a Hammond 1591 series box (120x80x60mm)
- 3D print knobs for encoders with grip texture
- Add labels using vinyl stickers or engraving
- Include strain relief for USB cable
- Consider adding rubber feet for stability

## Testing Procedure

1. **Initial Setup**
   - Upload code to ESP32
   - Open Serial Monitor (115200 baud)
   - Verify WiFi connection
   - Check WebSocket connection

2. **Control Testing**
   - Turn MODE encoder - verify mode changes
   - Turn RANGE encoder - verify range updates
   - Turn SELECT encoder - verify aircraft selection
   - Toggle ZONES switch - verify overlay toggle

3. **Reliability Testing**
   - Disconnect/reconnect network cable on server
   - Power cycle the ESP32
   - Test range limitations (distance from WiFi)
   - Verify auto-reconnection works

## Resources

- [SparkFun ESP32 Thing Plus Hookup Guide](https://learn.sparkfun.com/tutorials/esp32-thing-plus-hookup-guide)
- [ArduinoWebsockets Library Documentation](https://github.com/gilmaimon/ArduinoWebsockets)
- [ESP32 Arduino Core Documentation](https://docs.espressif.com/projects/arduino-esp32/)
- [Rotary Encoder Tutorial](https://lastminuteengineers.com/rotary-encoder-arduino-tutorial/)