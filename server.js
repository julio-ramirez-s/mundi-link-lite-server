// Servidor de señalización y archivos estáticos combinado.
// Este servidor sirve el frontend (archivos estáticos) y maneja la señalización (Socket.io/PeerJS).

const express = require('express');
const path = require('path');
const cors = require('cors'); 
const app = express();
const server = require('http').Server(app);
const { ExpressPeerServer } = require('peer');

// --- 1. CONFIGURACIÓN CORS GLOBAL (CUALQUIER ORIGEN) ---
// Mantenemos CORS abierto para compatibilidad con servicios externos.
const corsOptions = {
    origin: '*', 
    methods: ['GET', 'POST'],
    credentials: true
};
app.use(cors(corsOptions)); 

// --- 2. SERVIR ARCHIVOS ESTÁTICOS (Frontend) ---
// Sirve todos los archivos dentro de la carpeta 'public'.
app.use(express.static(path.join(__dirname, 'public')));
console.log('Sirviendo archivos estáticos desde la carpeta: public');


// --- 3. CONFIGURACIÓN PEERJS SERVER (PARA WEBRTC) ---
// Debe ir antes de la ruta catch-all para que /peerjs/* sea manejado por PeerJS.
const peerServer = ExpressPeerServer(server, {
    debug: true,
    path: '/myapp' // Ruta accesible en [URL_SERVIDOR]/peerjs/myapp
});
app.use('/peerjs', peerServer);


// --- 4. RUTA CATCH-ALL DEFINITIVA (Middleware Fallback) ---
// Usamos app.use() sin path para que actúe como el último middleware. 
// Esto evita los problemas de PathError con '*' o '/*' que viste en Render.
app.use((req, res) => {
    // Si la solicitud no fue manejada por express.static ni por /peerjs, envía el index.html
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// --- 5. CONFIGURACIÓN SOCKET.IO ---
const io = require('socket.io')(server, {
    cors: {
        origin: '*', 
        methods: ['GET', 'POST'],
        credentials: true
    },
    // Parámetros de estabilidad recomendados para Proxies (como Render)
    transports: ['websocket', 'polling'],
    pingTimeout: 10000, // 10 segundos (Tiempo para esperar el ping/pong)
    pingInterval: 5000 // 5 segundos (Frecuencia de envío de pings)
});


// --- 6. LÓGICA DE LA APLICACIÓN (SOCKET.IO) ---
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

        // Antes de emitir, nos aseguramos de enviar una copia segura del array para evitar referencias
        const currentUsers = usersInRoom[roomId].map(user => ({ userId: user.userId, userName: user.userName }));
        socket.emit('all-users', currentUsers);

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

// --- 7. INICIO DEL SERVIDOR ---

const PORT = process.env.PORT || 9000; 

server.listen(PORT, () => {
    console.log(`Servidor combinado corriendo en puerto ${PORT}`);
    console.log('CORS configurado para permitir CUALQUIER origen (*).');
});