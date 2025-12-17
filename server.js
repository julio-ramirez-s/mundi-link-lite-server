const express = require('express');
const cors = require('cors'); 
const app = express();
const server = require('http').Server(app);
const { ExpressPeerServer } = require('peer');

// --- Configuración de CORS ---
// Usaremos una configuración CORS simple y permisiva para asegurar la conectividad 
// ya que el error 'xhr poll error' es a menudo un problema de CORS o firewall.
// En producción, se recomienda restringir a la URL del frontend.
const corsOptions = {
    origin: '*', // Permitir todos los orígenes para la aplicación Express
    methods: ['GET', 'POST', 'PUT', 'DELETE']
};

app.use(cors(corsOptions)); 

// --- Configuración de Socket.IO ---
const io = require('socket.io')(server, {
    // La configuración de CORS para Socket.IO es crítica para evitar 'xhr poll error'.
    cors: {
        origin: '*', // Permitir cualquier origen (necesario para la mayoría de las pruebas en Canvas/desarrollo)
        methods: ['GET', 'POST'], // Los métodos HTTP utilizados por el polling de Socket.IO
        credentials: true
    }
});

// --- Configuración de PeerJS ---
const peerServer = ExpressPeerServer(server, {
    path: '/myapp'
});
app.use('/peerjs', peerServer);

// --- Lógica de la aplicación ---
const usersInRoom = {};

io.on('connection', socket => {
    console.log('Nuevo usuario conectado:', socket.id);

    socket.on('join-room', (roomId, userId, userName) => {
        socket.join(roomId);
        socket.userId = userId; 
        socket.userName = userName; 
        socket.room = roomId; 

        if (!usersInRoom[roomId]) {
            usersInRoom[roomId] = [];
        }

        socket.emit('all-users', usersInRoom[roomId]);

        usersInRoom[roomId].push({ userId, userName });
        
        // Emite a todos en la sala EXCEPTO a quien se une
        socket.to(roomId).emit('user-connected', userId, userName);

        console.log(`Usuario ${userName} (${userId}) se unió a la sala ${roomId}. Usuarios en sala: ${usersInRoom[roomId].length}`);
    });

    socket.on('send-message', (message, userName, timestamp) => {
        io.to(socket.room).emit('receive-message', {
            text: message,
            sender: userName,
            timestamp: timestamp,
            userId: socket.userId
        });
        console.log(`Mensaje en la sala ${socket.room} de ${userName}: ${message}`);
    });

    socket.on('emoji-reaction', (emoji) => {
        io.to(socket.room).emit('receive-reaction', socket.userId, socket.userName, emoji);
        console.log(`Reacción de ${socket.userName} en la sala ${socket.room}: ${emoji}`);
    });

    socket.on('screen-share-started', () => {
        io.to(socket.room).emit('screen-share-active', socket.userId, socket.userName);
        console.log(`${socket.userName} inició la compartición de pantalla.`);
    });

    socket.on('stop-screen-share', () => {
        io.to(socket.room).emit('screen-share-inactive', socket.userId);
        console.log(`${socket.userName} detuvo la compartición de pantalla.`);
    });

    // Nuevo evento para cambiar el tema
    socket.on('change-theme', (theme) => {
        // Emitir el cambio de tema a todos en la misma sala, incluido el emisor
        io.to(socket.room).emit('theme-changed', theme);
        console.log(`Tema cambiado a ${theme} en la sala ${socket.room} por ${socket.userName}`);
    });


    socket.on('disconnect', () => {
        console.log('User disconnected: ' + socket.userName + ' (' + socket.userId + ')');
        if (socket.room && socket.userId) { 
            usersInRoom[socket.room] = usersInRoom[socket.room].filter(user => user.userId !== socket.userId);
            socket.to(socket.room).emit('user-disconnected', socket.userId, socket.userName);
            console.log(`Usuario ${socket.userName} (${socket.userId}) se desconectó de la sala ${socket.room}. Usuarios restantes: ${usersInRoom[socket.room].length}`);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});