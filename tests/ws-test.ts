import { io } from "socket.io-client";

const socket = io("http://localhost:4040");

socket.on("connect", () => {
  console.log("Connected");

  socket.emit("subscribe", "AAPL");
});

socket.on("price", (price) => {
  console.log(price);
});
