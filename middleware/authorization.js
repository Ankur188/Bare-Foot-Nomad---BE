import jwt from 'jsonwebtoken';
import pool from '../db.js';
import { jwtTokens } from '../utils/jwt-helpers.js';

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    const refreshToken = req.cookies.refresh_token || req.headers['x-refresh-token'];
    
    if (token == null) return res.status(401).json({ error: 'Null Token' });
    
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, user) => {
        if (error) {
            // Access token expired, try to refresh if refresh token exists
            if (error.name === 'TokenExpiredError' && refreshToken) {
                jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, (refreshError, refreshedUser) => {
                    if (refreshError) {
                        return res.status(401).json({ error: 'Session expired. Please login again.' });
                    }
                    
                    // Generate new tokens
                    const newTokens = jwtTokens(refreshedUser);
                    
                    // Set refresh token in cookie
                    res.cookie('refresh_token', newTokens.refreshToken, { httpOnly: true });
                    
                    // Add new tokens to response headers
                    res.setHeader('X-New-Access-Token', newTokens.accessToken);
                    res.setHeader('X-New-Refresh-Token', newTokens.refreshToken);
                    
                    req.user = refreshedUser;
                    return next();
                });
            } else {
                return res.status(403).json({ error: error.message });
            }
        } else {
            req.user = user;
            next();
        }
    });
}

async function authorizeSuperadmin(req, res, next) {
    try {
        const userId = req.user?.user_id;

        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized user context' });
        }

        const userResult = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const role = (userResult.rows[0].role || '').toLowerCase();
        if (role !== 'superadmin') {
            return res.status(403).json({ error: 'Superadmin access required' });
        }

        return next();
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

export {authenticateToken, authorizeSuperadmin};