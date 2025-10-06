# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm run dev` - Start development server with automatic restart using ts-node-dev
- `npm run build` - Compile TypeScript to JavaScript in dist/
- `npm start` - Run the compiled application from dist/
- `npm run lint` - Run ESLint on TypeScript files
- `npm run test` - Run tests with Vitest and coverage reports

## Architecture Overview

This is a flight tracking system that monitors aircraft within defined geographic areas using PiAware dump1090 data feeds. The system consists of three main components:

### Core Components

1. **Observer Service** (`src/observer.ts`)
   - Polls PiAware dump1090 JSON feed at configurable intervals (default 10s)
   - Tracks aircraft entry/exit from defined geographic polygons
   - Enriches aircraft data using OpenSky Network API
   - Manages observation lifecycle (entry/exit tracking)

2. **REST API** (`src/api.ts`)
   - Express router with endpoints for areas, aircraft observations, and statistics
   - Supports GeoJSON FeatureCollection format for area definitions
   - Provides flexible querying with time ranges, area filters, and aircraft type filters
   - Returns enriched aircraft data with manufacturer, model, operator information

3. **Database Layer** (`src/db.ts`)
   - SQLite database with WAL mode for concurrent access
   - Three main tables: areas (polygons), observations (entry/exit events), aircraft_info (enriched metadata)
   - Automatic schema migrations and cleanup of deprecated tables

### Key Data Flow

1. PiAware feeds aircraft position data → Observer polls and processes
2. Geographic polygon checking determines area entry/exit events
3. Aircraft metadata enrichment via OpenSky Network API (cached for 30 days)
4. Observation records stored with timestamps for entry/exit events
5. REST API serves historical data with filtering and statistics

### Configuration

Environment variables:
- `PIAWARE_URL` - dump1090 JSON feed URL (required)
- `POLL_MS` - Polling interval in milliseconds (default: 10000)
- `DB_PATH` - SQLite database path (default: data/tracker.db)
- `PORT` - API server port (default: 3000)

### Testing

- Uses Vitest with Node.js environment
- Test files in `src/__tests__/` and `src/utils/__tests__/`
- Coverage reporting enabled
- Tests focus on utility functions like geo calculations and date parsing

### Production Deployment

The README indicates this runs as a systemd service:
- Service name: `flight-tracker.service`
- Uses `journalctl` for log viewing
- Standard systemctl commands for management

### Key External Dependencies

- `better-sqlite3` - High-performance SQLite bindings
- `express` - Web framework for REST API
- External APIs: PiAware dump1090 feed, OpenSky Network metadata API