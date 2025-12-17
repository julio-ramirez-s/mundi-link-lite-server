// Servidor de señalización y archivos estáticos combinado.
// Este servidor sirve el frontend (archivos estáticos) y maneja la señalización (Socket.io/PeerJS).

const express = require('express');
const path = require('path');
const cors = require('cors'); 
const app = express();
const server = require('http').Server(app);
const { ExpressPeerServer } = require('peer');

// --- 1. CONFIGURACIÓN CORS GLOBAL (CUALQUIER ORIGEN) ---
// Aunque vamos a servir el frontend, mantenemos CORS abierto para mayor compatibilidad.
const corsOptions = {
    origin: '*', 
    methods: ['GET', 'POST'],
    credentials: true
};
app.use(cors(corsOptions)); 

// --- 2. SERVIR ARCHIVOS ESTÁTICOS (Frontend) ---
// Esto le dice a Express que sirva todos los archivos dentro de la carpeta 'public'.
// Asegúrate de que tu index.html, CSS y JS estén dentro de una carpeta llamada 'public'.
app.use(express.static(path.join(__dirname, 'public')));
console.log('Sirviendo archivos estáticos desde la carpeta: public');


// Ruta Catch-all: Si la ruta no es una API ni un archivo estático, devuelve el index.html
app.get('*', (req, res) => {
    // Si estás usando un frontend de una sola página (SPA) como React/Vue, esto asegura que el enrutamiento funcione.
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// --- 3. CONFIGURACIÓN SOCKET.IO ---
const io = require('socket.io')(server, {
    cors: {
        origin: '*', 
        methods: ['GET', 'POST'],
        credentials: true
    },
    transports: ['websocket', 'polling']
});

// --- 4. CONFIGURACIÓN PEERJS SERVER (PARA WEBRTC) ---
const peerServer = ExpressPeerServer(server, {
    debug: true,
    path: '/myapp' // Ruta accesible en [URL_SERVIDOR]/peerjs/myapp
});
app.use('/peerjs', peerServer);

// --- 5. LÓGICA DE LA APLICACIÓN (SOCKET.IO) ---
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

        const userExists = usersInRoom[roomId].some(user => user.userId === userId);
        if (!userExists) {
            usersInRoom[roomId].push({ userId, userName });
            socket.to(roomId).emit('user-joined', { userId, userName });
        }
        
        console.log(`${userName} (${userId}) se unió a la sala: ${roomId}`);

    });
    
    socket.on('message', (message) => {
        socket.to(socket.room).emit('createMessage', message, socket.userName);
    });
    
    socket.on('emoji-reaction', (emoji) => {
        io.to(socket.room).emit('user-reaction', socket.userId, emoji);
    });

    socket.on('screen-share-started', () => {
        io.to(socket.room).emit('screen-share-active', socket.userId, socket.userName);
    });

    socket.on('stop-screen-share', () => {
        io.to(socket.room).emit('screen-share-inactive', socket.userId);
    });

    socket.on('change-theme', (theme) => {
        io.to(socket.room).emit('theme-changed', theme);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected: ' + socket.userName + ' (' + socket.userId + ')');
        if (socket.room && socket.userId) { 
            usersInRoom[socket.room] = usersInRoom[socket.room].filter(user => user.userId !== socket.userId);
            socket.to(socket.room).emit('user-disconnected', socket.userId, socket.userName);
        }
    });
});

// --- 6. INICIO DEL SERVIDOR ---

const PORT = process.env.PORT || 9000; 

server.listen(PORT, () => {
    console.log(`Servidor combinado corriendo en puerto ${PORT}`);
    console.log('CORS configurado para permitir CUALQUIER origen (*).');
});