// Servidor de señalización Node.js/Express para WebRTC y Socket.io
// Este servidor está configurado para permitir conexiones desde CUALQUIER origen.

const express = require('express');
const cors = require('cors'); 
const app = express();
const server = require('http').Server(app); // Creamos el servidor HTTP
const { ExpressPeerServer } = require('peer'); // Importamos PeerJS Server

// --- 1. CONFIGURACIÓN CORS GLOBAL (CUALQUIER ORIGEN) ---

// Configuración CORS para Express. Permite todos los orígenes (*).
const corsOptions = {
    origin: '*', // Permite todos los orígenes
    methods: ['GET', 'POST'],
    credentials: true
};

app.use(cors(corsOptions)); 

// --- 2. CONFIGURACIÓN SOCKET.IO ---
const io = require('socket.io')(server, {
    // Configuración CORS para Socket.io. Permite todos los orígenes (*).
    cors: {
        origin: '*', 
        methods: ['GET', 'POST'],
        credentials: true
    },
    transports: ['websocket', 'polling']
});

// --- 3. CONFIGURACIÓN PEERJS SERVER (PARA WEBRTC) ---
const peerServer = ExpressPeerServer(server, {
    debug: true,
    path: '/myapp' // Ruta accesible en [URL_SERVIDOR]/peerjs/myapp
});
app.use('/peerjs', peerServer);

// --- 4. LÓGICA DE LA APLICACIÓN ---
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

        // Antes de unirse, notificar a los demás sobre los usuarios existentes
        socket.emit('all-users', usersInRoom[roomId]);

        // Asegúrate de que el usuario no exista antes de agregarlo (manejo de reconexión/multiples pestañas)
        const userExists = usersInRoom[roomId].some(user => user.userId === userId);
        if (!userExists) {
            usersInRoom[roomId].push({ userId, userName });
            // Notificar a todos los demás en la sala sobre el nuevo usuario
            socket.to(roomId).emit('user-joined', { userId, userName });
        }
        
        console.log(`${userName} (${userId}) se unió a la sala: ${roomId}`);

    });
    
    // [EVENTOS DE COMUNICACIÓN]

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


    // [EVENTO DE DESCONEXIÓN]
    socket.on('disconnect', () => {
        console.log('User disconnected: ' + socket.userName + ' (' + socket.userId + ')');
        if (socket.room && socket.userId) { 
            // Remover al usuario de la lista
            usersInRoom[socket.room] = usersInRoom[socket.room].filter(user => user.userId !== socket.userId);
            
            // Notificar a los demás
            socket.to(socket.room).emit('user-disconnected', socket.userId, socket.userName);
        }
    });
});

// --- 5. INICIO DEL SERVIDOR ---

const PORT = process.env.PORT || 9000; 

server.listen(PORT, () => {
    console.log(`Servidor de reuniones corriendo en puerto ${PORT}`);
    console.log('ADVERTENCIA: CORS configurado para permitir CUALQUIER origen (*).');
});