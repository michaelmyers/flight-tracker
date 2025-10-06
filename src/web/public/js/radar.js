class RadarDisplay {
  constructor(config) {
    this.config = config;
    this.canvas = document.getElementById('radar-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.aircraft = new Map();
    this.selectedAircraft = null;
    this.sidebarCollapsed = false;
    this.aircraftTrails = new Map(); // Store position history for trails
    this.altitudeHistory = new Map(); // Store altitude history for climb/descent indicators

    this.setupCanvas();
    this.setupEventListeners();
    this.startRadar();
  }

  setupCanvas() {
    const resizeCanvas = () => {
      const container = this.canvas.parentElement;
      const containerRect = container.getBoundingClientRect();

      // Calculate responsive padding based on viewport
      const viewportMin = Math.min(window.innerWidth, window.innerHeight);
      const padding = Math.max(10, viewportMin * 0.02); // 2% of smallest viewport dimension, minimum 10px

      // Calculate the maximum size that fits in the container
      const maxWidth = containerRect.width - (padding * 2);
      const maxHeight = containerRect.height - (padding * 2);

      // Keep it square and fit within available space
      // For small screens, use smaller percentage to prevent cutoff
      const maxPercent = viewportMin <= 600 ? 0.75 : 0.85; // Smaller on compact screens
      const size = Math.min(maxWidth, maxHeight, viewportMin * maxPercent);

      // Set canvas dimensions
      this.canvas.width = size;
      this.canvas.height = size;
      this.centerX = size / 2;
      this.centerY = size / 2;

      // Responsive radius with minimum margin
      const marginPercent = viewportMin < 600 ? 0.02 : 0.025; // Smaller margin on small screens
      this.radius = (size / 2) * (1 - marginPercent);

      this.pixelsPerMile = this.radius / this.config.range;
      this.drawRadarGrid();
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
  }

  setupEventListeners() {
    this.canvas.addEventListener('click', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      this.handleRadarClick(x, y);
    });
  }

  drawRadarGrid() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw clean black background
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
    this.ctx.beginPath();
    this.ctx.arc(this.centerX, this.centerY, this.radius, 0, 2 * Math.PI);
    this.ctx.fill();

    // Draw zones if configured
    this.drawZones();

    // Draw range rings
    this.ctx.strokeStyle = 'rgba(0, 255, 0, 0.3)';
    this.ctx.lineWidth = 1;

    for (let i = 1; i <= 4; i++) {
      this.ctx.beginPath();
      this.ctx.arc(this.centerX, this.centerY, (this.radius / 4) * i, 0, 2 * Math.PI);
      this.ctx.stroke();
    }

    // Draw cross lines
    this.ctx.beginPath();
    this.ctx.moveTo(this.centerX - this.radius, this.centerY);
    this.ctx.lineTo(this.centerX + this.radius, this.centerY);
    this.ctx.moveTo(this.centerX, this.centerY - this.radius);
    this.ctx.lineTo(this.centerX, this.centerY + this.radius);
    this.ctx.stroke();

    // Draw diagonal lines
    this.ctx.strokeStyle = 'rgba(0, 255, 0, 0.15)';
    const offset = this.radius * 0.707; // 45 degree offset
    this.ctx.beginPath();
    this.ctx.moveTo(this.centerX - offset, this.centerY - offset);
    this.ctx.lineTo(this.centerX + offset, this.centerY + offset);
    this.ctx.moveTo(this.centerX - offset, this.centerY + offset);
    this.ctx.lineTo(this.centerX + offset, this.centerY - offset);
    this.ctx.stroke();

    // Update range labels
    document.getElementById('range-25').textContent = `${(this.config.range * 0.25).toFixed(1)} mi`;
    document.getElementById('range-50').textContent = `${(this.config.range * 0.5).toFixed(1)} mi`;
    document.getElementById('range-75').textContent = `${(this.config.range * 0.75).toFixed(1)} mi`;
  }

  drawZones() {
    if (!this.config.zones || this.config.zones.length === 0) return;

    this.config.zones.forEach(zone => {
      if (!zone.polygon) return;

      const polygon = JSON.parse(zone.polygon);
      if (!polygon || polygon.length < 3) return;

      // Convert polygon coordinates to radar coordinates
      const radarPoints = polygon.map(point => {
        const [lat, lon] = point;
        return this.latLonToRadar(lat, lon);
      });

      // Draw zone polygon
      this.ctx.strokeStyle = 'rgba(255, 255, 0, 0.3)';
      this.ctx.fillStyle = 'rgba(255, 255, 0, 0.05)';
      this.ctx.lineWidth = 1;

      this.ctx.beginPath();
      radarPoints.forEach((point, index) => {
        if (index === 0) {
          this.ctx.moveTo(point.x, point.y);
        } else {
          this.ctx.lineTo(point.x, point.y);
        }
      });
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.stroke();

      // Draw zone name label
      // Calculate center of polygon for label placement
      const centerX = radarPoints.reduce((sum, p) => sum + p.x, 0) / radarPoints.length;
      const centerY = radarPoints.reduce((sum, p) => sum + p.y, 0) / radarPoints.length;

      this.ctx.font = '14px VT323, monospace';
      this.ctx.fillStyle = 'rgba(255, 255, 0, 0.7)';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(zone.name, centerX, centerY);
    });
  }

  latLonToRadar(lat, lon) {
    // Calculate distance and bearing from center
    const latRad = lat * Math.PI / 180;
    const lonRad = lon * Math.PI / 180;
    const centerLatRad = this.config.centerLat * Math.PI / 180;
    const centerLonRad = this.config.centerLon * Math.PI / 180;

    const dLat = latRad - centerLatRad;
    const dLon = lonRad - centerLonRad;

    // Haversine formula for distance
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(centerLatRad) * Math.cos(latRad) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distanceKm = 6371 * c; // Earth radius in km
    const distanceMiles = distanceKm * 0.621371;

    // Calculate bearing
    const y = Math.sin(dLon) * Math.cos(latRad);
    const x = Math.cos(centerLatRad) * Math.sin(latRad) -
              Math.sin(centerLatRad) * Math.cos(latRad) * Math.cos(dLon);
    const bearing = Math.atan2(y, x);

    // Convert to radar coordinates
    const radarDistance = distanceMiles * this.pixelsPerMile;
    const radarX = this.centerX + radarDistance * Math.sin(bearing);
    const radarY = this.centerY - radarDistance * Math.cos(bearing);

    return { x: radarX, y: radarY, distance: distanceMiles };
  }

  getAircraftIcon(aircraft) {
    const type = (aircraft.type || '').toLowerCase();
    const category = (aircraft.category || '').toLowerCase();
    const model = (aircraft.model || '').toLowerCase();

    // Check for helicopter - A7 is the ICAO class for helicopters
    // Also check for specific helicopter patterns
    if (category === 'a7' || category === 'A7') {
      return { icon: '△', class: 'helicopter' };
    }

    const heliPatterns = ['heli', 'h60', 'uh-', 'ah-', 'ec1', 'ec3', 'ec5',
                          'as3', 'aw1', 'bell', 'r44', 'r66', 'b06', 'b407',
                          'b412', 's76', 's92', 'aw139', 'aw189'];
    const isHelicopter = heliPatterns.some(pattern =>
      type.includes(pattern) || model.includes(pattern)
    );

    if (isHelicopter) {
      return { icon: '△', class: 'helicopter' };
    }

    // Check for military - keep star as it's omnidirectional
    if (type.includes('mil') || type.includes('f-') || type.includes('c-') ||
        type.includes('kc') || type.includes('e-')) {
      return { icon: '★', class: 'military' };
    }

    // Check for airliner - use airplane icon
    // ICAO classes: A1/A2 = small, A3/A4/A5/A6 = large, A7 = helicopter
    if (category === 'a3' || category === 'A3' ||
        category === 'a4' || category === 'A4' ||
        category === 'a5' || category === 'A5' ||
        category === 'a6' || category === 'A6' ||
        type.includes('a3') || type.includes('b7') || type.includes('b73') ||
        type.includes('b74') || type.includes('b75') || type.includes('b76') ||
        type.includes('b77') || type.includes('b78') || type.includes('a32') ||
        type.includes('a33') || type.includes('a34') || type.includes('a35') ||
        type.includes('a38') || category === 'large' ||
        model.includes('737') || model.includes('747') || model.includes('757') ||
        model.includes('767') || model.includes('777') || model.includes('787') ||
        model.includes('a320') || model.includes('a330') || model.includes('a340') ||
        model.includes('a350') || model.includes('a380')) {
      return { icon: '✈', class: 'airliner' };
    }

    // Default to small aircraft - use small triangle
    return { icon: '▴', class: 'small' };
  }

  updateAltitudeHistory() {
    const maxHistoryLength = 5; // Keep last 5 altitude readings
    const now = Date.now();

    this.aircraft.forEach((aircraft, id) => {
      if (aircraft.altitude !== null && aircraft.altitude !== undefined) {
        // Get or create altitude history for this aircraft
        if (!this.altitudeHistory.has(id)) {
          this.altitudeHistory.set(id, []);
        }

        const history = this.altitudeHistory.get(id);

        // Add current altitude with timestamp
        history.push({
          altitude: aircraft.altitude,
          time: now
        });

        // Keep only recent history
        if (history.length > maxHistoryLength) {
          history.shift();
        }
      }
    });

    // Clean up old aircraft altitude history
    for (const [id, history] of this.altitudeHistory) {
      if (!this.aircraft.has(id)) {
        this.altitudeHistory.delete(id);
      }
    }
  }

  getAltitudeTrend(aircraftId) {
    const history = this.altitudeHistory.get(aircraftId);
    if (!history || history.length < 3) return 'level';

    // Calculate average rate of change over last few readings
    let totalChange = 0;
    let samples = 0;

    for (let i = 1; i < history.length; i++) {
      const timeDiff = (history[i].time - history[i-1].time) / 1000; // seconds
      if (timeDiff > 0) {
        const altChange = history[i].altitude - history[i-1].altitude;
        const ratePerMin = (altChange / timeDiff) * 60;
        totalChange += ratePerMin;
        samples++;
      }
    }

    if (samples === 0) return 'level';

    const avgRatePerMin = totalChange / samples;

    // Thresholds: > 100 ft/min climbing, < -100 ft/min descending
    if (avgRatePerMin > 100) return 'climbing';
    if (avgRatePerMin < -100) return 'descending';
    return 'level';
  }

  updateAircraftTrails() {
    const maxTrailLength = 5; // Keep last 5 positions
    const now = Date.now();

    this.aircraft.forEach((aircraft, id) => {
      const pos = this.latLonToRadar(aircraft.lat, aircraft.lon);

      // Only track if within range and above altitude floor
      if (pos.distance <= this.config.range && (aircraft.altitude || 0) >= 200) {
        // Get or create trail for this aircraft
        let trail = this.aircraftTrails.get(id) || [];

        // Add current position with timestamp
        trail.push({ x: pos.x, y: pos.y, time: now });

        // Keep only recent positions (last 30 seconds)
        trail = trail.filter(p => now - p.time < 30000);

        // Limit trail length
        if (trail.length > maxTrailLength) {
          trail = trail.slice(-maxTrailLength);
        }

        this.aircraftTrails.set(id, trail);
      }
    });

    // Clean up trails for aircraft no longer in range
    for (const [id, trail] of this.aircraftTrails.entries()) {
      if (!this.aircraft.has(id) || trail.every(p => now - p.time > 30000)) {
        this.aircraftTrails.delete(id);
      }
    }
  }

  drawTrails() {
    const now = Date.now();

    this.aircraftTrails.forEach((trail, id) => {
      if (trail.length < 2) return;

      // Draw trail as fading line segments
      for (let i = 1; i < trail.length; i++) {
        const prev = trail[i - 1];
        const curr = trail[i];

        // Calculate opacity based on age (fade over 30 seconds)
        const age = now - prev.time;
        const opacity = Math.max(0, 1 - (age / 30000)) * 0.4;

        if (opacity > 0) {
          this.ctx.strokeStyle = `rgba(0, 255, 0, ${opacity})`;
          this.ctx.lineWidth = 1;
          this.ctx.beginPath();
          this.ctx.moveTo(prev.x, prev.y);
          this.ctx.lineTo(curr.x, curr.y);
          this.ctx.stroke();
        }
      }
    });
  }

  drawAircraft() {
    // Update altitude history and trails before drawing
    this.updateAltitudeHistory();
    this.updateAircraftTrails();

    // Clear aircraft blips and labels from DOM
    document.querySelectorAll('.aircraft-blip, .aircraft-label').forEach(el => el.remove());

    this.aircraft.forEach((aircraft, id) => {
      const pos = this.latLonToRadar(aircraft.lat, aircraft.lon);

      // Only draw if within radar range and above altitude floor (200 ft)
      if (pos.distance <= this.config.range && (aircraft.altitude || 0) >= 200) {
        const { icon, class: iconClass } = this.getAircraftIcon(aircraft);

        // Create DOM element for aircraft icon
        const blip = document.createElement('div');
        blip.className = `aircraft-blip ${iconClass}`;
        blip.dataset.icao24 = aircraft.icao24;

        // Position relative to canvas position in container
        const canvasRect = this.canvas.getBoundingClientRect();
        const containerRect = this.canvas.parentElement.getBoundingClientRect();
        const offsetX = canvasRect.left - containerRect.left;
        const offsetY = canvasRect.top - containerRect.top;

        blip.style.left = `${pos.x + offsetX}px`;
        blip.style.top = `${pos.y + offsetY}px`;
        blip.textContent = icon;

        if (this.selectedAircraft === aircraft.icao24) {
          blip.classList.add('selected');
        }

        // Add stale indicator if no recent update (after 30 seconds)
        const now = Date.now();
        if (aircraft.lastUpdate && now - aircraft.lastUpdate > 30000) {
          blip.classList.add('stale');
        }

        // Add rotation for heading if available
        // Note: track is in degrees where 0° is north, 90° is east, etc.
        // Airplane icon needs -90° offset as it points right by default, but north is 0°
        const baseRotation = iconClass === 'airliner' ? -90 : 0;
        const rotation = aircraft.track !== null && aircraft.track !== undefined ? aircraft.track + baseRotation : baseRotation;
        blip.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;

        this.canvas.parentElement.appendChild(blip);

        // Create metadata label below aircraft
        const label = document.createElement('div');
        label.className = 'aircraft-label';
        label.dataset.icao24 = aircraft.icao24;
        label.style.left = `${pos.x + offsetX}px`;
        label.style.top = `${pos.y + offsetY + 25}px`;

        // Get altitude trend
        const trend = this.getAltitudeTrend(aircraft.icao24);
        const trendSymbol = trend === 'climbing' ? '↑' : trend === 'descending' ? '↓' : '';
        const trendClass = trend !== 'level' ? `trend-${trend}` : '';

        // Build label HTML with styled altitude
        const labelParts = [];

        // Callsign/Registration (fixed width)
        const idText = aircraft.registration || aircraft.callsign || aircraft.icao24.toUpperCase();
        labelParts.push(`<span class="label-id">${idText}</span>`);

        // Altitude with full value
        if (aircraft.altitude !== null && aircraft.altitude !== undefined) {
          const altFormatted = aircraft.altitude.toLocaleString();
          const altText = trendSymbol ?
            `${altFormatted} ft<span class="trend-arrow">${trendSymbol}</span>` :
            `${altFormatted} ft`;
          labelParts.push(`<span class="alt-value ${trendClass}">${altText}</span>`);
        } else {
          labelParts.push(`<span class="alt-value">---- ft</span>`);
        }

        // Speed (fixed width)
        const speedText = aircraft.speed ? `${Math.round(aircraft.speed)}kt` : '---kt';
        labelParts.push(`<span class="label-speed">${speedText}</span>`);

        label.innerHTML = labelParts.join(' ');

        if (this.selectedAircraft === aircraft.icao24) {
          label.classList.add('selected');
        }

        this.canvas.parentElement.appendChild(label);

        // Add click handlers
        [blip, label].forEach(el => {
          el.addEventListener('click', () => {
            this.selectAircraft(aircraft.icao24);
          });
        });
      }
    });
  }

  updateSidebar() {
    const list = document.getElementById('aircraft-list');
    list.innerHTML = '';

    let targetCount = 0;

    this.aircraft.forEach(aircraft => {
      const pos = this.latLonToRadar(aircraft.lat, aircraft.lon);
      if (pos.distance > this.config.range || (aircraft.altitude || 0) < 200) return;

      targetCount++;

      const item = document.createElement('div');
      item.className = 'aircraft-item-sidebar';
      item.dataset.icao = aircraft.icao24;  // Add data attribute for external control
      if (this.selectedAircraft === aircraft.icao24) {
        item.classList.add('selected');
      }

      // Build aircraft details with available metadata
      const callsignOrReg = aircraft.callsign || aircraft.registration || '';
      const aircraftType = [aircraft.manufacturer, aircraft.model].filter(Boolean).join(' ') ||
                           aircraft.type || '';
      const category = aircraft.category || '';
      const operator = aircraft.operator || '';

      // Get the icon for this aircraft
      const { icon, class: iconClass } = this.getAircraftIcon(aircraft);

      // Get altitude trend
      const trend = this.getAltitudeTrend(aircraft.icao24);
      const trendSymbol = trend === 'climbing' ? '↑' : trend === 'descending' ? '↓' : '';
      const trendClass = trend !== 'level' ? `trend-${trend}` : '';
      const trendArrow = trendSymbol ? `<span class="trend-arrow">${trendSymbol}</span>` : '';

      item.innerHTML = `
        <div class="aircraft-id">
          ${aircraft.icao24.toUpperCase()}
          <span class="aircraft-icon-sidebar ${iconClass}">${icon}</span>
          ${callsignOrReg ? `<span class="aircraft-callsign">${callsignOrReg}</span>` : ''}
        </div>
        <div class="aircraft-info">
          <span class="altitude-info ${trendClass}">ALT: ${aircraft.altitude || '--'} ft${trendArrow}</span>
          <span>SPD: ${aircraft.speed ? Math.round(aircraft.speed) : '--'} kts</span>
          <span>${pos.distance.toFixed(1)} mi</span>
        </div>
        ${aircraftType || category || operator ? `
          <div class="aircraft-metadata">
            ${aircraftType ? `<div class="metadata-row">TYPE: ${aircraftType}</div>` : ''}
            ${category ? `<div class="metadata-row">CLASS: ${category}</div>` : ''}
            ${operator ? `<div class="metadata-row">OPER: ${operator}</div>` : ''}
          </div>
        ` : ''}
      `;

      item.addEventListener('click', () => {
        this.selectAircraft(aircraft.icao24);
      });

      list.appendChild(item);
    });

    document.getElementById('target-count').textContent = targetCount;
  }

  selectAircraft(icao24) {
    this.selectedAircraft = icao24;
    this.drawAircraft();
    this.updateSidebar();
  }

  getDistanceFromCenter(lat, lon) {
    // Calculate distance from radar center in miles
    const distance = this.calculateDistance(this.config.centerLat, this.config.centerLon, lat, lon);
    return distance;
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    // Haversine formula to calculate distance in miles
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  handleRadarClick(x, y) {
    // Find closest aircraft to click
    let closestAircraft = null;
    let closestDistance = 20; // Max click distance in pixels

    this.aircraft.forEach(aircraft => {
      const pos = this.latLonToRadar(aircraft.lat, aircraft.lon);
      const distance = Math.sqrt(Math.pow(x - pos.x, 2) + Math.pow(y - pos.y, 2));

      if (distance < closestDistance) {
        closestDistance = distance;
        closestAircraft = aircraft.icao24;
      }
    });

    if (closestAircraft) {
      this.selectAircraft(closestAircraft);
    }
  }

  async fetchAircraft() {
    try {
      // Fetch all aircraft - no area filter needed for antenna-based radar
      const response = await fetch(`/aircraft/live`);
      const data = await response.json();

      // Track which aircraft we received updates for
      const updatedAircraft = new Set();

      // Update aircraft map with timestamps
      data.forEach(ac => {
        if (ac.lat && ac.lon) {
          ac.lastUpdate = Date.now();
          this.aircraft.set(ac.icao24, ac);
          updatedAircraft.add(ac.icao24);
        }
      });

      // Remove stale aircraft (not in latest update or haven't moved in 60 seconds)
      const staleThreshold = 60000; // 60 seconds
      const now = Date.now();

      for (const [icao24, aircraft] of this.aircraft.entries()) {
        // Remove if not in latest update OR if hasn't been updated in threshold time
        if (!updatedAircraft.has(icao24) ||
            (aircraft.lastUpdate && now - aircraft.lastUpdate > staleThreshold)) {
          this.aircraft.delete(icao24);
          // Clear selection if this was the selected aircraft
          if (this.selectedAircraft === icao24) {
            this.selectedAircraft = null;
          }
        }
      }

      this.drawRadarGrid();
      this.drawTrails(); // Draw trails on the radar canvas
      this.drawAircraft();
      this.updateSidebar();
    } catch (error) {
      console.error('Error fetching aircraft:', error);
    }
  }

  startRadar() {
    // Update time display
    const updateTime = () => {
      const now = new Date();
      document.getElementById('current-time').textContent = now.toTimeString().split(' ')[0];
    };
    updateTime();
    setInterval(updateTime, 1000);

    // Start fetching aircraft data
    // Use pollingRate for data updates, or fall back to refreshRate
    const pollInterval = this.config.pollingRate || this.config.refreshRate || 1;
    this.fetchAircraft();
    setInterval(() => this.fetchAircraft(), pollInterval * 1000);

    // Update the display to show actual polling rate
    const refreshDisplay = document.getElementById('refresh-display');
    if (refreshDisplay) {
      refreshDisplay.textContent = `${pollInterval}s`;
    }
  }
}

// Initialize radar when page loads
document.addEventListener('DOMContentLoaded', () => {
  // Create radar display and make it globally accessible for external control
  window.radarDisplay = new RadarDisplay(radarConfig);
});