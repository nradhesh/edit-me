import mongoose, { Document } from 'mongoose';
import { USER_CONNECTION_STATUS } from "../types/user"

export interface IUser extends Document {
    username: string
    socketId: string
    roomId: string
    status: USER_CONNECTION_STATUS
    cursorPosition: number
    typing: boolean
    currentFile: string | null
    createdAt: Date
    updatedAt: Date
}

// Define the User schema
const userSchema = new mongoose.Schema({
    username: { type: String, required: true },
    roomId: { type: String, required: true },
    status: { type: String, enum: ['online', 'offline'], default: 'offline' },
    cursorPosition: { type: Number, default: 0 },
    typing: { type: Boolean, default: false },
    currentFile: { type: String, default: null },
    socketId: { type: String, required: true }
}, {
    timestamps: true,
    collection: 'users' // Explicitly set collection name
});

// Index for faster queries
userSchema.index({ roomId: 1, status: 1 })
userSchema.index({ socketId: 1 }, { unique: true })
userSchema.index({ updatedAt: 1 })

// Create and export the User model
export const UserModel = mongoose.model('User', userSchema, 'users'); // Explicitly specify collection name
