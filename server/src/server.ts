console.log("=== Edit Me backend server starting up! ===");
console.log("Environment:", process.env.NODE_ENV);
console.log("Node version:", process.version);
console.log("Port:", process.env.PORT);
import express, { Application } from "express"
import type { Request, Response, NextFunction } from "express"
import dotenv from "dotenv"
import cors from "cors"
import path from "path"
import mongoose from "mongoose"
import { createServer } from "http"
import { Server } from "socket.io"
import { userRouter } from './routes/userRoutes'
import { SocketEvent, SocketId } from "./types/socket"
import { USER_CONNECTION_STATUS, User } from "./types/user"
import { User as UserModel } from "./models/User"

dotenv.config()

const app: Application = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
	cors: {
		origin: process.env.CLIENT_URL || "http://localhost:5173",
		methods: ["GET", "POST"],
		credentials: true
	}
})

app.use(express.json())
app.use(cors())
app.use(express.static(path.join(__dirname, "public")))

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

function getRoomId(userId: string): string {
	const user = userSocketMap.find((user) => user.socketId === userId);
	if (!user?.roomId) {
		console.error("Room ID is undefined for user ID:", userId);
		throw new Error("Room ID not found");
	}
	return user.roomId;
}

function getUserById(userId: string): User | null {
	const user = userSocketMap.find((user) => user.socketId === userId)
	if (!user) {
		console.error("User not found for ID:", userId)
		return null
	}
	return user
}

// Socket.IO connection handling
io.on('connection', (socket) => {
	console.log('Client connected:', socket.id);

	socket.on(SocketEvent.JOIN_REQUEST, async ({ roomId, username, userId }) => {
		try {
			if (!roomId) {
				socket.emit('error', { message: 'Room ID is required' });
				return;
			}

			const isUsernameExist = getUsersInRoom(roomId).some(
				(u) => u.username === username
			);
			
			if (isUsernameExist) {
				socket.emit(SocketEvent.USERNAME_EXISTS);
				return;
			}

			const user: User = {
				username,
				roomId,
				status: USER_CONNECTION_STATUS.ONLINE,
				cursorPosition: 0,
				typing: false,
				socketId: userId,
				currentFile: null,
			};

			userSocketMap.push(user);
			
			// Join the room
			socket.join(roomId);
			
			// Notify others in the room
			socket.to(roomId).emit(SocketEvent.USER_JOINED, { user });
			
			// Send join accepted with all users in room
			const users = getUsersInRoom(roomId);
			socket.emit(SocketEvent.JOIN_ACCEPTED, { user, users });

			try {
				await UserModel.create({
					...user,
					email: `${username}@temp.com`,
					password: 'socket-user',
				});
			} catch (err) {
				console.error("Error saving user to MongoDB:", err);
			}
		} catch (error) {
			console.error('Join room error:', error);
			socket.emit('error', { message: 'Failed to join room' });
		}
	});

	socket.on('disconnect', async () => {
		const user = getUserById(socket.id);
		if (user) {
			try {
				const roomId = getRoomId(socket.id);
				userSocketMap = userSocketMap.filter((u) => u.socketId !== socket.id);
				
				// Notify others in the room
				socket.to(roomId).emit(SocketEvent.USER_DISCONNECTED, { user });
			} catch (error) {
				console.error('Error handling disconnect:', error);
			}
		}
	});

	// Handle other socket events
	socket.on(SocketEvent.SEND_MESSAGE, (data) => {
		const user = getUserById(socket.id);
		if (user) {
			try {
				const roomId = getRoomId(socket.id);
				socket.to(roomId).emit(SocketEvent.RECEIVE_MESSAGE, data);
			} catch (error) {
				console.error('Error sending message:', error);
			}
		}
	});

	socket.on(SocketEvent.DRAWING_UPDATE, (data) => {
		const user = getUserById(socket.id);
		if (user) {
			try {
				const roomId = getRoomId(socket.id);
				socket.to(roomId).emit(SocketEvent.DRAWING_UPDATE, data);
			} catch (error) {
				console.error('Error sending drawing update:', error);
			}
		}
	});

	// ... handle other events similarly ...
});

// Add a health check endpoint
app.get("/api/health", (req: Request, res: Response) => {
	const healthData = {
		status: "ok",
		message: "Server is running",
		environment: process.env.NODE_ENV,
		timestamp: new Date().toISOString(),
		nodeVersion: process.version,
		uptime: process.uptime(),
		memory: process.memoryUsage(),
		dbState: mongoose.connection.readyState,
		connectedClients: io.engine.clientsCount,
		activeRooms: Array.from(io.sockets.adapter.rooms.keys()).length
	};
	
	// Log health check in production
	if (process.env.NODE_ENV === 'production') {
		console.log('Health check:', healthData);
	}
	
	res.status(200).json(healthData);
});

// Add a test endpoint
app.get("/api/test", (req: Request, res: Response) => {
	res.json({ message: "API is working!" });
});

// Test endpoint to check database connection
app.get('/api/test-db', async (req: Request, res: Response) => {
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
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
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
	httpServer.listen(PORT, () => {
		console.log(`Server is running on port ${PORT}`)
	})
}

// Export for serverless
export { app, io };
export default app;

// Add production-specific error handling
process.on('uncaughtException', (error) => {
	console.error('Uncaught Exception:', error);
	// In production, we might want to gracefully shutdown
	if (process.env.NODE_ENV === 'production') {
		console.error('Shutting down due to uncaught exception');
		process.exit(1);
	}
});

process.on('unhandledRejection', (reason, promise) => {
	console.error('Unhandled Rejection at:', promise, 'reason:', reason);
	// In production, we might want to gracefully shutdown
	if (process.env.NODE_ENV === 'production') {
		console.error('Shutting down due to unhandled rejection');
		process.exit(1);
	}
});
