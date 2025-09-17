import express from 'express';
import pool from '../db.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import {jwtTokens} from  '../utils/jwt-helpers.js';

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

export default router;