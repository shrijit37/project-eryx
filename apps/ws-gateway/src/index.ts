import { Redis } from "ioredis";
import dotenv from "dotenv";
import { Server } from "socket.io";
import { createServer } from "http";

dotenv.config({ path: "../../.env" });

const WS_PORT = Number(process.env.WS_PORT);

const sub = new Redis({
  host: "localhost",
  port: 6379,
});

const httpServer = createServer();
const io = new Server(httpServer);

async function main() {
  try {
    console.log("Connecting to Redis...");

    await sub.ping();
    console.log("Redis connected.");
    await sub.subscribe("prices", "updates");

    sub.on("message", (channel, message) => {
      if (channel === "prices") {
        try {
          const price = JSON.parse(message);
          io.to(price.symbol).emit("price", price);
        } catch (e) {
          console.error("bad price payload", e);
        }
        return;
      }

      if (channel === "updates") {
        try {
          const update = JSON.parse(message);
          // { accountId, event, payload, ts }
          io.to(`account:${update.accountId}`).emit(update.event, update.payload);
        } catch (e) {
          console.error("bad update payload", e);
        }
      }
    });

    io.on("connection", (socket) => {
      console.log(`Client connected: ${socket.id}`);

      socket.on("subscribe", (symbol: string) => {
        socket.join(symbol);
        console.log(`${socket.id} subscribed to ${symbol}`);
      });

      // Join the client's own account room to receive order/portfolio updates.
      socket.on("subscribe-account", (accountId: string) => {
        socket.join(`account:${accountId}`);
        console.log(`${socket.id} subscribed to account:${accountId}`);
      });

      socket.on("disconnect", () => {
        console.log(`Client disconnected: ${socket.id}`);
      });
    });

    httpServer.listen(WS_PORT, () => {
      console.log(`WS Gateway listening on ${WS_PORT}`);
    });
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();