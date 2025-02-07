const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { createServer } = require('http');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3001;

app.use(cors());

server.listen(PORT, () => {
    console.log(`WebSocket server listening on port ${PORT}`);
});

const io = new Server(server, {
    transports: ['websocket'],
    cors: {
        methods: ["GET", "POST"],
        origin: "*" // Replace with specific origins in production for security
    }
});

let rooms = {};
let users = {}; // Store user information

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('setUsername', (username) => {
        users[socket.id] = { username, status: 'online' };
        io.emit('userList', users);
    });

    socket.on('sendMessage', (message, callback) => {
        const { roomId, content, recipientId } = message;

        if (recipientId) {
            // Private message
            socket.to(recipientId).emit("privateMessage", message);
        } else {
            // Room message
            if (!rooms[roomId]) {
                rooms[roomId] = { messages: [], name: 'Unnamed Room' };
            }
            rooms[roomId].messages.push(message);

            io.to(roomId).emit("roomMessage", message);
        }
        callback('Message delivered');
    });

    socket.on('joinRoomExclusively', (message) => {
        const { roomId, text, username } = message;

        if (!rooms[roomId]) {
            rooms[roomId] = { messages: [], name: 'Unnamed Room' };
        }

        if (socket.rooms.has(roomId)) {
            console.log(`User ${socket.id} is already in room ${roomId}`);
            return;
        }

        socket.join(roomId);
        console.log(`User ${socket.id} joined room ${roomId}`);
        socket.emit('welcomeMessage', `Welcome ${username} to the room!`);
        io.to(roomId).emit("joiningMessage", { ...message, userId: socket.id, sender: username });

        socket.emit('roomHistory', rooms[roomId].messages);
        io.to(roomId).emit('roomMemberCount', io.sockets.adapter.rooms.get(roomId)?.size || 0);
    });

    socket.on('typing', (roomId) => {
        const username = users[socket.id]?.username;
        socket.to(roomId).emit('typing', { userId: socket.id, username });
    });

    socket.on('stopTyping', (roomId) => {
        socket.to(roomId).emit('stopTyping', socket.id);
    });

    socket.on('createRoom', (roomName, callback) => {
        if (Object.keys(rooms).length >= 5) {
            callback('Maximum number of rooms reached');
            return;
        }
        const roomId = uuidv4();
        rooms[roomId] = { messages: [], name: roomName };
        callback(null, roomId, roomName);
        io.emit('roomList', rooms);
    });

    socket.on('updateRoomName', (roomId, newRoomName, callback) => {
        if (rooms[roomId]) {
            rooms[roomId].name = newRoomName;
            callback(null, newRoomName);
            io.emit('roomList', rooms);
        } else {
            callback('Room not found');
        }
    });

    socket.on('deleteRoom', (roomId, callback) => {
        if (rooms[roomId]) {
            delete rooms[roomId];
            callback(null, roomId);
            io.emit('roomList', rooms);
        } else {
            callback('Room not found');
        }
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        socket.rooms.forEach(room => {
            io.to(room).emit("leavingMessage", { roomId: room, userId: socket.id, sender: users[socket.id]?.username || "Unknown", message: "has left the room" });
        });
        if (users[socket.id]) {
            users[socket.id].status = 'offline';
            io.emit('userList', users);
            delete users[socket.id];
        }
    });

    socket.on('leaveRoom', (roomId) => {
        if (socket.rooms.has(roomId)) {
            socket.leave(roomId);
            console.log(`User ${socket.id} has left room ${roomId}`);
            io.to(roomId).emit("leavingMessage", { roomId: roomId, userId: socket.id, sender: users[socket.id]?.username || "Unknown", message: "has left the room" });
            io.to(roomId).emit('roomMemberCount', io.sockets.adapter.rooms.get(roomId)?.size || 0);
        } else {
            socket.emit('error-from-server', `User is not in room ${roomId}`);
        }
    });
});