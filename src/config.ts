import dotenv from "dotenv";

dotenv.config();

export const config = {
  piawareUrl: process.env.PIAWARE_URL || "http://piaware.local:8080/data/aircraft.json",
  pollMs: Number(process.env.POLL_MS ?? 10000),
  port: Number(process.env.PORT ?? 3000),
  area: {
    minLat: Number(process.env.MIN_LAT ?? 38.885),
    maxLat: Number(process.env.MAX_LAT ?? 38.915),
    minLon: Number(process.env.MIN_LON ?? -77.065),
    maxLon: Number(process.env.MAX_LON ?? -77.035),
  },
  // Simple prefixes that usually indicate helicopters; tweak as needed.
  helicopterPrefixes: ["H", "EH", "EH1", "EH2"],
};
