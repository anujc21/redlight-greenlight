const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

const players = {};

function startDollRotationLoop() {
    let angle = Math.PI;

    const loop = () => {
        const delay = 1000 + Math.random() * 6000;
        angle = angle === 0 ? Math.PI : 0;

        const duration = 1000;
        const startTime = Date.now();

        io.emit("dollRotate", { angle, duration, startTime });

        setTimeout(loop, delay + duration);
    };

    loop();
}

startDollRotationLoop();

io.on("connection", (socket) => {
    console.log(`Player connected: ${socket.id}`);

    players[socket.id] = {
        position: { x: -340, y: 10, z: 0 },
        color: "#3399ff"
    };

    socket.on("updatePosition", (data) => {
        if (players[socket.id]) {
            players[socket.id].position = data.position;
            players[socket.id].color = data.color;
        }
        io.emit("playersUpdate", players);
    });

    socket.on("disconnect", () => {
        delete players[socket.id];
        io.emit("playersUpdate", players);
    });
});

server.listen(3000);