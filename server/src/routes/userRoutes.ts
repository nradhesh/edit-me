import express, { Router } from "express"
import type { Request, Response } from "express-serve-static-core"
import mongoose from 'mongoose';
import { User } from '../models/User';
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"

const router: Router = express.Router();

// Get all users with timeout and error handling
router.get('/', async (req: express.Request, res: express.Response) => {
  try {
    const users = await User.find()
      .select('-password') // Exclude password field
      .maxTimeMS(3000) // Set query timeout to 3 seconds
      .exec();

    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      error: 'Failed to fetch users',
      details: error instanceof Error ? error.message : 'Unknown error',
      state: mongoose.connection.readyState
    });
  }
});

// Get user by ID
router.get('/:id', async (req: express.Request, res: express.Response) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password')
      .maxTimeMS(3000)
      .exec();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({
      error: 'Failed to fetch user',
      details: error instanceof Error ? error.message : 'Unknown error',
      state: mongoose.connection.readyState
    });
  }
});

export const userRouter = router; 