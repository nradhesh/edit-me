import mongoose from "mongoose"

export enum USER_CONNECTION_STATUS {
  ONLINE = "online",
  OFFLINE = "offline",
  AWAY = "away",
}

export interface IUser {
  username: string
  email: string
  password: string
  roomId?: string
  status?: USER_CONNECTION_STATUS
  cursorPosition?: number
  typing?: boolean
  currentFile?: string | null
  socketId?: string
  createdAt: Date
  updatedAt: Date
}

const userSchema = new mongoose.Schema<IUser>({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  roomId: { type: String },
  status: {
    type: String,
    enum: Object.values(USER_CONNECTION_STATUS),
    default: USER_CONNECTION_STATUS.OFFLINE
  },
  cursorPosition: { type: Number, default: 0 },
  typing: { type: Boolean, default: false },
  currentFile: { type: String, default: null },
  socketId: { type: String }
}, { 
  timestamps: true,
  toJSON: {
    transform: (doc, ret) => {
      delete ret.password;
      return ret;
    }
  }
});

// Add index for faster queries
userSchema.index({ username: 1, email: 1 });

export const User = mongoose.model<IUser>("User", userSchema)
