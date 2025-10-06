import { WebSocket } from "ws";
import EventEmitter from "events";

export const controlEvents = new EventEmitter();

interface Session {
  id: string;
  viewers: Set<WebSocket>;
  controllers: Set<WebSocket>;
  currentView: {
    mode: string; // 'radar' or zone id
    range?: number; // hours for zone, miles for radar
    zonesEnabled?: boolean; // for radar view
    selectedAircraft?: string; // ICAO24 of selected aircraft on radar
  };
  createdAt: Date;
  lastActivity: Date;
}

interface ControlMessage {
  type: "MODE" | "RANGE" | "ZONES" | "SELECT" | "REGISTER_VIEWER" | "REGISTER_CONTROLLER" | "STATE_REQUEST";
  sessionId: string;
  value?: any;
  direction?: "forward" | "backward";
  currentView?: {
    mode?: string;
    range?: number;
  };
}

interface StateUpdate {
  type: "STATE_UPDATE";
  sessionId: string;
  state: {
    mode: string;
    range: number;
    zonesEnabled: boolean;
  };
}

class ExternalControlManager {
  private sessions: Map<string, Session> = new Map();
  private wsToSession: Map<WebSocket, string> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up inactive sessions every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveSessions();
    }, 5 * 60 * 1000);
  }

  generateSessionId(): string {
    let id: string;
    do {
      id = Math.floor(1000 + Math.random() * 9000).toString();
    } while (this.sessions.has(id));
    return id;
  }

  createSession(id?: string): string {
    const sessionId = id || this.generateSessionId();

    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        id: sessionId,
        viewers: new Set(),
        controllers: new Set(),
        currentView: {
          mode: "radar",
          range: 10, // Default 10 miles for radar
          zonesEnabled: false
        },
        createdAt: new Date(),
        lastActivity: new Date()
      });
    }

    return sessionId;
  }

  getSession(sessionId: string): Session | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
    }
    return session;
  }

  registerViewer(sessionId: string, ws: WebSocket, currentView?: any): boolean {
    const session = this.getSession(sessionId);
    if (!session) return false;

    session.viewers.add(ws);
    this.wsToSession.set(ws, sessionId);

    // If viewer provided their current view, update session to match
    // This prevents unnecessary reloads when viewer is already on correct page
    if (currentView) {
      let needsUpdate = false;

      if (currentView.mode && currentView.mode !== session.currentView.mode) {
        session.currentView.mode = currentView.mode;
        needsUpdate = true;
      }

      if (currentView.range && currentView.range !== session.currentView.range) {
        session.currentView.range = currentView.range;
        needsUpdate = true;
      }

      // If session was updated, broadcast to controllers
      if (needsUpdate) {
        this.broadcastToControllers(session);
      }
    }

    // Send current state to new viewer
    this.sendStateToClient(ws, session);

    return true;
  }

  private broadcastToControllers(session: Session): void {
    const update: StateUpdate = {
      type: "STATE_UPDATE",
      sessionId: session.id,
      state: {
        mode: session.currentView.mode,
        range: session.currentView.range || 10,
        zonesEnabled: session.currentView.zonesEnabled || false
      }
    };

    const message = JSON.stringify(update);

    // Only send to controllers
    session.controllers.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }

  registerController(sessionId: string, ws: WebSocket): boolean {
    const session = this.getSession(sessionId);
    if (!session) return false;

    session.controllers.add(ws);
    this.wsToSession.set(ws, sessionId);

    // Send current state to new controller
    this.sendStateToClient(ws, session);

    return true;
  }

  unregisterClient(ws: WebSocket): void {
    const sessionId = this.wsToSession.get(ws);
    if (!sessionId) return;

    const session = this.sessions.get(sessionId);
    if (session) {
      session.viewers.delete(ws);
      session.controllers.delete(ws);

      // If no clients left, we'll clean up in the cleanup interval
    }

    this.wsToSession.delete(ws);
  }

  handleControlMessage(ws: WebSocket, message: ControlMessage): void {
    const session = this.getSession(message.sessionId);
    if (!session) {
      console.log('Session not found:', message.sessionId);
      return;
    }

    switch (message.type) {
      case "REGISTER_VIEWER":
        this.registerViewer(message.sessionId, ws, message.currentView);
        console.log(`Viewer registered for session ${message.sessionId}`);
        break;

      case "REGISTER_CONTROLLER":
        this.registerController(message.sessionId, ws);
        console.log(`Controller registered for session ${message.sessionId}`);
        break;

      case "STATE_REQUEST":
        this.sendStateToClient(ws, session);
        break;

      case "MODE":
        console.log(`Mode change: ${message.direction} for session ${message.sessionId}`);
        this.handleModeChange(session, message.direction || "forward");
        break;

      case "RANGE":
        console.log(`Range change: ${message.direction} for session ${message.sessionId}`);
        this.handleRangeChange(session, message.direction || "forward");
        break;

      case "ZONES":
        console.log(`Zones toggle for session ${message.sessionId}`);
        this.handleZonesToggle(session);
        break;

      case "SELECT":
        console.log(`Select aircraft: ${message.direction} for session ${message.sessionId}`);
        this.handleSelectChange(session, message.direction || "forward");
        break;
    }
  }

  private async handleModeChange(session: Session, direction: "forward" | "backward"): Promise<void> {
    // Get available zones from database
    const { getAreas } = await import("../dbHelpers.js");
    const areas = getAreas();

    const modes = ["radar", ...areas.map((a: any) => `zone_${a.id}`)];
    const currentIndex = modes.indexOf(session.currentView.mode);

    let newIndex: number;
    if (direction === "forward") {
      newIndex = (currentIndex + 1) % modes.length;
    } else {
      newIndex = currentIndex - 1;
      if (newIndex < 0) newIndex = modes.length - 1;
    }

    const newMode = modes[newIndex];
    const oldMode = session.currentView.mode;
    session.currentView.mode = newMode;

    // Only reset range when switching between radar and zones, not between zones
    const wasRadar = oldMode === "radar";
    const isRadar = newMode === "radar";

    if (wasRadar && !isRadar) {
      // Switching from radar to zone - set default zone hours
      session.currentView.range = 1;
    } else if (!wasRadar && isRadar) {
      // Switching from zone to radar - set default radar range
      session.currentView.range = 10;
    }
    // Otherwise keep the current range (when switching between zones)

    this.broadcastStateUpdate(session);
  }

  private handleRangeChange(session: Session, direction: "forward" | "backward"): void {
    const isRadar = session.currentView.mode === "radar";
    const ranges = isRadar
      ? [5, 10, 15, 25, 50, 100] // Radar ranges in miles
      : [1, 4, 12, 24]; // Zone ranges in hours

    const currentRange = session.currentView.range || (isRadar ? 10 : 1);
    const currentIndex = ranges.indexOf(currentRange);

    let newIndex: number;
    if (direction === "forward") {
      newIndex = (currentIndex + 1) % ranges.length;
    } else {
      newIndex = currentIndex - 1;
      if (newIndex < 0) newIndex = ranges.length - 1;
    }

    session.currentView.range = ranges[newIndex];
    this.broadcastStateUpdate(session);
  }

  private handleZonesToggle(session: Session): void {
    if (session.currentView.mode === "radar") {
      session.currentView.zonesEnabled = !session.currentView.zonesEnabled;
      this.broadcastStateUpdate(session);
    }
  }

  private handleSelectChange(session: Session, direction: "forward" | "backward"): void {
    // Only works in radar mode
    if (session.currentView.mode !== "radar") {
      return;
    }

    // The actual selection logic will be handled on the client side
    // since it needs access to the current aircraft list and positions
    // We just broadcast a SELECT command to the viewers
    const selectUpdate = {
      type: "SELECT_AIRCRAFT",
      sessionId: session.id,
      direction: direction
    };

    const message = JSON.stringify(selectUpdate);

    // Send to all viewers in radar mode
    session.viewers.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }

  private sendStateToClient(ws: WebSocket, session: Session): void {
    if (ws.readyState === WebSocket.OPEN) {
      const update: StateUpdate = {
        type: "STATE_UPDATE",
        sessionId: session.id,
        state: {
          mode: session.currentView.mode,
          range: session.currentView.range || 10,
          zonesEnabled: session.currentView.zonesEnabled || false
        }
      };
      ws.send(JSON.stringify(update));
    }
  }

  private broadcastStateUpdate(session: Session): void {
    const update: StateUpdate = {
      type: "STATE_UPDATE",
      sessionId: session.id,
      state: {
        mode: session.currentView.mode,
        range: session.currentView.range || 10,
        zonesEnabled: session.currentView.zonesEnabled || false
      }
    };

    const message = JSON.stringify(update);
    let viewerCount = 0;
    let controllerCount = 0;

    // Send to all viewers
    session.viewers.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
        viewerCount++;
      }
    });

    // Send to all controllers
    session.controllers.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
        controllerCount++;
      }
    });

    console.log(`State update broadcast to ${viewerCount} viewers, ${controllerCount} controllers (session ${session.id})`);

    // Emit event for other parts of the system
    controlEvents.emit("stateUpdate", session.id, session.currentView);
  }

  private cleanupInactiveSessions(): void {
    const now = new Date();
    const maxInactivity = 30 * 60 * 1000; // 30 minutes

    for (const [sessionId, session] of this.sessions.entries()) {
      const timeSinceActivity = now.getTime() - session.lastActivity.getTime();
      const hasNoClients = session.viewers.size === 0 && session.controllers.size === 0;

      if (hasNoClients && timeSinceActivity > maxInactivity) {
        this.sessions.delete(sessionId);
        console.log(`Cleaned up inactive session ${sessionId}`);
      }
    }
  }

  hasControllers(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    return session ? session.controllers.size > 0 : false;
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}

export const externalControlManager = new ExternalControlManager();