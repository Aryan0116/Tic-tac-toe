const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);


const rooms = new Map();

app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('createRoom', (username) => {
        const roomId = Math.random().toString(36).substring(7);
        rooms.set(roomId, {
            players: [{ id: socket.id, username, score: 0 }],
            board: Array(9).fill(null),
            messages: [],
            currentPlayer: socket.id,
            gameInProgress: false
        });
        socket.join(roomId);
        socket.emit('roomCreated', roomId);
    });

    socket.on('joinRoom', ({ roomId, username }) => {
        const room = rooms.get(roomId);
        if (room && room.players.length < 2) {
            room.players.push({ id: socket.id, username, score: 0 });
            socket.join(roomId);
            room.gameInProgress = true;
            io.to(roomId).emit('gameStart', {
                players: room.players,
                currentPlayer: room.players[0].id,
                messages: room.messages
            });
        } else {
            socket.emit('roomError', 'Room full or does not exist');
        }
    });

    socket.on('makeMove', ({ roomId, index }) => {
        const room = rooms.get(roomId);
        if (room && room.gameInProgress && room.currentPlayer === socket.id) {
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            const symbol = playerIndex === 0 ? 'X' : 'O';

            if (room.board[index] === null) {
                room.board[index] = symbol;
                room.currentPlayer = room.players.find(p => p.id !== socket.id).id;

                io.to(roomId).emit('moveMade', {
                    index,
                    symbol,
                    board: room.board
                });

                const winner = checkWinner(room.board);
                if (winner) {
                    const winningPlayer = room.players[winner === 'X' ? 0 : 1];
                    winningPlayer.score += 1;
                    room.gameInProgress = false;
                    io.to(roomId).emit('gameOver', {
                        winner,
                        players: room.players,
                        winningLine: getWinningLine(room.board)
                    });
                    room.board = Array(9).fill(null);
                } else if (!room.board.includes(null)) {
                    room.gameInProgress = false;
                    io.to(roomId).emit('gameOver', { winner: 'draw', players: room.players });
                    room.board = Array(9).fill(null);
                }
            }
        }
    });

    socket.on('requestRematch', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (room) {
            const opponent = room.players.find(p => p.id !== socket.id);
            if (opponent) {
                io.to(opponent.id).emit('rematchRequested');
            }
        }
    });

    socket.on('acceptRematch', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (room) {
            room.board = Array(9).fill(null);
            room.gameInProgress = true;
            room.currentPlayer = room.players[0].id;
            io.to(roomId).emit('rematchAccepted');
            io.to(roomId).emit('gameStart', {
                players: room.players,
                currentPlayer: room.players[0].id,
                messages: room.messages
            });
        }
    });

    socket.on('declineRematch', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (room) {
            io.to(roomId).emit('rematchDeclined');
        }
    });

    socket.on('sendMessage', ({ roomId, message, username }) => {
        const room = rooms.get(roomId);
        if (room) {
            const chatMessage = {
                id: Date.now(),
                username,
                message,
                timestamp: new Date().toLocaleTimeString()
            };
            room.messages.push(chatMessage);
            io.to(roomId).emit('newMessage', chatMessage);
        }
    });

    socket.on('disconnect', () => {
        rooms.forEach((room, roomId) => {
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                io.to(roomId).emit('playerLeft', room.players[playerIndex].username);
                rooms.delete(roomId);
            }
        });
    });
});

function checkWinner(board) {
    const lines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
        [0, 4, 8], [2, 4, 6] // diagonals
    ];

    for (let line of lines) {
        const [a, b, c] = line;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return board[a];
        }
    }
    return null;
}

function getWinningLine(board) {
    const lines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6]
    ];

    for (let line of lines) {
        const [a, b, c] = line;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return line;
        }
    }
    return null;
}

http.listen(3000, () => {
    console.log('Server running on port 3000');
});
