import express from "express";
import bodyParser from "body-parser";
import { createServer } from "http";
import api from "./api.js";
import webRouterModule from "./web/webRouter.js";
import { startObserver } from "./observer.js";
import { initializeWebSocketServer } from "./web/websocketServer.js";
import dotenv from "dotenv";

dotenv.config();

startObserver();

const app = express();
const server = createServer(app);

webRouterModule.configureViews(app);
initializeWebSocketServer(server);

app.use(bodyParser.json());
app.use(api);
app.use("/", webRouterModule.router);

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Server listening on :${port} - Web UI at http://localhost:${port}`));
