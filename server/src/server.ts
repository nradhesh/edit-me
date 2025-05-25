import express, { Express } from "express"
import type { Request, Response, NextFunction } from "express-serve-static-core"
import dotenv from "dotenv"
import cors from "cors"
import path from "path"
import mongoose from "mongoose"
import Pusher from "pusher"
import { userRouter } from './routes/userRoutes'
import { SocketEvent, SocketId } from "./types/socket"
import { USER_CONNECTION_STATUS, User } from "./types/user"
import { User as UserModel } from "./models/User"

dotenv.config()

const app: Express = express()
app.use(express.json())
app.use(cors())
app.use(express.static(path.join(__dirname, "public")))

// Initialize Pusher
const pusher = new Pusher({
	appId: process.env.PUSHER_APP_ID!,
	key: process.env.PUSHER_KEY!,
	secret: process.env.PUSHER_SECRET!,
	cluster: process.env.PUSHER_CLUSTER!,
	useTLS: true
});

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

// Pusher webhook endpoint for presence channels
app.post('/api/pusher/auth', (req: Request, res: Response) => {
	const socketId = req.body.socket_id;
	const channel = req.body.channel_name;
	const presenceData = {
		user_id: socketId,
		user_info: {
			// Add any user info you want to share
			timestamp: new Date().toISOString()
		}
	};

	try {
		const authResponse = pusher.authorizeChannel(socketId, channel, presenceData);
		res.send(authResponse);
	} catch (error) {
		console.error('Pusher auth error:', error);
		res.status(403).send('Forbidden');
	}
});

// Join room endpoint
app.post('/api/join-room', async (req: Request, res: Response) => {
	const { roomId, username } = req.body;
	
	try {
		const isUsernameExist = getUsersInRoom(roomId).some(
			(u) => u.username === username
		);
		
		if (isUsernameExist) {
			return res.status(400).json({ error: 'Username already exists' });
		}

		const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
		
		// Trigger user joined event
		await pusher.trigger(roomId, SocketEvent.USER_JOINED, { user });
		
		// Get all users in room and send join accepted
		const users = getUsersInRoom(roomId);
		await pusher.trigger(userId, SocketEvent.JOIN_ACCEPTED, { user, users });

		try {
			await UserModel.create({
				...user,
				email: `${username}@temp.com`,
				password: 'socket-user',
			});
		} catch (err) {
			console.error("Error saving user to MongoDB:", err);
		}

		res.json({ success: true, userId });
	} catch (error) {
		console.error('Join room error:', error);
		res.status(500).json({ error: 'Failed to join room' });
	}
});

// Leave room endpoint
app.post('/api/leave-room', async (req: Request, res: Response) => {
	const { userId } = req.body;
	
	try {
		const user = getUserById(userId);
		if (!user) {
			return res.status(404).json({ error: 'User not found' });
		}

		const roomId = getRoomId(userId);
		userSocketMap = userSocketMap.filter((u) => u.socketId !== userId);
		
		// Trigger user left event
		await pusher.trigger(roomId, SocketEvent.USER_DISCONNECTED, { user });
		
		res.json({ success: true });
	} catch (error) {
		console.error('Leave room error:', error);
		res.status(500).json({ error: 'Failed to leave room' });
	}
});

// Add a Pusher health check endpoint
app.get("/api/pusher-health", (req: Request, res: Response) => {
	try {
		res.status(200).json({ 
			status: "ok", 
			message: "Pusher is configured",
			environment: process.env.NODE_ENV,
			timestamp: new Date().toISOString(),
			appId: process.env.PUSHER_APP_ID ? 'configured' : 'missing',
			key: process.env.PUSHER_KEY ? 'configured' : 'missing',
			cluster: process.env.PUSHER_CLUSTER ? 'configured' : 'missing'
		});
	} catch (error) {
		console.error('Pusher health check failed:', error);
		res.status(500).json({
			status: 'error',
			message: 'Pusher check failed',
			error: error instanceof Error ? error.message : 'Unknown error'
		});
	}
});

// Middleware to check database connection with retries
async function checkDbConnection(req: Request, res: Response, next: NextFunction) {
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

// Add a test endpoint for Pusher
app.get("/api/test-pusher", async (req: Request, res: Response) => {
    try {
        // Test Pusher connection
        await pusher.trigger('test-channel', 'test-event', {
            message: 'Test message',
            timestamp: new Date().toISOString()
        });

        res.status(200).json({
            status: "ok",
            message: "Pusher test successful",
            config: {
                appId: process.env.PUSHER_APP_ID ? 'configured' : 'missing',
                key: process.env.PUSHER_KEY ? 'configured' : 'missing',
                cluster: process.env.PUSHER_CLUSTER ? 'configured' : 'missing',
                secret: process.env.PUSHER_SECRET ? 'configured' : 'missing'
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Pusher test failed:', error);
        res.status(500).json({
            status: 'error',
            message: 'Pusher test failed',
            error: error instanceof Error ? error.message : 'Unknown error',
            config: {
                appId: process.env.PUSHER_APP_ID ? 'configured' : 'missing',
                key: process.env.PUSHER_KEY ? 'configured' : 'missing',
                cluster: process.env.PUSHER_CLUSTER ? 'configured' : 'missing',
                secret: process.env.PUSHER_SECRET ? 'configured' : 'missing'
            }
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
	app.listen(PORT, () => {
		console.log(`Server is running on port ${PORT}`)
	})
}

// Export for serverless
export { app, pusher };
export default app;
