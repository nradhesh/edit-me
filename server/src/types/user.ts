import { IUser } from '../models/User';

export enum USER_CONNECTION_STATUS {
	ONLINE = "online",
	OFFLINE = "offline",
	AWAY = "away"
}

export interface User {
	username: string
	socketId: string
	roomId: string
	status: USER_CONNECTION_STATUS
	cursorPosition: number
	typing: boolean
	currentFile: string | null
	createdAt?: Date
	updatedAt?: Date
}

export interface RemoteUser extends Omit<User, 'socketId'> {
	id: string
}
