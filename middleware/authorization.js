import jwt from 'jsonwebtoken';
import pool from '../db.js';


function authenticateToken(req, res,next) {
    const authHeader = req.headers['authorization']; //Bearer Token
    const token = authHeader && authHeader.split(' ')[1];
    if(token == null) return res.status(401).json({error: 'Null Token'});
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, user) => {
        if(error) return res.status(403).json({error: error.message})
        req.user = user;
        next();
    })
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