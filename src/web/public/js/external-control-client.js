// External Control Client for controlled views
(function() {
  // Check if we're in a controlled view
  if (!window.sessionId || !window.isControlled) {
    return;
  }

  console.log(`External control client initialized for session ${window.sessionId}`);
  console.log('Current path:', window.location.pathname);
  console.log('Is controlled:', window.isControlled);

  // We'll use the shared WebSocket instead of creating our own
  let reconnectTimer = null;
  let isTransitioning = false;
  let lastKnownState = null;
  let currentZoneId = null;
  let currentTimeRange = null;

  // Determine current zone if on area page
  if (window.location.pathname.includes('/area') && window.areaId) {
    currentZoneId = window.areaId;
    // Use the timeRange variable that's set in area.ejs
    if (window.timeRange) {
      currentTimeRange = window.timeRange;
    }
  }

  function registerWithWebSocket() {
    // Register handlers with the shared WebSocket
    const handler = {
      onOpen: (ws) => {
        console.log('External control using shared WebSocket');

        // Clear any reconnect timer
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }

        // Register as viewer with current view info
        const registrationMsg = {
          type: 'REGISTER_VIEWER',
          sessionId: sessionId,
          currentView: {}
        };

        // Include current view information to sync server state
        if (window.location.pathname.includes('/radar')) {
          registrationMsg.currentView.mode = 'radar';
          if (window.radarConfig && window.radarConfig.range) {
            registrationMsg.currentView.range = window.radarConfig.range;
          }
        } else if (window.location.pathname.includes('/area')) {
          if (window.areaId) {
            registrationMsg.currentView.mode = `zone_${window.areaId}`;
          }
          if (currentTimeRange) {
            registrationMsg.currentView.range = currentTimeRange;
          }
        }

        ws.send(JSON.stringify(registrationMsg));

        // Update WebSocket status indicator
        const wsIndicator = document.getElementById('ws-indicator');
        if (wsIndicator) {
          wsIndicator.classList.remove('error');
          wsIndicator.classList.add('status-indicator');
        }
      },
      onMessage: (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('External control received message:', data.type);

          if (data.type === 'STATE_UPDATE') {
            handleStateUpdate(data.state);
          } else if (data.type === 'SELECT_AIRCRAFT') {
            handleSelectAircraft(data.direction);
          }
        } catch (e) {
          // Not JSON, might be binary ping/pong frame
          // WebSocket handles ping/pong automatically, so we can ignore
        }
      },
      onError: (error) => {
        console.error('External control WebSocket error:', error);
      },
      onClose: () => {
        console.log('External control WebSocket disconnected');

        // Update WebSocket status indicator
        const wsIndicator = document.getElementById('ws-indicator');
        if (wsIndicator) {
          wsIndicator.classList.add('error');
        }
      }
    };

    // Add handler to the shared handlers array
    if (!window.wsMessageHandlers) {
      window.wsMessageHandlers = [];
    }
    window.wsMessageHandlers.push(handler);

    // If WebSocket is already open, call onOpen immediately
    if (window.sharedWebSocket && window.sharedWebSocket.readyState === WebSocket.OPEN) {
      handler.onOpen(window.sharedWebSocket);
    }
  }

  function handleStateUpdate(state) {
    // Prevent handling updates during transition
    if (isTransitioning) {
      return;
    }

    // Check if this is the same state we already have
    if (lastKnownState && JSON.stringify(lastKnownState) === JSON.stringify(state)) {
      return;
    }

    lastKnownState = state;

    // Check if we're on the radar page
    if (window.location.pathname.includes('/radar')) {
      handleRadarStateUpdate(state);
    }
    // Check if we're on the area page
    else if (window.location.pathname.includes('/area')) {
      handleAreaStateUpdate(state);
    }
  }

  function transitionToView(url) {
    if (isTransitioning) return;

    isTransitioning = true;

    // Add channel change animation if available
    if (window.startChannelChange) {
      window.startChannelChange(() => {
        window.location.href = url;
      });
    } else {
      window.location.href = url;
    }
  }

  function handleRadarStateUpdate(state) {
    console.log('Handling radar state update:', state);

    // Check if mode changed from radar to zone
    if (state.mode && state.mode !== 'radar' && state.mode.startsWith('zone_')) {
      // Transition to area view
      transitionToView(`/${sessionId}/area`);
      return;
    }

    // Update range
    if (state.range && window.radarConfig && state.range !== window.radarConfig.range) {
      console.log(`Updating radar range from ${window.radarConfig.range} to ${state.range}`);
      const oldRange = window.radarConfig.range;
      window.radarConfig.range = state.range;

      // Update range display
      const rangeDisplay = document.getElementById('range-display');
      if (rangeDisplay) {
        rangeDisplay.textContent = `${state.range} MI`;
      }

      // Update range ring labels
      const range25 = document.getElementById('range-25');
      const range50 = document.getElementById('range-50');
      const range75 = document.getElementById('range-75');

      if (range25) range25.textContent = `${(state.range * 0.25).toFixed(1)} mi`;
      if (range50) range50.textContent = `${(state.range * 0.5).toFixed(1)} mi`;
      if (range75) range75.textContent = `${(state.range * 0.75).toFixed(1)} mi`;

      // Update radar display if available
      if (window.radarDisplay) {
        console.log('Updating radarDisplay with new range');
        // Update the pixels per mile calculation
        window.radarDisplay.config.range = state.range;
        window.radarDisplay.pixelsPerMile = window.radarDisplay.radius / state.range;

        // Clear aircraft trails since they're at the old scale
        window.radarDisplay.aircraftTrails.clear();

        // Redraw the grid and aircraft
        window.radarDisplay.drawRadarGrid();
        window.radarDisplay.drawAircraft();
      } else {
        console.log('radarDisplay not available yet, will apply range on next draw');
      }
    }

    // Update zones enabled/disabled
    if (typeof state.zonesEnabled !== 'undefined') {
      const zonesStatus = document.getElementById('zones-status');
      if (zonesStatus) {
        zonesStatus.textContent = state.zonesEnabled ? 'ON' : 'OFF';
      }

      // For zones, we need to reload to get the zones data from server
      // since the zones aren't sent in the WebSocket message
      if (window.radarConfig && window.radarConfig.zones) {
        const hasZones = window.radarConfig.zones.length > 0;
        const wantsZones = state.zonesEnabled;

        // Only reload if there's a mismatch between what we have and what we want
        if ((hasZones && !wantsZones) || (!hasZones && wantsZones)) {
          // Use transitionToView to reload current page with animation
          transitionToView(window.location.pathname);
        }
      }
    }
  }

  function handleAreaStateUpdate(state) {
    // Check if mode changed to radar
    if (state.mode === 'radar') {
      // Transition to radar view
      transitionToView(`/${sessionId}/radar`);
      return;
    }

    // Check if we need to switch to a different zone
    if (state.mode && state.mode.startsWith('zone_')) {
      const newZoneId = parseInt(state.mode.replace('zone_', ''));
      const currentPath = window.location.pathname;

      // Check if we're already on the area page
      if (!currentPath.includes(`/area`)) {
        // Transition to area view (server will handle which zone to show)
        transitionToView(`/${sessionId}/area`);
      } else if (currentZoneId !== newZoneId) {
        // We're on area page but need to change zone
        const oldZoneId = currentZoneId;
        currentZoneId = newZoneId;
        // Always use transitionToView for consistent channel change animation between zones
        console.log(`Switching from zone ${oldZoneId} to zone ${newZoneId}`);
        transitionToView(`/${sessionId}/area`);
      }
      // If we're already on the correct zone, don't reload
    }

    // Update time range only if it actually changed
    if (state.range && state.range !== currentTimeRange) {
      const oldTimeRange = currentTimeRange;
      currentTimeRange = state.range;

      const timeRangeDisplay = document.getElementById('time-range-display');
      const timeRangeUnit = document.getElementById('time-range-unit');

      if (timeRangeDisplay) {
        timeRangeDisplay.textContent = state.range;
      }

      if (timeRangeUnit) {
        timeRangeUnit.textContent = state.range === 1 ? 'HOUR' : 'HOURS';
      }

      // For area views, time range changes need a reload to fetch different historical data
      // The exited aircraft list depends on the time range
      if (oldTimeRange !== null && oldTimeRange !== undefined) {
        console.log(`Time range changed from ${oldTimeRange} to ${state.range}, reloading to fetch new data`);
        transitionToView(`/${sessionId}/area`);
      }
    }
  }

  function handleSelectAircraft(direction) {
    console.log('SELECT aircraft:', direction);

    // Check if we're on radar view
    if (window.location.pathname.includes('/radar')) {
      if (!window.radarDisplay) {
        console.log('Radar display not available');
        return;
      }
      handleRadarSelectAircraft(direction);
    }
    // Check if we're on area/zone view
    else if (window.location.pathname.includes('/area')) {
      handleAreaSelectAircraft(direction);
    } else {
      console.log('Not on radar or area view');
      return;
    }
  }

  function handleRadarSelectAircraft(direction) {
    const radar = window.radarDisplay;

    // Get all sidebar items in their display order
    const sidebarItems = document.querySelectorAll('.aircraft-item-sidebar');
    console.log('Found', sidebarItems.length, 'sidebar items');

    if (sidebarItems.length === 0) {
      console.log('No aircraft in sidebar');
      return;
    }

    // Debug: log all items
    sidebarItems.forEach((item, index) => {
      console.log(`Item ${index}: icao=${item.dataset.icao}, selected=${item.classList.contains('selected')}`);
    });

    // Find currently selected item index based on radar's selectedAircraft
    let currentIndex = -1;
    if (radar.selectedAircraft) {
      sidebarItems.forEach((item, index) => {
        if (item.dataset.icao === radar.selectedAircraft) {
          currentIndex = index;
          console.log(`Found selected aircraft ${radar.selectedAircraft} at index ${index}`);
        }
      });
    }

    console.log('Current selection:', radar.selectedAircraft, 'at index:', currentIndex);

    let nextIndex;

    if (direction === 'forward') {
      // Moving down the list
      if (currentIndex === -1) {
        // Nothing selected, start at top
        nextIndex = 0;
      } else if (currentIndex === sidebarItems.length - 1) {
        // At bottom, deselect
        nextIndex = -1;
      } else {
        // Move down
        nextIndex = currentIndex + 1;
      }
    } else {
      // Moving up the list (backward)
      if (currentIndex === -1) {
        // Nothing selected, start at bottom
        nextIndex = sidebarItems.length - 1;
      } else if (currentIndex === 0) {
        // At top, deselect
        nextIndex = -1;
      } else {
        // Move up
        nextIndex = currentIndex - 1;
      }
    }

    console.log('Next index:', nextIndex);

    // Apply new selection
    if (nextIndex === -1) {
      // Deselect
      radar.selectAircraft(null);
      console.log('Deselected aircraft');
    } else {
      // Select the item at nextIndex
      const selectedItem = sidebarItems[nextIndex];
      const icao24 = selectedItem.dataset.icao;

      radar.selectAircraft(icao24);

      // Scroll into view
      selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      console.log('Selected aircraft:', icao24, 'at position', nextIndex);
    }
  }

  function handleAreaSelectAircraft(direction) {
    console.log('Handling area SELECT aircraft:', direction);

    // Check if mini radar instance exists
    if (!window.miniRadarInstance) {
      console.log('Mini radar instance not available yet');
      return;
    }

    const miniRadar = window.miniRadarInstance;

    // Get all aircraft from the mini radar
    const aircraftArray = Array.from(miniRadar.aircraft.values());
    console.log('Total aircraft in mini radar:', aircraftArray.length);

    // Filter to only aircraft that are in the zone and visible on radar
    const visibleAircraft = aircraftArray.filter(ac => {
      // Check if in zone
      if (!ac.inZone) return false;

      // Check if within radar range
      const dist = miniRadar.getDistanceFromCenter(ac.lat, ac.lon);
      return dist <= miniRadar.range;
    });

    console.log('Visible aircraft in zone:', visibleAircraft.length);

    if (visibleAircraft.length === 0) {
      console.log('No aircraft in zone to select');
      return;
    }

    // Sort aircraft by hex for consistent ordering
    visibleAircraft.sort((a, b) => a.hex.localeCompare(b.hex));

    // Find currently selected aircraft index
    let currentIndex = -1;
    if (miniRadar.selectedAircraft) {
      currentIndex = visibleAircraft.findIndex(ac => ac.hex === miniRadar.selectedAircraft.hex);
      console.log(`Currently selected: ${miniRadar.selectedAircraft.hex} at index ${currentIndex}`);
    } else {
      console.log('No aircraft currently selected');
    }

    let nextIndex;

    if (direction === 'forward') {
      if (currentIndex === -1) {
        nextIndex = 0; // Start at first
      } else if (currentIndex === visibleAircraft.length - 1) {
        // At last aircraft, deselect
        console.log('At last aircraft, deselecting');
        miniRadar.clearSelection();
        return;
      } else {
        nextIndex = currentIndex + 1; // Move forward
      }
    } else { // backward
      if (currentIndex === -1) {
        nextIndex = visibleAircraft.length - 1; // Start at last
      } else if (currentIndex === 0) {
        // At first aircraft going backward, deselect
        console.log('At first aircraft, deselecting');
        miniRadar.clearSelection();
        return;
      } else {
        nextIndex = currentIndex - 1; // Move backward
      }
    }

    // Select the aircraft
    const selectedAircraft = visibleAircraft[nextIndex];
    console.log(`Selecting aircraft: ${selectedAircraft.hex} at index ${nextIndex}`);

    // Pass the full aircraft object to selectAircraft
    miniRadar.selectAircraft(selectedAircraft);
  }

  // Register with shared WebSocket on page load
  registerWithWebSocket();

  // Clean up on page unload is handled by the shared WebSocket
})();