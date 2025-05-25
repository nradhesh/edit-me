import express, { Request, Response } from "express"
import dotenv from "dotenv"
import http from "http"
import cors from "cors"
import { Server } from "socket.io"
import path from "path"
import mongoose from "mongoose"
import { userRouter } from './routes/userRoutes'
import { SocketEvent, SocketId } from "./types/socket"
import { USER_CONNECTION_STATUS, User } from "./types/user"
import { User as UserModel } from "./models/User"

dotenv.config()

const app = express()
app.use(express.json())
app.use(cors())
app.use(express.static(path.join(__dirname, "public")))

const server = http.createServer(app)
const io = new Server(server, {
	cors: {
		origin: "*",
		methods: ["GET", "POST"],
		credentials: true
	},
	maxHttpBufferSize: 1e8,
	pingTimeout: 60000,
	transports: ['polling'],
	allowEIO3: true,
	path: '/socket.io/',
	connectTimeout: 45000,
	upgradeTimeout: 30000,
	allowUpgrades: false,
	perMessageDeflate: false,
	httpCompression: {
		threshold: 2048
	}
})

// MongoDB connection state
let isConnected = false;
let connectionAttempts = 0;
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds

// Connect to MongoDB with serverless-friendly settings and retries
async function connectToDatabase(retryCount = 0): Promise<void> {
	if (isConnected && mongoose.connection.readyState === 1) {
		return;
	}

	try {
		const mongoUri = process.env.MONGODB_URI;
		if (!mongoUri) {
			throw new Error('MONGODB_URI is not defined');
		}

		// Close any existing connection first
		if (mongoose.connection.readyState !== 0) {
			await mongoose.connection.close();
			isConnected = false;
		}

		console.log(`Attempting to connect to MongoDB (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
		
		// Add more connection options for better reliability
		await mongoose.connect(mongoUri, {
			serverSelectionTimeoutMS: 10000, // Increased from 5000
			socketTimeoutMS: 45000,
			family: 4,
			maxPoolSize: 10,
			minPoolSize: 5,
			connectTimeoutMS: 20000, // Increased from 10000
			heartbeatFrequencyMS: 10000,
			retryWrites: true,
			retryReads: true,
			w: 'majority',
			wtimeoutMS: 2500,
			autoIndex: true
		});

		// Verify connection is actually established
		if (mongoose.connection.readyState !== 1) {
			throw new Error(`Connection not ready after connect. State: ${mongoose.connection.readyState}`);
		}

		isConnected = true;
		connectionAttempts = 0;
		console.log('MongoDB connected successfully');
	} catch (error) {
		console.error(`MongoDB connection error (attempt ${retryCount + 1}/${MAX_RETRIES}):`, error);
		isConnected = false;

		if (retryCount < MAX_RETRIES - 1) {
			const delay = RETRY_DELAY * Math.pow(2, retryCount); // Exponential backoff
			console.log(`Retrying connection in ${delay}ms...`);
			await new Promise(resolve => setTimeout(resolve, delay));
			return connectToDatabase(retryCount + 1);
		}

		throw error;
	}
}

let userSocketMap: Array<User> = []

function getUsersInRoom(roomId: string): Array<User> {
	return userSocketMap.filter((user) => user.roomId === roomId)
}

function getRoomId(socketId: SocketId): string {
	const user = userSocketMap.find((user) => user.socketId === socketId);
	if (!user?.roomId) {
		console.error("Room ID is undefined for socket ID:", socketId);
		throw new Error("Room ID not found");
	}
	return user.roomId;
}

function getUserBySocketId(socketId: SocketId): User | null {
	const user = userSocketMap.find((user) => user.socketId === socketId)
	if (!user) {
		console.error("User not found for socket ID:", socketId)
		return null
	}
	return user
}

io.on("connection", (socket) => {
	socket.on(SocketEvent.JOIN_REQUEST, async ({ roomId, username }) => {
		const isUsernameExist = getUsersInRoom(roomId).some(
			(u) => u.username === username
		)
		if (isUsernameExist) {
			io.to(socket.id).emit(SocketEvent.USERNAME_EXISTS)
			return
		}

		const user: User = {
			username,
			roomId,
			status: USER_CONNECTION_STATUS.ONLINE,
			cursorPosition: 0,
			typing: false,
			socketId: socket.id,
			currentFile: null,
		}
		userSocketMap.push(user)
		socket.join(roomId)
		socket.broadcast.to(roomId).emit(SocketEvent.USER_JOINED, { user })
		const users = getUsersInRoom(roomId)
		io.to(socket.id).emit(SocketEvent.JOIN_ACCEPTED, { user, users })

		try {
			await UserModel.create({
				...user,
				email: `${username}@temp.com`, // Temporary email for socket users
				password: 'socket-user', // Temporary password for socket users
			})
		} catch (err) {
			console.error("Error saving user to MongoDB:", err)
		}
	})

	socket.on("disconnecting", () => {
		const user = getUserBySocketId(socket.id)
		if (!user) return
		try {
			const roomId = getRoomId(socket.id)
			socket.broadcast.to(roomId).emit(SocketEvent.USER_DISCONNECTED, { user })
			userSocketMap = userSocketMap.filter((u) => u.socketId !== socket.id)
			socket.leave(roomId)
		} catch (error) {
			console.error("Error in disconnecting handler:", error)
		}
	})

	socket.on(SocketEvent.SYNC_FILE_STRUCTURE, ({ fileStructure, openFiles, activeFile, socketId }) => {
		io.to(socketId).emit(SocketEvent.SYNC_FILE_STRUCTURE, {
			fileStructure,
			openFiles,
			activeFile,
		})
	})

	socket.on(SocketEvent.DIRECTORY_CREATED, ({ parentDirId, newDirectory }) => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return
		socket.broadcast.to(roomId).emit(SocketEvent.DIRECTORY_CREATED, {
			parentDirId,
			newDirectory,
		})
	})

	socket.on(SocketEvent.DIRECTORY_UPDATED, ({ dirId, children }) => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return
		socket.broadcast.to(roomId).emit(SocketEvent.DIRECTORY_UPDATED, {
			dirId,
			children,
		})
	})

	socket.on(SocketEvent.DIRECTORY_RENAMED, ({ dirId, newName }) => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return
		socket.broadcast.to(roomId).emit(SocketEvent.DIRECTORY_RENAMED, {
			dirId,
			newName,
		})
	})

	socket.on(SocketEvent.DIRECTORY_DELETED, ({ dirId }) => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return
		socket.broadcast.to(roomId).emit(SocketEvent.DIRECTORY_DELETED, { dirId })
	})

	socket.on(SocketEvent.FILE_CREATED, ({ parentDirId, newFile }) => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return
		socket.broadcast.to(roomId).emit(SocketEvent.FILE_CREATED, {
			parentDirId,
			newFile,
		})
	})

	socket.on(SocketEvent.FILE_UPDATED, ({ fileId, newContent }) => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return
		socket.broadcast.to(roomId).emit(SocketEvent.FILE_UPDATED, {
			fileId,
			newContent,
		})
	})

	socket.on(SocketEvent.FILE_RENAMED, ({ fileId, newName }) => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return
		socket.broadcast.to(roomId).emit(SocketEvent.FILE_RENAMED, {
			fileId,
			newName,
		})
	})

	socket.on(SocketEvent.FILE_DELETED, ({ fileId }) => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return
		socket.broadcast.to(roomId).emit(SocketEvent.FILE_DELETED, { fileId })
	})

	socket.on(SocketEvent.USER_OFFLINE, ({ socketId }) => {
		userSocketMap = userSocketMap.map((user) =>
			user.socketId === socketId
				? { ...user, status: USER_CONNECTION_STATUS.OFFLINE }
				: user
		)
		const roomId = getRoomId(socketId)
		if (!roomId) return
		socket.broadcast.to(roomId).emit(SocketEvent.USER_OFFLINE, { socketId })
	})

	socket.on(SocketEvent.USER_ONLINE, ({ socketId }) => {
		userSocketMap = userSocketMap.map((user) =>
			user.socketId === socketId
				? { ...user, status: USER_CONNECTION_STATUS.ONLINE }
				: user
		)
		const roomId = getRoomId(socketId)
		if (!roomId) return
		socket.broadcast.to(roomId).emit(SocketEvent.USER_ONLINE, { socketId })
	})

	socket.on(SocketEvent.SEND_MESSAGE, ({ message }) => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return
		socket.broadcast.to(roomId).emit(SocketEvent.RECEIVE_MESSAGE, { message })
	})

	socket.on(SocketEvent.TYPING_START, ({ cursorPosition }) => {
		userSocketMap = userSocketMap.map((user) =>
			user.socketId === socket.id
				? { ...user, typing: true, cursorPosition }
				: user
		)
		const user = getUserBySocketId(socket.id)
		if (!user) return
		try {
			const roomId = getRoomId(socket.id)
			socket.broadcast.to(roomId).emit(SocketEvent.TYPING_START, { user })
		} catch (error) {
			console.error("Error in typing start handler:", error)
		}
	})

	socket.on(SocketEvent.TYPING_PAUSE, () => {
		userSocketMap = userSocketMap.map((user) =>
			user.socketId === socket.id ? { ...user, typing: false } : user
		)
		const user = getUserBySocketId(socket.id)
		if (!user) return
		try {
			const roomId = getRoomId(socket.id)
			socket.broadcast.to(roomId).emit(SocketEvent.TYPING_PAUSE, { user })
		} catch (error) {
			console.error("Error in typing pause handler:", error)
		}
	})

	socket.on(SocketEvent.REQUEST_DRAWING, () => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return
		socket.broadcast.to(roomId).emit(SocketEvent.REQUEST_DRAWING, {
			socketId: socket.id,
		})
	})

	socket.on(SocketEvent.SYNC_DRAWING, ({ drawingData, socketId }) => {
		socket.broadcast.to(socketId).emit(SocketEvent.SYNC_DRAWING, { drawingData })
	})

	socket.on(SocketEvent.DRAWING_UPDATE, ({ snapshot }) => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return
		socket.broadcast.to(roomId).emit(SocketEvent.DRAWING_UPDATE, { snapshot })
	})
})

// Middleware to check database connection with retries
async function checkDbConnection(req: express.Request, res: express.Response, next: express.NextFunction) {
	try {
		await connectToDatabase();
		
		// Double check connection state
		if (mongoose.connection.readyState !== 1) {
			throw new Error(`Database not ready. Current state: ${mongoose.connection.readyState}`);
		}
		
		next();
	} catch (error) {
		console.error('Database connection check failed:', error);
		const state = mongoose.connection.readyState;
		const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
		
		res.status(503).json({
			error: 'Database connection not ready',
			details: error instanceof Error ? error.message : 'Unknown error',
			state,
			stateName: states[state] || 'unknown',
			isConnected,
			connectionAttempts,
			message: 'Please try again in a few moments'
		});
	}
}

// Add a socket.io health check endpoint
app.get("/api/socket-health", (req: Request, res: Response) => {
	try {
		const engine = io.engine as any; // Type assertion for engine properties
		const transport = engine?.transport?.name || 'unknown';
		const clientsCount = engine?.clientsCount || 0;
		
		res.status(200).json({ 
			status: "ok", 
			message: "Socket.IO server is running",
			environment: process.env.NODE_ENV,
			timestamp: new Date().toISOString(),
			transport,
			clientsCount,
			polling: transport === 'polling',
			upgrades: false // Always false since we disabled upgrades
		});
	} catch (error) {
		console.error('Socket health check failed:', error);
		res.status(500).json({
			status: 'error',
			message: 'Socket.IO server check failed',
			error: error instanceof Error ? error.message : 'Unknown error'
		});
	}
});

// Apply database connection check to all routes except socket health
app.use('/api', (req, res, next) => {
	if (req.path === '/socket-health') {
		next();
		return;
	}
	checkDbConnection(req, res, next);
});

// Routes
app.use('/api/users', userRouter);

// Add a test endpoint
app.get("/api/test", (req: Request, res: Response) => {
	res.json({ message: "API is working!" });
});

// Add a health check endpoint
app.get("/api/health", (req: Request, res: Response) => {
	res.status(200).json({ 
		status: "ok", 
		message: "Server is running",
		environment: process.env.NODE_ENV,
		timestamp: new Date().toISOString(),
		dbState: mongoose.connection.readyState
	});
});

// Test endpoint to check database connection
app.get('/api/test-db', async (req, res) => {
	try {
		await connectToDatabase();
		if (mongoose.connection.readyState !== 1) {
			throw new Error(`Database not ready. Current state: ${mongoose.connection.readyState}`);
		}
		res.json({
			status: 'connected',
			state: mongoose.connection.readyState,
			host: mongoose.connection.host,
			name: mongoose.connection.name,
			isConnected
		});
	} catch (error) {
		console.error('Database connection test failed:', error);
		res.status(503).json({
			status: 'error',
			error: error instanceof Error ? error.message : 'Unknown error',
			state: mongoose.connection.readyState,
			isConnected
		});
	}
});

// Serve frontend
app.get("/", (req: Request, res: Response) => {
	res.sendFile(path.join(__dirname, "..", "public", "index.html"))
})

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
	console.error(err.stack);
	res.status(500).json({
		error: 'Internal Server Error',
		message: err.message,
		state: mongoose.connection.readyState
	});
});

const PORT = process.env.PORT || 5000

// Only start the server if we're not in a serverless environment
if (process.env.NODE_ENV !== "production") {
	server.listen(PORT, () => {
		console.log(`Server is running on port ${PORT}`)
	})
}

// Export for serverless
export { app, server };
export default app;
