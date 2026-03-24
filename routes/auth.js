import express from 'express';
import pool from '../db.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import {jwtTokens} from  '../utils/jwt-helpers.js';
import { authenticateToken } from '../middleware/authorization.js';

const router = express.Router();

router.post('/login', async(req,res)=> {
    try {
        const {email, password} = req.body;
        const users = await pool.query('select * from users where email = $1', [email]);
        if(users.rows.length === 0) return res.status(401).json({error: 'Email does not exist'});
        // check password
        const validPassword = await bcrypt.compare(password, users.rows[0].password);
        if(!validPassword) return res.status(401).json({error: 'Incorrect Password'});
         //jwt
         let tokens = jwtTokens(users.rows[0]);
         res.cookie('refresh_token', tokens.refreshToken, {httpOnly: true});
         let response = {
            tokens: tokens,
            details: users.rows[0]
         }
         res.json(response);
         
    }
    catch(error) {
        res.status(401).json({error: error.message});
    }
})

router.post('/refresh-token', (req,res) => {
    try {
        // Support both cookie and body refresh token
        const refreshToken = req.cookies.refresh_token || req.body.refreshToken;
        if(!refreshToken) return res.status(401).json({error: 'No refresh token'});
        jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, (error, user)=> {
            if(error) return res.status(403).json({error: error.message})
            let tokens = jwtTokens(user);
            res.cookie('refresh_token', tokens.refreshToken, {httpOnly: true});
            res.json({tokens: tokens});
        })
    }
    catch(error){
        res.status(401).json({error: error.message});
    }
})

// Keep the old GET endpoint for backward compatibility
router.get('/refreshToken', (req,res) => {
    try {
        const refreshToken = req.cookies.refresh_token;
        if(refreshToken === null) return res.status(401).json({error: 'No refresh token'});
        jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, (error, user)=> {
            if(error) return res.status(403).json({error: error.message})
            let tokens = jwtTokens(user);
            res.cookie('refresh_token', tokens.refreshToken, {httpOnly: true});
            res.json(tokens);
        })
    }
    catch(error){
        res.status(401).json({error: error.message});
    }
})

router.post('/logout', (req, res) => {
    try {
        // Clear the refresh token cookie
        res.clearCookie('refresh_token', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production', // Use secure flag in production
            sameSite: 'strict'
        });
        
        // Send success response
        res.status(200).json({ 
            message: 'Logged out successfully',
            success: true 
        });
    } catch (error) {
        res.status(500).json({ 
            error: error.message,
            success: false 
        });
    }
});

router.get('/profile/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Query user data by ID, excluding password
        const result = await pool.query(
            'SELECT id, name, email, phone_number, created_at, role, gender, emergency_contact, address FROM users WHERE id = $1',
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                error: 'User not found',
                success: false 
            });
        }
        
        // Return user data
        const user = result.rows[0];
        res.status(200).json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phoneNumber: user.phone_number,
                createdAt: user.created_at,
                role: user.role,
                gender: user.gender,
                emergencyContact: user.emergency_contact,
                address: user.address
            }
        });
    } catch (error) {
        res.status(500).json({ 
            error: error.message,
            success: false 
        });
    }
});

router.put('/profile/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, gender, phoneNumber, address, emergencyContact } = req.body;
        
        // Verify user exists
        const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
        
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ 
                error: 'User not found',
                success: false 
            });
        }
        
        // Update user profile
        const updateQuery = `
            UPDATE users 
            SET name = $1, phone_number = $2, gender = $3, emergency_contact = $4, address = $5
            WHERE id = $6
            RETURNING id, name, email, phone_number, created_at, role, gender, emergency_contact, address
        `;
        
        const result = await pool.query(updateQuery, [
            name,
            phoneNumber,
            gender,
            emergencyContact,
            address,
            id
        ]);
        
        const updatedUser = result.rows[0];
        
        res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
            user: {
                id: updatedUser.id,
                name: updatedUser.name,
                email: updatedUser.email,
                phoneNumber: updatedUser.phone_number,
                createdAt: updatedUser.created_at,
                role: updatedUser.role,
                gender: updatedUser.gender,
                emergencyContact: updatedUser.emergency_contact,
                address: updatedUser.address
            }
        });
    } catch (error) {
        res.status(500).json({ 
            error: error.message,
            success: false 
        });
    }
});

export default router;