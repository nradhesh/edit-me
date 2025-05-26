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
import { UserModel } from "./models/User"

dotenv.config()

const app: Application = express()
const httpServer = createServer(app)

// Configure CORS with specific options
const corsOptions = {
	origin: [
		process.env.CLIENT_URL || "http://localhost:5173",
		"https://edit-me-client.vercel.app",
		"https://edit-me.vercel.app"
	],
	methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
	allowedHeaders: ["Content-Type", "Authorization"],
	credentials: true,
	maxAge: 86400 // 24 hours
};

app.use(express.json())
app.use(cors(corsOptions))
app.use(express.static(path.join(__dirname, "public")))

// Mount user routes
app.use('/api/users', userRouter)

const io = new Server(httpServer, {
	cors: corsOptions,
	path: '/socket.io',
	transports: ['websocket'],
	pingTimeout: 60000,
	pingInterval: 25000
})

// MongoDB connection state
let isConnected = false;
let connectionAttempts = 0;
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds

// Connect to MongoDB with serverless-friendly settings and retries
async function connectToDatabase(retryCount = 0): Promise<void> {
	if (isConnected && mongoose.connection.readyState === 1) {
		console.log('MongoDB already connected, skipping connection attempt');
		return;
	}

	try {
		const mongoUri = process.env.MONGODB_URI;
		if (!mongoUri) {
			console.error('MONGODB_URI is not defined in environment variables');
			throw new Error('MONGODB_URI is not defined');
		}

		// Log connection attempt (without sensitive info)
		console.log('Attempting MongoDB connection:', {
			attempt: retryCount + 1,
			maxRetries: MAX_RETRIES,
			uriLength: mongoUri.length,
			hasUsername: mongoUri.includes('mongodb+srv://'),
			hasPassword: mongoUri.includes('@'),
			hasDatabase: mongoUri.includes('/chat-app'),
			timestamp: new Date().toISOString()
		});

		// Close any existing connection first
		if (mongoose.connection.readyState !== 0) {
			console.log('Closing existing MongoDB connection...');
			await mongoose.connection.close();
			isConnected = false;
		}

		console.log(`Attempting to connect to MongoDB (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
		
		// Add more connection options for better reliability
		await mongoose.connect(mongoUri, {
			serverSelectionTimeoutMS: 10000,
			socketTimeoutMS: 45000,
			family: 4,
			maxPoolSize: 10,
			minPoolSize: 5,
			connectTimeoutMS: 20000,
			heartbeatFrequencyMS: 10000,
			retryWrites: true,
			retryReads: true,
			w: 'majority',
			wtimeoutMS: 2500,
			autoIndex: true
		});

		// Verify connection is actually established
		if (mongoose.connection.readyState !== 1) {
			console.error('Connection not ready after connect. State:', mongoose.connection.readyState);
			throw new Error(`Connection not ready after connect. State: ${mongoose.connection.readyState}`);
		}

		isConnected = true;
		connectionAttempts = 0;
		console.log('MongoDB connected successfully:', {
			host: mongoose.connection.host,
			name: mongoose.connection.name,
			readyState: mongoose.connection.readyState,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error(`MongoDB connection error (attempt ${retryCount + 1}/${MAX_RETRIES}):`, {
			error: error instanceof Error ? error.message : 'Unknown error',
			stack: error instanceof Error ? error.stack : undefined,
			readyState: mongoose.connection.readyState,
			timestamp: new Date().toISOString()
		});
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

	// Add MongoDB test handler
	socket.on('test-mongodb', async (data) => {
		const startTime = Date.now();
		console.log('📊 MongoDB test request received:', {
			socketId: socket.id,
			timestamp: data.timestamp,
			test: data.test
		});

		try {
			// Just check connection state without doing a query
			const dbState = mongoose.connection.readyState;
			const isConnected = dbState === 1;

			// Only try to connect if not connected
			if (!isConnected) {
				console.log('🔄 MongoDB not connected, attempting quick connect...');
				// Use a shorter timeout for the test
				await mongoose.connect(process.env.MONGODB_URI!, {
					serverSelectionTimeoutMS: 5000,  // 5 seconds
					socketTimeoutMS: 10000,          // 10 seconds
					connectTimeoutMS: 5000,          // 5 seconds
					family: 4,
					maxPoolSize: 1,                  // Minimal pool for test
					minPoolSize: 0,
					heartbeatFrequencyMS: 10000,
					retryWrites: false,              // Disable retries for test
					retryReads: false,
					w: 1,                           // Lower write concern
					wtimeoutMS: 1000,
					autoIndex: false                // Disable auto-indexing for test
				});
			}

			// Send immediate response
			socket.emit('mongodb-test-response', {
				success: true,
				timestamp: data.timestamp,
				serverReceiveTime: startTime,
				serverProcessTime: Date.now() - startTime,
				dbState: mongoose.connection.readyState,
				isConnected: mongoose.connection.readyState === 1,
				host: mongoose.connection.host,
				name: mongoose.connection.name
			});

			console.log('📊 MongoDB test completed:', {
				socketId: socket.id,
				processTime: Date.now() - startTime,
				dbState: mongoose.connection.readyState
			});
		} catch (error) {
			console.error('❌ MongoDB test failed:', {
				socketId: socket.id,
				error,
				processTime: Date.now() - startTime
			});

			socket.emit('mongodb-test-response', {
				success: false,
				timestamp: data.timestamp,
				serverReceiveTime: startTime,
				serverProcessTime: Date.now() - startTime,
				error: error instanceof Error ? error.message : 'Unknown error',
				dbState: mongoose.connection.readyState,
				isConnected: false
			});
		}
	});

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

// Add a test endpoint to query specific user
app.get('/api/test-user/:userId', async (req: Request, res: Response) => {
	try {
		const userId = req.params.userId;
		console.log('Testing user query for ID:', userId);

		// Ensure MongoDB is connected
		if (mongoose.connection.readyState !== 1) {
			await connectToDatabase();
		}

		// Query the specific user
		const user = await UserModel.findById(userId);
		
		if (!user) {
			return res.status(404).json({
				success: false,
				message: 'User not found',
				query: { userId },
				dbState: mongoose.connection.readyState
			});
		}

		res.json({
			success: true,
			user,
			dbState: mongoose.connection.readyState,
			timestamp: new Date().toISOString()
		});

	} catch (error) {
		console.error('Error querying user:', error);
		res.status(500).json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error',
			dbState: mongoose.connection.readyState
		});
	}
});

// Add a simple test endpoint that's already available
app.get('/api/test-db-user', async (req: Request, res: Response) => {
	try {
		console.log('Testing MongoDB user query...');

		// Ensure MongoDB is connected
		if (mongoose.connection.readyState !== 1) {
			await connectToDatabase();
		}

		// Try to find any user
		const user = await UserModel.findOne({});
		
		if (!user) {
			return res.status(404).json({
				success: false,
				message: 'No users found in database',
				dbState: mongoose.connection.readyState,
				timestamp: new Date().toISOString()
			});
		}

		res.json({
			success: true,
			message: 'Database connection successful',
			user: {
				id: user._id,
				username: user.username,
				roomId: user.roomId,
				status: user.status
			},
			dbState: mongoose.connection.readyState,
			timestamp: new Date().toISOString()
		});

	} catch (error) {
		console.error('Error testing database:', error);
		res.status(500).json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error',
			dbState: mongoose.connection.readyState,
			timestamp: new Date().toISOString()
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

const PORT = parseInt(process.env.PORT || '5000', 10)

// Only start the server if we're not in a serverless environment
if (process.env.NODE_ENV !== "production") {
	httpServer.listen(PORT, () => {
		console.log(`Server is running on port ${PORT}`)
	})
} else {
	// In production (Render), always start the server
	httpServer.listen(PORT, () => {
		console.log(`Server is running in production mode on port ${PORT}`)
		console.log('Server bound to all network interfaces')
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
