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
    await sub.subscribe("prices");

    sub.on("message", (_, message) => {
      try {
        var price = JSON.parse(message);
      } catch (e) {
        console.log(e)
        return
      }

      console.log(price);

      io.to(price.symbol).emit("price", price);
    });

    io.on("connection", (socket) => {
      console.log(`Client connected: ${socket.id}`);

      socket.on("subscribe", (symbol: string) => {
        socket.join(symbol);
        console.log(`${socket.id} subscribed to ${symbol}`);
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