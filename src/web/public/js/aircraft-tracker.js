// Using shared WebSocket instead of creating our own
let reconnectTimer = null;
let currentAircraftMap = new Map();
let recentAircraftMap = new Map();
let trackerAreaId = null;
let trackerTimeRange = 1;

function initializeTracker(areaId, timeRange = 1) {
  trackerAreaId = areaId;
  trackerTimeRange = timeRange;
  updateTime();
  setInterval(updateTime, 1000);
  registerWithSharedWebSocket(areaId, timeRange);
}

function updateTime() {
  const now = new Date();
  const time = now.toTimeString().split(' ')[0];
  const timeElement = document.getElementById('current-time');
  if (timeElement) {
    timeElement.textContent = time;
  }
}

function registerWithSharedWebSocket(areaId, timeRange = 1) {
  // Register handlers with the shared WebSocket
  const handler = {
    onOpen: (ws) => {
      console.log('Aircraft tracker using shared WebSocket');
      updateConnectionStatus(true);
      clearTimeout(reconnectTimer);

      ws.send(JSON.stringify({
        type: 'subscribe',
        areaId: areaId,
        timeRange: timeRange
      }));
    },
    onMessage: (event) => {
      try {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    },
    onError: (error) => {
      console.error('Aircraft tracker WebSocket error:', error);
      updateConnectionStatus(false);
    },
    onClose: () => {
      console.log('Aircraft tracker WebSocket disconnected');
      updateConnectionStatus(false);
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

function scheduleReconnect(areaId) {
  // Reconnection is handled by the shared WebSocket
  // Just clear any timers we may have
  clearTimeout(reconnectTimer);
}

function updateConnectionStatus(connected) {
  const statusElement = document.getElementById('connection-status');
  if (statusElement) {
    if (connected) {
      statusElement.className = 'connection-status connected';
      statusElement.innerHTML = '<div class="status-indicator"></div><span>LIVE</span>';
    } else {
      statusElement.className = 'connection-status disconnected';
      statusElement.innerHTML = '<div class="status-indicator inactive"></div><span>OFFLINE</span>';
    }
  }
}

function handleWebSocketMessage(data) {
  console.log('WebSocket message received:', data.type, data);

  if (data.type === 'initial') {
    console.log('Initial data received, aircraft count:', data.aircraft?.length || 0);
    // Don't clear maps on subsequent initial messages if we already have data
    if (currentAircraftMap.size === 0 && recentAircraftMap.size === 0) {
      // First initial load - populate the maps
      data.aircraft.forEach(ac => {
        if (!ac.exitedAt) {
          currentAircraftMap.set(ac.icao24, ac);
        } else {
          recentAircraftMap.set(ac.icao24, ac);
        }
      });
      renderAircraftLists();
    } else {
      console.log('Ignoring initial message - already have data');
    }
  } else if (data.type === 'enter' || data.type === 'update') {
    console.log('Aircraft enter/update:', data.aircraft.icao24);
    // Aircraft entering or updating in zone
    currentAircraftMap.set(data.aircraft.icao24, data.aircraft);
    // Remove from recent if it was there
    recentAircraftMap.delete(data.aircraft.icao24);
    updateOrAddCurrentAircraft(data.aircraft);
  } else if (data.type === 'exit') {
    console.log('Aircraft exit:', data.aircraft.icao24);
    // Aircraft exiting zone
    const aircraft = currentAircraftMap.get(data.aircraft.icao24);
    if (aircraft) {
      // Update the aircraft object with exit data
      const exitedAircraft = {
        ...aircraft,
        ...data.aircraft,
        exitedAt: data.aircraft.exitedAt
      };
      // Move from current to recent
      currentAircraftMap.delete(data.aircraft.icao24);
      recentAircraftMap.set(data.aircraft.icao24, exitedAircraft);
      moveToRecentAircraft(exitedAircraft);
    }
  }

  updateCounts();
}

function renderAircraftLists() {
  renderCurrentAircraft();
  renderRecentAircraft();
}

function renderCurrentAircraft() {
  const currentContainer = document.getElementById('current-aircraft-container');
  if (!currentContainer) {
    // If containers don't exist, we might be on initial page load - recreate structure
    recreateAircraftContainers();
    return;
  }

  const currentArray = Array.from(currentAircraftMap.values());
  currentArray.sort((a, b) => {
    const timeA = new Date(a.enteredAt).getTime();
    const timeB = new Date(b.enteredAt).getTime();
    return timeB - timeA;
  });

  if (currentArray.length === 0) {
    // Hide current section if no current aircraft
    const currentSection = currentContainer.parentElement;
    if (currentSection) {
      currentSection.style.display = 'none';
    }
  } else {
    const currentSection = currentContainer.parentElement;
    if (currentSection) {
      currentSection.style.display = 'block';
    }

    currentContainer.innerHTML = '';
    currentArray.forEach(ac => {
      currentContainer.appendChild(createAircraftElement(ac, false));
    });
  }
}

function renderRecentAircraft() {
  const recentContainer = document.getElementById('recent-aircraft-container');
  if (!recentContainer) return;

  const recentArray = Array.from(recentAircraftMap.values());
  recentArray.sort((a, b) => {
    const timeA = new Date(a.exitedAt || a.enteredAt).getTime();
    const timeB = new Date(b.exitedAt || b.enteredAt).getTime();
    return timeB - timeA;
  });

  if (recentArray.length === 0) {
    // Hide recent section if no recent aircraft
    const recentSection = recentContainer.parentElement;
    if (recentSection) {
      recentSection.style.display = 'none';
    }
  } else {
    const recentSection = recentContainer.parentElement;
    if (recentSection) {
      recentSection.style.display = 'block';
    }

    recentContainer.innerHTML = '';
    recentArray.forEach(ac => {
      recentContainer.appendChild(createAircraftElement(ac, true));
    });
  }

  // Check if both lists are empty
  if (currentAircraftMap.size === 0 && recentAircraftMap.size === 0) {
    showNoDataMessage();
  } else {
    hideNoDataMessage();
  }
}

function recreateAircraftContainers() {
  // Find the main container where aircraft should be displayed
  const mainContent = document.querySelector('.screen-border');
  if (!mainContent) return;

  // Check if sections already exist
  const existingCurrentSection = document.getElementById('current-aircraft-container');
  const existingRecentSection = document.getElementById('recent-aircraft-container');

  // If sections already exist, don't recreate them
  if (existingCurrentSection && existingRecentSection) {
    return;
  }

  // Remove any existing no-data message
  const noDataElements = mainContent.querySelectorAll('.no-data');
  noDataElements.forEach(el => el.remove());

  // Create new structure only if it doesn't exist
  if (!existingCurrentSection) {
    const currentSection = document.createElement('div');
    currentSection.style.marginBottom = '30px';
    currentSection.innerHTML = `
      <h3 style="color: var(--green-bright); margin-bottom: 15px; font-size: 24px; border-bottom: 1px solid var(--green-dark); padding-bottom: 10px;">
        CURRENT AIRCRAFT IN ZONE
      </h3>
      <div id="current-aircraft-container" class="aircraft-grid"></div>
    `;

    // Insert before loading indicator or recent section
    const loadingDiv = mainContent.querySelector('#loading');
    const insertBefore = loadingDiv || existingRecentSection?.parentElement;
    if (insertBefore) {
      mainContent.insertBefore(currentSection, insertBefore);
    } else {
      mainContent.appendChild(currentSection);
    }
  }

  if (!existingRecentSection) {
    const recentSection = document.createElement('div');
    recentSection.style.marginBottom = '30px';
    recentSection.innerHTML = `
      <h3 style="color: var(--green-dim); margin-bottom: 15px; font-size: 24px; border-bottom: 1px solid var(--green-dark); padding-bottom: 10px;">
        RECENT AIRCRAFT (EXITED ZONE)
      </h3>
      <div id="recent-aircraft-container" class="aircraft-grid"></div>
    `;

    // Insert before loading indicator
    const loadingDiv = mainContent.querySelector('#loading');
    if (loadingDiv) {
      mainContent.insertBefore(recentSection, loadingDiv);
    } else {
      mainContent.appendChild(recentSection);
    }
  }

  renderAircraftLists();
}

function createAircraftElement(ac, isRecent) {
  const div = document.createElement('div');
  div.className = isRecent ? 'aircraft-item recent-aircraft' : 'aircraft-item current-aircraft';
  div.dataset.icao24 = ac.icao24;

  if (isRecent) {
    div.style.opacity = '0.7';
  }

  const enteredTime = new Date(ac.enteredAt).toTimeString().split(' ')[0];
  const exitedTime = ac.exitedAt ? new Date(ac.exitedAt).toTimeString().split(' ')[0] : null;

  div.innerHTML = `
    <div class="aircraft-id">
      ${ac.icao24.toUpperCase()}
      ${ac.callsign ? `<div style="font-size: 16px; color: var(--green-dim); margin-top: 5px;">${ac.callsign}</div>` : ''}
    </div>
    <div class="aircraft-details">
      <div class="detail-row">
        <span class="detail-label">ALT:</span>
        <span class="detail-value">${ac.altitude || '--'} ft</span>
        <span class="detail-label">SPD:</span>
        <span class="detail-value">${ac.speed ? Math.round(ac.speed) : '--'} kts</span>
        <span class="detail-label">HDG:</span>
        <span class="detail-value">${ac.track ? Math.round(ac.track) + '°' : '--'}</span>
      </div>
      ${(ac.manufacturer || ac.model) ? `
        <div class="detail-row">
          <span class="detail-label">TYPE:</span>
          <span class="detail-value">${[ac.manufacturer, ac.model].filter(Boolean).join(' ') || 'UNKNOWN'}</span>
        </div>
      ` : ''}
      ${ac.operator ? `
        <div class="detail-row">
          <span class="detail-label">OPER:</span>
          <span class="detail-value">${ac.operator}</span>
        </div>
      ` : ''}
    </div>
    <div class="aircraft-time">
      <div>ENTERED: ${enteredTime}</div>
      ${exitedTime ?
        `<div style="color: #ff6666;">EXITED: ${exitedTime}</div>` :
        `<div style="color: var(--green-bright);">IN ZONE</div>`
      }
    </div>
  `;

  div.style.animation = 'fadeIn 0.5s ease';

  return div;
}

function updateOrAddCurrentAircraft(aircraft) {
  let currentContainer = document.getElementById('current-aircraft-container');

  if (!currentContainer) {
    recreateAircraftContainers();
    currentContainer = document.getElementById('current-aircraft-container');
    if (!currentContainer) return;
  }

  // Show current section if it was hidden
  const currentSection = currentContainer.parentElement;
  if (currentSection && currentSection.style.display === 'none') {
    currentSection.style.display = 'block';
  }

  const existing = currentContainer.querySelector(`[data-icao24="${aircraft.icao24}"]`);

  if (existing) {
    // Update existing element
    const newElement = createAircraftElement(aircraft, false);
    existing.replaceWith(newElement);
    highlightElement(newElement);
  } else {
    // Add new element
    hideNoDataMessage();
    const newElement = createAircraftElement(aircraft, false);
    currentContainer.insertBefore(newElement, currentContainer.firstChild);
    highlightElement(newElement);
  }
}

function moveToRecentAircraft(aircraft) {
  // Remove from current
  const currentContainer = document.getElementById('current-aircraft-container');
  if (currentContainer) {
    const currentElement = currentContainer.querySelector(`[data-icao24="${aircraft.icao24}"]`);
    if (currentElement) {
      currentElement.remove();
    }

    // Hide current section if now empty
    if (currentContainer.children.length === 0) {
      const currentSection = currentContainer.parentElement;
      if (currentSection) {
        currentSection.style.display = 'none';
      }
    }
  }

  // Add to recent
  let recentContainer = document.getElementById('recent-aircraft-container');
  if (!recentContainer) {
    recreateAircraftContainers();
    recentContainer = document.getElementById('recent-aircraft-container');
    if (!recentContainer) return;
  }

  // Show recent section if it was hidden
  const recentSection = recentContainer.parentElement;
  if (recentSection && recentSection.style.display === 'none') {
    recentSection.style.display = 'block';
  }

  const newElement = createAircraftElement(aircraft, true);
  recentContainer.insertBefore(newElement, recentContainer.firstChild);
  highlightElement(newElement);
}

function highlightElement(element) {
  setTimeout(() => {
    element.style.background = 'rgba(0, 255, 0, 0.1)';
    setTimeout(() => {
      element.style.background = '';
    }, 1000);
  }, 100);
}

function updateCounts() {
  const currentCount = document.getElementById('current-count');
  if (currentCount) {
    currentCount.textContent = currentAircraftMap.size;
  }

  const recentCount = document.getElementById('recent-count');
  if (recentCount) {
    recentCount.textContent = recentAircraftMap.size;
  }
}

function showNoDataMessage() {
  // Remove any existing no data message
  hideNoDataMessage();

  const mainContent = document.querySelector('.screen-border');
  if (!mainContent) return;

  const noDataDiv = document.createElement('div');
  noDataDiv.className = 'no-data';
  noDataDiv.textContent = 'NO AIRCRAFT ACTIVITY IN LAST HOUR';

  const loadingDiv = mainContent.querySelector('#loading');
  if (loadingDiv) {
    mainContent.insertBefore(noDataDiv, loadingDiv);
  } else {
    mainContent.appendChild(noDataDiv);
  }
}

function hideNoDataMessage() {
  const noDataElement = document.querySelector('.no-data');
  if (noDataElement) {
    noDataElement.remove();
  }
}

const style = document.createElement('style');
style.textContent = `
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;
document.head.appendChild(style);