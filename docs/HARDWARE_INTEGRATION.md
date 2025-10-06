# Hardware Integration - Lights & Sound Alerts

## Overview

This guide provides sample code for triggering physical alerts (lights, buzzers, speakers) when aircraft enter monitored zones. Implementations are provided for Raspberry Pi, Arduino with WiFi, and ESP32.

## Table of Contents
- [Raspberry Pi Implementation](#raspberry-pi-implementation)
- [ESP32 Implementation](#esp32-implementation)
- [Arduino with Ethernet Shield](#arduino-with-ethernet-shield)
- [Advanced Alert Patterns](#advanced-alert-patterns)

---

## Raspberry Pi Implementation

### Hardware Setup

**Components:**
- Raspberry Pi (any model with GPIO)
- LED strip or individual LEDs
- Piezo buzzer or small speaker
- 330Ω resistors for LEDs
- NPN transistor (2N2222) for buzzer if high current
- Jumper wires

**GPIO Connections:**
```
Raspberry Pi GPIO Layout:
━━━━━━━━━━━━━━━━━━━━━━━━━
GPIO 17 → RED LED (Alert)
GPIO 27 → YELLOW LED (Warning)
GPIO 22 → GREEN LED (Active)
GPIO 23 → BUZZER
GPIO 24 → STROBE LIGHT (optional)
GND     → Common Ground
```

### Python Webhook Server with GPIO

```python
#!/usr/bin/env python3
"""
Aircraft Alert Hardware Controller for Raspberry Pi
Triggers lights and sounds when aircraft enter zones
"""

import RPi.GPIO as GPIO
import time
import threading
import json
from flask import Flask, request, jsonify
from queue import Queue
import requests

# GPIO Pin Configuration
PIN_RED_LED = 17      # Critical alert
PIN_YELLOW_LED = 27   # Warning alert
PIN_GREEN_LED = 22    # System active
PIN_BUZZER = 23       # Piezo buzzer
PIN_STROBE = 24       # Optional strobe light

# Alert Configuration
ALERT_DURATION = 10   # seconds
BUZZER_FREQUENCY = 2500  # Hz
CRITICAL_ALTITUDE = 1000  # feet

# Initialize Flask
app = Flask(__name__)
alert_queue = Queue()

# Setup GPIO
def setup_gpio():
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(PIN_RED_LED, GPIO.OUT)
    GPIO.setup(PIN_YELLOW_LED, GPIO.OUT)
    GPIO.setup(PIN_GREEN_LED, GPIO.OUT)
    GPIO.setup(PIN_BUZZER, GPIO.OUT)
    GPIO.setup(PIN_STROBE, GPIO.OUT)

    # Set initial states
    GPIO.output(PIN_GREEN_LED, GPIO.HIGH)  # System active
    GPIO.output(PIN_RED_LED, GPIO.LOW)
    GPIO.output(PIN_YELLOW_LED, GPIO.LOW)
    GPIO.output(PIN_BUZZER, GPIO.LOW)
    GPIO.output(PIN_STROBE, GPIO.LOW)

    # Setup PWM for buzzer
    global buzzer_pwm
    buzzer_pwm = GPIO.PWM(PIN_BUZZER, BUZZER_FREQUENCY)

def cleanup_gpio():
    buzzer_pwm.stop()
    GPIO.cleanup()

# Alert Patterns
def critical_alert_pattern():
    """Red light with rapid beeping for low altitude"""
    GPIO.output(PIN_RED_LED, GPIO.HIGH)
    GPIO.output(PIN_STROBE, GPIO.HIGH)

    # Rapid beep pattern
    for _ in range(20):
        buzzer_pwm.start(50)  # 50% duty cycle
        time.sleep(0.1)
        buzzer_pwm.stop()
        time.sleep(0.1)

    GPIO.output(PIN_RED_LED, GPIO.LOW)
    GPIO.output(PIN_STROBE, GPIO.LOW)

def warning_alert_pattern():
    """Yellow light with moderate beeping"""
    GPIO.output(PIN_YELLOW_LED, GPIO.HIGH)

    # Moderate beep pattern
    for _ in range(10):
        buzzer_pwm.start(50)
        time.sleep(0.2)
        buzzer_pwm.stop()
        time.sleep(0.3)

    GPIO.output(PIN_YELLOW_LED, GPIO.LOW)

def standard_alert_pattern():
    """Quick flash and beep for normal alerts"""
    # Flash all lights
    for _ in range(3):
        GPIO.output(PIN_RED_LED, GPIO.HIGH)
        GPIO.output(PIN_YELLOW_LED, GPIO.HIGH)
        buzzer_pwm.start(50)
        time.sleep(0.2)

        GPIO.output(PIN_RED_LED, GPIO.LOW)
        GPIO.output(PIN_YELLOW_LED, GPIO.LOW)
        buzzer_pwm.stop()
        time.sleep(0.2)

def military_aircraft_alert():
    """Special pattern for military aircraft"""
    # Alternating red/yellow with siren sound
    for i in range(10):
        GPIO.output(PIN_RED_LED, GPIO.HIGH if i % 2 == 0 else GPIO.LOW)
        GPIO.output(PIN_YELLOW_LED, GPIO.LOW if i % 2 == 0 else GPIO.HIGH)

        # Siren effect (sweep frequency)
        for freq in range(1000, 3000, 100):
            buzzer_pwm.ChangeFrequency(freq)
            buzzer_pwm.start(50)
            time.sleep(0.01)
        buzzer_pwm.stop()
        time.sleep(0.1)

    GPIO.output(PIN_RED_LED, GPIO.LOW)
    GPIO.output(PIN_YELLOW_LED, GPIO.LOW)

# Alert Worker Thread
def alert_worker():
    """Process alerts from queue"""
    while True:
        alert_data = alert_queue.get()
        if alert_data is None:
            break

        aircraft = alert_data.get('aircraft', {})
        zone = alert_data.get('zone', {})

        print(f"Processing alert for {aircraft.get('hex')} in {zone.get('name')}")

        # Determine alert severity
        altitude = aircraft.get('altitude', float('inf'))
        operator = aircraft.get('operator', '').lower()

        if altitude < CRITICAL_ALTITUDE:
            critical_alert_pattern()
        elif 'military' in operator or 'force' in operator:
            military_aircraft_alert()
        elif altitude < 3000:
            warning_alert_pattern()
        else:
            standard_alert_pattern()

        alert_queue.task_done()

# Web Endpoints
@app.route('/webhook', methods=['POST'])
def webhook():
    """Receive aircraft alerts"""
    try:
        data = request.json
        alert_queue.put(data)

        # Log the alert
        aircraft = data.get('aircraft', {})
        zone = data.get('zone', {})
        print(f"ALERT: {aircraft.get('hex')} ({aircraft.get('operator')}) "
              f"entered {zone.get('name')} at {aircraft.get('altitude')}ft")

        return jsonify({'status': 'received'}), 200
    except Exception as e:
        print(f"Error processing webhook: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/test/<pattern>')
def test_pattern(pattern):
    """Test alert patterns"""
    patterns = {
        'critical': critical_alert_pattern,
        'warning': warning_alert_pattern,
        'standard': standard_alert_pattern,
        'military': military_aircraft_alert
    }

    if pattern in patterns:
        patterns[pattern]()
        return jsonify({'status': f'Tested {pattern} pattern'}), 200
    return jsonify({'error': 'Unknown pattern'}), 404

@app.route('/silence', methods=['POST'])
def silence():
    """Emergency silence all alerts"""
    buzzer_pwm.stop()
    GPIO.output(PIN_RED_LED, GPIO.LOW)
    GPIO.output(PIN_YELLOW_LED, GPIO.LOW)
    GPIO.output(PIN_STROBE, GPIO.LOW)
    return jsonify({'status': 'Silenced'}), 200

# Main
if __name__ == '__main__':
    try:
        setup_gpio()

        # Start alert worker thread
        worker = threading.Thread(target=alert_worker, daemon=True)
        worker.start()

        print("Aircraft Alert Hardware Controller Started")
        print("Webhook endpoint: http://YOUR_PI_IP:5000/webhook")
        print("Test patterns: http://YOUR_PI_IP:5000/test/[critical|warning|standard|military]")

        # Run Flask server
        app.run(host='0.0.0.0', port=5000, debug=False)

    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        alert_queue.put(None)  # Signal worker to stop
        cleanup_gpio()
```

### Advanced Raspberry Pi with LCD Display

```python
#!/usr/bin/env python3
"""
Enhanced Alert System with LCD Display
Shows aircraft details on 16x2 or 20x4 LCD
"""

import RPi.GPIO as GPIO
from RPLCD.gpio import CharLCD
import time
import threading
from flask import Flask, request, jsonify

# LCD Configuration (adjust pins as needed)
lcd = CharLCD(
    numbering_mode=GPIO.BCM,
    cols=20, rows=4,
    pin_rs=25, pin_e=24,
    pins_data=[23, 17, 21, 22],
    pin_backlight=None
)

# Additional Components
PIN_RGB_RED = 5
PIN_RGB_GREEN = 6
PIN_RGB_BLUE = 13
PIN_BUZZER = 19
PIN_VIBRATION_MOTOR = 26

app = Flask(__name__)

def setup_hardware():
    GPIO.setmode(GPIO.BCM)

    # RGB LED setup (common cathode)
    GPIO.setup(PIN_RGB_RED, GPIO.OUT)
    GPIO.setup(PIN_RGB_GREEN, GPIO.OUT)
    GPIO.setup(PIN_RGB_BLUE, GPIO.OUT)
    GPIO.setup(PIN_BUZZER, GPIO.OUT)
    GPIO.setup(PIN_VIBRATION_MOTOR, GPIO.OUT)

    # PWM for RGB LED
    global pwm_red, pwm_green, pwm_blue, pwm_buzzer
    pwm_red = GPIO.PWM(PIN_RGB_RED, 100)
    pwm_green = GPIO.PWM(PIN_RGB_GREEN, 100)
    pwm_blue = GPIO.PWM(PIN_RGB_BLUE, 100)
    pwm_buzzer = GPIO.PWM(PIN_BUZZER, 1000)

    # Start PWMs at 0
    pwm_red.start(0)
    pwm_green.start(0)
    pwm_blue.start(0)

    # Initialize LCD
    lcd.clear()
    lcd.write_string("Alert System Ready")

def set_rgb_color(red, green, blue):
    """Set RGB LED color (0-100 for each)"""
    pwm_red.ChangeDutyCycle(red)
    pwm_green.ChangeDutyCycle(green)
    pwm_blue.ChangeDutyCycle(blue)

def display_aircraft_info(aircraft, zone):
    """Show aircraft details on LCD"""
    lcd.clear()

    # Line 1: Alert type and zone
    lcd.cursor_pos = (0, 0)
    lcd.write_string(f"ALERT: {zone.get('name', 'Unknown')[:13]}")

    # Line 2: Aircraft ID and operator
    lcd.cursor_pos = (1, 0)
    hex_code = aircraft.get('hex', 'Unknown')[:6]
    operator = aircraft.get('operator', 'Unknown')[:13]
    lcd.write_string(f"{hex_code} {operator}")

    # Line 3: Altitude and speed
    lcd.cursor_pos = (2, 0)
    altitude = aircraft.get('altitude', 0)
    speed = aircraft.get('speed', 0)
    lcd.write_string(f"ALT:{altitude}ft SPD:{speed}kt")

    # Line 4: Aircraft type
    lcd.cursor_pos = (3, 0)
    model = aircraft.get('model', aircraft.get('type', 'Unknown'))[:20]
    lcd.write_string(model)

def proximity_alert(distance_nm):
    """Alert intensity based on distance"""
    if distance_nm < 1:
        # Very close - red, rapid beep, vibration
        set_rgb_color(100, 0, 0)
        GPIO.output(PIN_VIBRATION_MOTOR, GPIO.HIGH)
        for _ in range(10):
            pwm_buzzer.start(50)
            time.sleep(0.1)
            pwm_buzzer.stop()
            time.sleep(0.05)
        GPIO.output(PIN_VIBRATION_MOTOR, GPIO.LOW)

    elif distance_nm < 3:
        # Close - orange, moderate beep
        set_rgb_color(100, 50, 0)
        for _ in range(5):
            pwm_buzzer.start(50)
            time.sleep(0.2)
            pwm_buzzer.stop()
            time.sleep(0.2)

    else:
        # In zone - yellow, slow beep
        set_rgb_color(100, 100, 0)
        for _ in range(3):
            pwm_buzzer.start(50)
            time.sleep(0.3)
            pwm_buzzer.stop()
            time.sleep(0.5)

def special_aircraft_patterns(aircraft):
    """Special patterns for specific aircraft types"""
    aircraft_type = aircraft.get('type', '').upper()
    operator = aircraft.get('operator', '').upper()

    if 'MILITARY' in operator:
        # Military: Alternating red/blue with siren
        for i in range(20):
            set_rgb_color(100 if i % 2 else 0, 0, 0 if i % 2 else 100)
            freq = 1000 + (i * 100)
            pwm_buzzer.ChangeFrequency(freq)
            pwm_buzzer.start(50)
            time.sleep(0.1)
        pwm_buzzer.stop()

    elif aircraft_type in ['A380', 'B744', 'B748']:  # Large aircraft
        # Large aircraft: Slow pulse with deep tone
        pwm_buzzer.ChangeFrequency(200)
        for i in range(5):
            for brightness in range(0, 101, 5):
                set_rgb_color(0, brightness, brightness)
                time.sleep(0.02)
            pwm_buzzer.start(50)
            time.sleep(0.5)
            pwm_buzzer.stop()
            for brightness in range(100, -1, -5):
                set_rgb_color(0, brightness, brightness)
                time.sleep(0.02)

    elif 'HELICOPTER' in aircraft_type or aircraft_type.startswith('H'):
        # Helicopter: Rapid white strobe with clicking sound
        pwm_buzzer.ChangeFrequency(50)
        for _ in range(30):
            set_rgb_color(100, 100, 100)
            pwm_buzzer.start(10)
            time.sleep(0.05)
            set_rgb_color(0, 0, 0)
            pwm_buzzer.stop()
            time.sleep(0.05)

@app.route('/webhook', methods=['POST'])
def webhook():
    try:
        data = request.json
        aircraft = data.get('aircraft', {})
        zone = data.get('zone', {})

        # Display on LCD
        display_aircraft_info(aircraft, zone)

        # Determine alert type
        altitude = aircraft.get('altitude', float('inf'))

        if altitude < 1000:
            # Critical low altitude
            set_rgb_color(100, 0, 0)  # Red
            threading.Thread(target=lambda: proximity_alert(0.5)).start()
        else:
            # Check for special aircraft
            threading.Thread(target=lambda: special_aircraft_patterns(aircraft)).start()

        return jsonify({'status': 'received'}), 200

    except Exception as e:
        print(f"Error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/clear', methods=['POST'])
def clear_display():
    """Clear LCD and turn off alerts"""
    lcd.clear()
    lcd.write_string("System Ready")
    set_rgb_color(0, 0, 0)
    pwm_buzzer.stop()
    GPIO.output(PIN_VIBRATION_MOTOR, GPIO.LOW)
    return jsonify({'status': 'cleared'}), 200

if __name__ == '__main__':
    try:
        setup_hardware()
        set_rgb_color(0, 100, 0)  # Green = ready
        app.run(host='0.0.0.0', port=5000, debug=False)
    finally:
        lcd.clear()
        GPIO.cleanup()
```

---

## ESP32 Implementation

### Complete ESP32 Alert Receiver

```cpp
/**
 * ESP32 Aircraft Alert System
 * Receives webhooks and triggers lights/sound
 *
 * Hardware:
 * - ESP32 DevKit
 * - WS2812B LED Strip (NeoPixel)
 * - Piezo Buzzer
 * - Optional: OLED Display
 */

#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include <Adafruit_NeoPixel.h>
#include <Wire.h>
#include <Adafruit_SSD1306.h>

// Configuration
const char* WIFI_SSID = "YOUR_WIFI";
const char* WIFI_PASSWORD = "YOUR_PASSWORD";

// Pin Definitions
#define LED_STRIP_PIN 15
#define BUZZER_PIN 25
#define RED_LED_PIN 32
#define YELLOW_LED_PIN 33
#define GREEN_LED_PIN 27

// LED Strip Configuration
#define NUM_LEDS 30
Adafruit_NeoPixel strip(NUM_LEDS, LED_STRIP_PIN, NEO_GRB + NEO_KHZ800);

// OLED Display (optional)
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// Web Server
WebServer server(80);

// Alert State
struct AlertInfo {
  String aircraftHex;
  String operator;
  String zone;
  int altitude;
  bool active;
  unsigned long timestamp;
} currentAlert;

// Buzzer frequencies for different alerts
const int FREQ_CRITICAL = 2500;
const int FREQ_WARNING = 1500;
const int FREQ_NORMAL = 1000;

void setup() {
  Serial.begin(115200);
  Serial.println("Aircraft Alert System Starting...");

  // Initialize pins
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(RED_LED_PIN, OUTPUT);
  pinMode(YELLOW_LED_PIN, OUTPUT);
  pinMode(GREEN_LED_PIN, OUTPUT);

  // Initialize LED strip
  strip.begin();
  strip.show();
  strip.setBrightness(50);

  // Initialize OLED
  if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("SSD1306 allocation failed");
  } else {
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(0,0);
    display.println("Alert System");
    display.println("Initializing...");
    display.display();
  }

  // Connect to WiFi
  connectWiFi();

  // Setup web server endpoints
  server.on("/webhook", HTTP_POST, handleWebhook);
  server.on("/test", HTTP_GET, handleTest);
  server.on("/status", HTTP_GET, handleStatus);
  server.on("/clear", HTTP_POST, handleClear);

  server.begin();
  Serial.println("HTTP server started");

  // System ready indication
  systemReady();
}

void loop() {
  server.handleClient();

  // Process active alerts
  if (currentAlert.active) {
    unsigned long elapsed = millis() - currentAlert.timestamp;

    if (elapsed < 10000) { // Alert for 10 seconds
      // Continue alert pattern
      if (currentAlert.altitude < 1000) {
        criticalAlertPattern();
      } else if (currentAlert.altitude < 3000) {
        warningAlertPattern();
      } else {
        normalAlertPattern();
      }
    } else {
      // Clear alert after timeout
      currentAlert.active = false;
      clearAlert();
    }
  }

  delay(10);
}

void connectWiFi() {
  Serial.print("Connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    digitalWrite(GREEN_LED_PIN, !digitalRead(GREEN_LED_PIN));
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected!");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
    digitalWrite(GREEN_LED_PIN, HIGH);
  } else {
    Serial.println("\nWiFi connection failed!");
    digitalWrite(RED_LED_PIN, HIGH);
  }
}

void handleWebhook() {
  if (server.hasArg("plain")) {
    String body = server.arg("plain");

    StaticJsonDocument<1024> doc;
    DeserializationError error = deserializeJson(doc, body);

    if (!error) {
      // Extract alert data
      JsonObject aircraft = doc["aircraft"];
      JsonObject zone = doc["zone"];
      JsonObject alert = doc["alert"];

      currentAlert.aircraftHex = aircraft["hex"].as<String>();
      currentAlert.operator = aircraft["operator"].as<String>();
      currentAlert.zone = zone["name"].as<String>();
      currentAlert.altitude = aircraft["altitude"].as<int>();
      currentAlert.active = true;
      currentAlert.timestamp = millis();

      // Log alert
      Serial.print("ALERT: Aircraft ");
      Serial.print(currentAlert.aircraftHex);
      Serial.print(" (");
      Serial.print(currentAlert.operator);
      Serial.print(") in zone ");
      Serial.print(currentAlert.zone);
      Serial.print(" at ");
      Serial.print(currentAlert.altitude);
      Serial.println("ft");

      // Update display
      updateDisplay();

      // Trigger appropriate alert
      if (currentAlert.altitude < 1000) {
        startCriticalAlert();
      } else if (currentAlert.altitude < 3000) {
        startWarningAlert();
      } else {
        startNormalAlert();
      }

      server.send(200, "application/json", "{\"status\":\"received\"}");
    } else {
      server.send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
    }
  } else {
    server.send(400, "application/json", "{\"error\":\"No data\"}");
  }
}

void startCriticalAlert() {
  Serial.println("CRITICAL ALERT!");

  // Red strobe effect on LED strip
  for (int repeat = 0; repeat < 5; repeat++) {
    for (int i = 0; i < NUM_LEDS; i++) {
      strip.setPixelColor(i, strip.Color(255, 0, 0));
    }
    strip.show();

    // Rapid beeping
    for (int beep = 0; beep < 5; beep++) {
      tone(BUZZER_PIN, FREQ_CRITICAL, 100);
      digitalWrite(RED_LED_PIN, HIGH);
      delay(100);
      digitalWrite(RED_LED_PIN, LOW);
      delay(50);
    }

    // Clear strip
    strip.clear();
    strip.show();
    delay(200);
  }
}

void startWarningAlert() {
  Serial.println("WARNING ALERT");

  // Orange pulse on LED strip
  for (int repeat = 0; repeat < 3; repeat++) {
    for (int brightness = 0; brightness < 255; brightness += 5) {
      for (int i = 0; i < NUM_LEDS; i++) {
        strip.setPixelColor(i, strip.Color(brightness, brightness/2, 0));
      }
      strip.show();
      delay(10);
    }

    tone(BUZZER_PIN, FREQ_WARNING, 300);
    digitalWrite(YELLOW_LED_PIN, HIGH);
    delay(300);
    digitalWrite(YELLOW_LED_PIN, LOW);

    for (int brightness = 255; brightness >= 0; brightness -= 5) {
      for (int i = 0; i < NUM_LEDS; i++) {
        strip.setPixelColor(i, strip.Color(brightness, brightness/2, 0));
      }
      strip.show();
      delay(10);
    }
  }
}

void startNormalAlert() {
  Serial.println("Normal alert");

  // Green chase effect on LED strip
  for (int repeat = 0; repeat < 2; repeat++) {
    for (int pos = 0; pos < NUM_LEDS; pos++) {
      strip.clear();
      for (int i = 0; i < 5; i++) {
        int pixel = (pos + i) % NUM_LEDS;
        strip.setPixelColor(pixel, strip.Color(0, 255 - (i * 50), 0));
      }
      strip.show();

      if (pos % 5 == 0) {
        tone(BUZZER_PIN, FREQ_NORMAL, 50);
      }

      delay(50);
    }
  }
}

void criticalAlertPattern() {
  // Continuous pattern while alert is active
  static unsigned long lastToggle = 0;
  static bool state = false;

  if (millis() - lastToggle > 200) {
    state = !state;
    digitalWrite(RED_LED_PIN, state);

    if (state) {
      tone(BUZZER_PIN, FREQ_CRITICAL, 150);
      for (int i = 0; i < NUM_LEDS; i++) {
        strip.setPixelColor(i, strip.Color(255, 0, 0));
      }
    } else {
      strip.clear();
    }
    strip.show();
    lastToggle = millis();
  }
}

void warningAlertPattern() {
  static unsigned long lastToggle = 0;
  static bool state = false;

  if (millis() - lastToggle > 500) {
    state = !state;
    digitalWrite(YELLOW_LED_PIN, state);

    if (state) {
      tone(BUZZER_PIN, FREQ_WARNING, 200);
      for (int i = 0; i < NUM_LEDS; i++) {
        strip.setPixelColor(i, strip.Color(255, 128, 0));
      }
    } else {
      strip.clear();
    }
    strip.show();
    lastToggle = millis();
  }
}

void normalAlertPattern() {
  static unsigned long lastUpdate = 0;
  static int position = 0;

  if (millis() - lastUpdate > 100) {
    strip.clear();

    // Moving green dot
    strip.setPixelColor(position, strip.Color(0, 255, 0));
    strip.setPixelColor((position + 1) % NUM_LEDS, strip.Color(0, 128, 0));
    strip.setPixelColor((position - 1 + NUM_LEDS) % NUM_LEDS, strip.Color(0, 128, 0));
    strip.show();

    position = (position + 1) % NUM_LEDS;

    if (position % 10 == 0) {
      tone(BUZZER_PIN, FREQ_NORMAL, 50);
    }

    lastUpdate = millis();
  }
}

void updateDisplay() {
  display.clearDisplay();
  display.setCursor(0, 0);
  display.setTextSize(2);
  display.println("ALERT!");

  display.setTextSize(1);
  display.println("");
  display.print("Zone: ");
  display.println(currentAlert.zone);
  display.print("Aircraft: ");
  display.println(currentAlert.aircraftHex);
  display.print("Altitude: ");
  display.print(currentAlert.altitude);
  display.println(" ft");
  display.print("Operator: ");
  display.println(currentAlert.operator.substring(0, 20));

  display.display();
}

void clearAlert() {
  Serial.println("Clearing alert");

  // Turn off all indicators
  digitalWrite(RED_LED_PIN, LOW);
  digitalWrite(YELLOW_LED_PIN, LOW);
  noTone(BUZZER_PIN);

  // Clear LED strip with fade out
  for (int brightness = 50; brightness >= 0; brightness--) {
    for (int i = 0; i < NUM_LEDS; i++) {
      strip.setPixelColor(i, strip.Color(0, brightness, 0));
    }
    strip.show();
    delay(20);
  }
  strip.clear();
  strip.show();

  // Update display
  display.clearDisplay();
  display.setCursor(0, 0);
  display.setTextSize(1);
  display.println("System Ready");
  display.print("IP: ");
  display.println(WiFi.localIP());
  display.display();

  // Ready indicator
  digitalWrite(GREEN_LED_PIN, HIGH);
}

void systemReady() {
  // System ready animation
  for (int i = 0; i < NUM_LEDS; i++) {
    strip.setPixelColor(i, strip.Color(0, 255, 0));
    strip.show();
    delay(30);
  }
  delay(500);
  for (int i = NUM_LEDS - 1; i >= 0; i--) {
    strip.setPixelColor(i, strip.Color(0, 0, 0));
    strip.show();
    delay(30);
  }

  digitalWrite(GREEN_LED_PIN, HIGH);
  tone(BUZZER_PIN, 1000, 100);
  delay(150);
  tone(BUZZER_PIN, 1500, 100);
  delay(150);
  tone(BUZZER_PIN, 2000, 100);

  Serial.println("System ready!");
  Serial.print("Webhook URL: http://");
  Serial.print(WiFi.localIP());
  Serial.println("/webhook");
}

void handleTest() {
  // Test alert
  currentAlert.aircraftHex = "TEST123";
  currentAlert.operator = "Test Airline";
  currentAlert.zone = "Test Zone";
  currentAlert.altitude = 500;
  currentAlert.active = true;
  currentAlert.timestamp = millis();

  updateDisplay();
  startCriticalAlert();

  server.send(200, "text/plain", "Test alert triggered");
}

void handleStatus() {
  StaticJsonDocument<256> doc;
  doc["connected"] = (WiFi.status() == WL_CONNECTED);
  doc["ip"] = WiFi.localIP().toString();
  doc["alertActive"] = currentAlert.active;

  if (currentAlert.active) {
    doc["aircraft"] = currentAlert.aircraftHex;
    doc["altitude"] = currentAlert.altitude;
  }

  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}

void handleClear() {
  currentAlert.active = false;
  clearAlert();
  server.send(200, "text/plain", "Alert cleared");
}
```

---

## Arduino with Ethernet Shield

### Arduino Mega with Ethernet Alert System

```cpp
/**
 * Arduino Aircraft Alert System
 * For Arduino Mega + Ethernet Shield
 */

#include <SPI.h>
#include <Ethernet.h>
#include <ArduinoJson.h>

// Network Configuration
byte mac[] = { 0xDE, 0xAD, 0xBE, 0xEF, 0xFE, 0xED };
IPAddress ip(192, 168, 1, 177);
EthernetServer server(80);

// Pin Configuration
const int RED_LED = 22;
const int YELLOW_LED = 24;
const int GREEN_LED = 26;
const int BUZZER = 28;
const int STROBE_LIGHT = 30;

// 7-Segment Display Pins (for altitude display)
const int DIGIT_PINS[] = {32, 34, 36, 38};  // Common cathode
const int SEGMENT_PINS[] = {40, 42, 44, 46, 48, 50, 52}; // a-g

// Alert State
bool alertActive = false;
int alertAltitude = 0;
unsigned long alertStartTime = 0;
String alertZone = "";

void setup() {
  Serial.begin(9600);

  // Initialize pins
  pinMode(RED_LED, OUTPUT);
  pinMode(YELLOW_LED, OUTPUT);
  pinMode(GREEN_LED, OUTPUT);
  pinMode(BUZZER, OUTPUT);
  pinMode(STROBE_LIGHT, OUTPUT);

  for (int i = 0; i < 4; i++) {
    pinMode(DIGIT_PINS[i], OUTPUT);
    digitalWrite(DIGIT_PINS[i], LOW);
  }

  for (int i = 0; i < 7; i++) {
    pinMode(SEGMENT_PINS[i], OUTPUT);
  }

  // Start Ethernet
  Ethernet.begin(mac, ip);
  server.begin();

  Serial.print("Server ready at http://");
  Serial.println(Ethernet.localIP());

  // System ready
  systemReady();
}

void loop() {
  // Check for incoming HTTP requests
  EthernetClient client = server.available();

  if (client) {
    handleClient(client);
  }

  // Process active alerts
  if (alertActive) {
    processAlert();

    // Display altitude on 7-segment
    displayNumber(alertAltitude);

    // Auto-clear after 15 seconds
    if (millis() - alertStartTime > 15000) {
      clearAlert();
    }
  } else {
    // System idle - slow green pulse
    static unsigned long lastPulse = 0;
    static int brightness = 0;
    static int direction = 1;

    if (millis() - lastPulse > 20) {
      brightness += direction * 5;
      if (brightness >= 255 || brightness <= 0) {
        direction = -direction;
      }
      analogWrite(GREEN_LED, brightness);
      lastPulse = millis();
    }
  }
}

void handleClient(EthernetClient client) {
  String request = "";
  String body = "";
  bool isPost = false;
  int contentLength = 0;

  while (client.connected()) {
    if (client.available()) {
      String line = client.readStringUntil('\n');
      line.trim();

      if (line.startsWith("POST /webhook")) {
        isPost = true;
      }

      if (line.startsWith("Content-Length: ")) {
        contentLength = line.substring(16).toInt();
      }

      if (line.length() == 0) {
        // End of headers
        if (isPost && contentLength > 0) {
          char buffer[contentLength + 1];
          client.readBytes(buffer, contentLength);
          buffer[contentLength] = '\0';
          body = String(buffer);

          // Process webhook
          processWebhook(body);

          // Send response
          client.println("HTTP/1.1 200 OK");
          client.println("Content-Type: application/json");
          client.println("Connection: close");
          client.println();
          client.println("{\"status\":\"received\"}");
        } else {
          // Send test page
          sendTestPage(client);
        }
        break;
      }
    }
  }

  delay(1);
  client.stop();
}

void processWebhook(String jsonBody) {
  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, jsonBody);

  if (!error) {
    JsonObject aircraft = doc["aircraft"];
    JsonObject zone = doc["zone"];

    alertAltitude = aircraft["altitude"] | 0;
    alertZone = zone["name"] | "Unknown";
    String hex = aircraft["hex"] | "Unknown";

    Serial.print("ALERT: Aircraft ");
    Serial.print(hex);
    Serial.print(" in ");
    Serial.print(alertZone);
    Serial.print(" at ");
    Serial.print(alertAltitude);
    Serial.println("ft");

    // Activate alert
    alertActive = true;
    alertStartTime = millis();

    // Trigger alert based on altitude
    if (alertAltitude < 1000) {
      criticalAlert();
    } else if (alertAltitude < 3000) {
      warningAlert();
    } else {
      normalAlert();
    }
  }
}

void processAlert() {
  static unsigned long lastAction = 0;
  static int state = 0;

  if (alertAltitude < 1000) {
    // Critical: Rapid red flash and beep
    if (millis() - lastAction > 100) {
      state = !state;
      digitalWrite(RED_LED, state);
      digitalWrite(STROBE_LIGHT, state);

      if (state) {
        tone(BUZZER, 2500, 80);
      }

      lastAction = millis();
    }
  } else if (alertAltitude < 3000) {
    // Warning: Yellow pulse
    if (millis() - lastAction > 300) {
      state = !state;
      digitalWrite(YELLOW_LED, state);

      if (state) {
        tone(BUZZER, 1500, 200);
      }

      lastAction = millis();
    }
  } else {
    // Normal: Slow green flash
    if (millis() - lastAction > 1000) {
      state = !state;
      digitalWrite(GREEN_LED, state);

      if (state) {
        tone(BUZZER, 1000, 100);
      }

      lastAction = millis();
    }
  }
}

void criticalAlert() {
  // Immediate critical alert sequence
  for (int i = 0; i < 20; i++) {
    digitalWrite(RED_LED, HIGH);
    digitalWrite(STROBE_LIGHT, HIGH);
    tone(BUZZER, 3000);
    delay(50);

    digitalWrite(RED_LED, LOW);
    digitalWrite(STROBE_LIGHT, LOW);
    noTone(BUZZER);
    delay(50);
  }
}

void warningAlert() {
  // Warning sequence
  for (int i = 0; i < 10; i++) {
    digitalWrite(YELLOW_LED, HIGH);
    tone(BUZZER, 2000, 150);
    delay(200);
    digitalWrite(YELLOW_LED, LOW);
    delay(200);
  }
}

void normalAlert() {
  // Normal alert sequence
  for (int i = 0; i < 5; i++) {
    digitalWrite(GREEN_LED, HIGH);
    tone(BUZZER, 1000, 100);
    delay(500);
    digitalWrite(GREEN_LED, LOW);
    delay(500);
  }
}

void clearAlert() {
  alertActive = false;
  digitalWrite(RED_LED, LOW);
  digitalWrite(YELLOW_LED, LOW);
  digitalWrite(GREEN_LED, HIGH);
  digitalWrite(STROBE_LIGHT, LOW);
  noTone(BUZZER);

  // Clear display
  for (int i = 0; i < 4; i++) {
    digitalWrite(DIGIT_PINS[i], LOW);
  }

  Serial.println("Alert cleared");
}

void systemReady() {
  // System startup sequence
  digitalWrite(GREEN_LED, HIGH);
  tone(BUZZER, 1000, 100);
  delay(150);
  tone(BUZZER, 1500, 100);
  delay(150);
  tone(BUZZER, 2000, 100);
  delay(150);

  digitalWrite(GREEN_LED, LOW);
  delay(100);
  digitalWrite(GREEN_LED, HIGH);
}

// 7-Segment Display Functions
const byte DIGITS[] = {
  0b00111111, // 0
  0b00000110, // 1
  0b01011011, // 2
  0b01001111, // 3
  0b01100110, // 4
  0b01101101, // 5
  0b01111101, // 6
  0b00000111, // 7
  0b01111111, // 8
  0b01101111  // 9
};

void displayNumber(int number) {
  int digits[4];
  digits[0] = (number / 1000) % 10;
  digits[1] = (number / 100) % 10;
  digits[2] = (number / 10) % 10;
  digits[3] = number % 10;

  for (int digit = 0; digit < 4; digit++) {
    displayDigit(digit, digits[digit]);
    delay(2);
  }
}

void displayDigit(int position, int number) {
  // Turn off all digits
  for (int i = 0; i < 4; i++) {
    digitalWrite(DIGIT_PINS[i], LOW);
  }

  // Set segments for the number
  byte pattern = DIGITS[number];
  for (int i = 0; i < 7; i++) {
    digitalWrite(SEGMENT_PINS[i], (pattern >> i) & 1);
  }

  // Turn on the specific digit
  digitalWrite(DIGIT_PINS[position], HIGH);
}

void sendTestPage(EthernetClient client) {
  client.println("HTTP/1.1 200 OK");
  client.println("Content-Type: text/html");
  client.println("Connection: close");
  client.println();
  client.println("<!DOCTYPE HTML>");
  client.println("<html><body>");
  client.println("<h1>Arduino Alert System</h1>");
  client.println("<p>Status: ");
  client.println(alertActive ? "ALERT ACTIVE" : "Ready");
  client.println("</p>");

  if (alertActive) {
    client.print("<p>Zone: ");
    client.print(alertZone);
    client.print(" | Altitude: ");
    client.print(alertAltitude);
    client.println("ft</p>");
  }

  client.println("<p>Webhook endpoint: /webhook</p>");
  client.println("</body></html>");
}
```

---

## Advanced Alert Patterns

### Multi-Zone Priority System

```python
#!/usr/bin/env python3
"""
Advanced Alert System with Zone Priorities
Different alert patterns for different zones
"""

import RPi.GPIO as GPIO
import threading
import queue
from enum import Enum

class ZonePriority(Enum):
    CRITICAL = 1  # Military/restricted zones
    HIGH = 2      # Airport approach
    MEDIUM = 3    # General monitoring
    LOW = 4       # Information only

class AlertPattern:
    def __init__(self, gpio_pins):
        self.pins = gpio_pins
        self.patterns = {
            ZonePriority.CRITICAL: self.critical_pattern,
            ZonePriority.HIGH: self.high_pattern,
            ZonePriority.MEDIUM: self.medium_pattern,
            ZonePriority.LOW: self.low_pattern
        }

    def critical_pattern(self, aircraft_data):
        """Red strobe, siren, vibration"""
        # Activate all emergency indicators
        GPIO.output(self.pins['red_strobe'], GPIO.HIGH)
        GPIO.output(self.pins['vibration'], GPIO.HIGH)

        # Siren sound
        buzzer = GPIO.PWM(self.pins['buzzer'], 1000)
        for _ in range(10):
            for freq in range(500, 2500, 100):
                buzzer.ChangeFrequency(freq)
                buzzer.start(50)
                time.sleep(0.01)
            for freq in range(2500, 500, -100):
                buzzer.ChangeFrequency(freq)
                buzzer.start(50)
                time.sleep(0.01)

        buzzer.stop()
        GPIO.output(self.pins['red_strobe'], GPIO.LOW)
        GPIO.output(self.pins['vibration'], GPIO.LOW)

    def high_pattern(self, aircraft_data):
        """Orange pulse, dual-tone alert"""
        pwm_orange = GPIO.PWM(self.pins['orange_led'], 100)
        buzzer = GPIO.PWM(self.pins['buzzer'], 1000)

        for _ in range(5):
            # Fade in
            for dc in range(0, 101, 5):
                pwm_orange.ChangeDutyCycle(dc)
                time.sleep(0.01)

            # Dual tone
            buzzer.ChangeFrequency(1000)
            buzzer.start(50)
            time.sleep(0.1)
            buzzer.ChangeFrequency(1500)
            time.sleep(0.1)
            buzzer.stop()

            # Fade out
            for dc in range(100, -1, -5):
                pwm_orange.ChangeDutyCycle(dc)
                time.sleep(0.01)

        pwm_orange.stop()

# Zone configuration with priorities
ZONE_CONFIG = {
    "Restricted Airspace": ZonePriority.CRITICAL,
    "DCA": ZonePriority.HIGH,
    "Hospital Zone": ZonePriority.HIGH,
    "Monitoring Zone": ZonePriority.MEDIUM,
    "Test Zone": ZonePriority.LOW
}

def determine_priority(zone_name, altitude):
    """Determine alert priority based on zone and altitude"""
    base_priority = ZONE_CONFIG.get(zone_name, ZonePriority.LOW)

    # Escalate based on altitude
    if altitude < 500:
        return ZonePriority.CRITICAL
    elif altitude < 1000 and base_priority.value > ZonePriority.HIGH.value:
        return ZonePriority.HIGH

    return base_priority
```

## Setup Instructions

### Raspberry Pi Setup

1. Install required packages:
```bash
sudo apt-get update
sudo apt-get install python3-pip python3-rpi.gpio
pip3 install flask requests adafruit-circuitpython-neopixel
```

2. Run the alert system:
```bash
sudo python3 alert_system.py
```

3. Subscribe to alerts:
```bash
curl -X POST http://flight-tracker:4040/api/alerts/1/subscribers \
  -H "Content-Type: application/json" \
  -d '{"type": "webhook", "endpoint": "http://raspberrypi.local:5000/webhook"}'
```

### ESP32 Setup

1. Install Arduino IDE libraries:
   - Adafruit NeoPixel
   - ArduinoJson
   - Adafruit SSD1306

2. Upload the code to ESP32

3. Find the ESP32's IP address from serial monitor

4. Subscribe to alerts:
```bash
curl -X POST http://flight-tracker:4040/api/alerts/1/subscribers \
  -H "Content-Type: application/json" \
  -d '{"type": "webhook", "endpoint": "http://ESP32_IP/webhook"}'
```

## Testing

Test your hardware without waiting for aircraft:

### Direct test endpoints:
- Raspberry Pi: `http://pi_ip:5000/test/critical`
- ESP32: `http://esp32_ip/test`
- Arduino: Browse to `http://arduino_ip/`

### Send test webhook:
```bash
curl -X POST http://your_device_ip:5000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "alert": {"name": "Test Alert", "zone_id": 1},
    "aircraft": {
      "hex": "TEST123",
      "altitude": 500,
      "operator": "Test Airline"
    },
    "zone": {"name": "Test Zone"}
  }'
```

## Safety Notes

- Use appropriate resistors with LEDs (typically 220-330Ω)
- Don't exceed GPIO current limits (typically 20mA per pin)
- Use transistors or MOSFETs for high-current devices
- Add flyback diodes when using relays
- Consider using optocouplers for mains-powered devices
- Test alert volume levels appropriately for your environment