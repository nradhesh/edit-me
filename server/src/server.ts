import express, { Request, Response } from "express"
import dotenv from "dotenv"
import http from "http"
import cors from "cors"
import { Server } from "socket.io"
import path from "path"
import mongoose from "mongoose"

import { SocketEvent, SocketId } from "./types/socket"
import { USER_CONNECTION_STATUS, User } from "./types/user"
import UserModel from "./models/User"

dotenv.config()

const app = express()
app.use(express.json())
app.use(cors())
app.use(express.static(path.join(__dirname, "public")))

const server = http.createServer(app)
const io = new Server(server, {
	cors: {
		origin: "*",
	},
	maxHttpBufferSize: 1e8,
	pingTimeout: 60000,
})

// MongoDB connection options
const mongooseOptions = {
	serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
	socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
	connectTimeoutMS: 10000, // Give up initial connection after 10s
	maxPoolSize: 10, // Maintain up to 10 socket connections
	minPoolSize: 5, // Maintain at least 5 socket connections
	retryWrites: true,
	retryReads: true
};

mongoose
	.connect(process.env.MONGODB_URI as string, mongooseOptions)
	.then(() => {
		console.log("MongoDB connected successfully");
		console.log("Connection state:", mongoose.connection.readyState);
	})
	.catch((err) => {
		console.error("MongoDB connection error:", err);
		console.error("Connection string (without password):", 
			(process.env.MONGODB_URI as string).replace(/\/\/[^:]+:[^@]+@/, '//****:****@'));
	});

// Add connection event handlers
mongoose.connection.on('connected', () => {
	console.log('Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
	console.error('Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
	console.log('Mongoose disconnected from MongoDB');
});

let userSocketMap: User[] = []

function getUsersInRoom(roomId: string): User[] {
	return userSocketMap.filter((user) => user.roomId == roomId)
}

function getRoomId(socketId: SocketId): string | null {
	const roomId = userSocketMap.find((user) => user.socketId === socketId)?.roomId
	if (!roomId) {
		console.error("Room ID is undefined for socket ID:", socketId)
		return null
	}
	return roomId
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
			await UserModel.create(user)
		} catch (err) {
			console.error("Error saving user to MongoDB:", err)
		}
	})

	socket.on("disconnecting", () => {
		const user = getUserBySocketId(socket.id)
		if (!user) return
		const roomId = user.roomId
		socket.broadcast.to(roomId).emit(SocketEvent.USER_DISCONNECTED, { user })
		userSocketMap = userSocketMap.filter((u) => u.socketId !== socket.id)
		socket.leave(roomId)
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
		const roomId = user.roomId
		socket.broadcast.to(roomId).emit(SocketEvent.TYPING_START, { user })
	})

	socket.on(SocketEvent.TYPING_PAUSE, () => {
		userSocketMap = userSocketMap.map((user) =>
			user.socketId === socket.id ? { ...user, typing: false } : user
		)
		const user = getUserBySocketId(socket.id)
		if (!user) return
		const roomId = user.roomId
		socket.broadcast.to(roomId).emit(SocketEvent.TYPING_PAUSE, { user })
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

// Database connection check middleware
const checkDbConnection = (req: Request, res: Response, next: Function) => {
	if (mongoose.connection.readyState !== 1) {
		return res.status(503).json({
			error: "Database connection not ready",
			state: mongoose.connection.readyState,
			message: "Please try again in a few moments"
		});
	}
	next();
};

// Apply middleware to all API routes
app.use("/api", checkDbConnection);

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
		timestamp: new Date().toISOString()
	});
});

// API route to retrieve all users stored in MongoDB
app.get("/api/users", async (req: Request, res: Response) => {
	try {
		console.log("Attempting to fetch users from MongoDB...");
		const users = await UserModel.find({}).maxTimeMS(5000); // Add timeout to the query
		console.log(`Successfully fetched ${users.length} users`);
		res.json(users);
	} catch (err) {
		console.error("Detailed error fetching users:", err);
		res.status(500).json({ 
			error: "Failed to fetch users",
			details: err instanceof Error ? err.message : "Unknown error",
			connectionState: mongoose.connection.readyState
		});
	}
});

// Add a test endpoint to check MongoDB connection
app.get("/api/test-db", async (req: Request, res: Response) => {
	try {
		const dbState = mongoose.connection.readyState;
		const states: Record<number, string> = {
			0: "disconnected",
			1: "connected",
			2: "connecting",
			3: "disconnecting"
		};
		
		res.json({
			status: "ok",
			dbState: states[dbState] || "unknown",
			readyState: dbState,
			message: dbState === 1 ? "MongoDB is connected" : "MongoDB is not connected"
		});
	} catch (err) {
		res.status(500).json({
			error: "Database connection test failed",
			details: err instanceof Error ? err.message : "Unknown error"
		});
	}
});

// Serve frontend
app.get("/", (req: Request, res: Response) => {
	res.sendFile(path.join(__dirname, "..", "public", "index.html"))
})

// Handle 404s
app.use((req: Request, res: Response) => {
	res.status(404).json({ error: "Not Found" });
});

const PORT = process.env.PORT || 3000

// Only start the server if we're not in a serverless environment
if (process.env.NODE_ENV !== "production") {
	server.listen(PORT, () => {
		console.log(`Listening on port ${PORT}`)
	})
}

// Export for serverless
export { app, server };
export default app;
