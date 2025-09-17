import express from "express";
import pool from "../db.js";
import bcrypt from "bcrypt";
import { authenticateToken } from "../middleware/authorization.js";
import {jwtTokens} from  '../utils/jwt-helpers.js';

const router = express.Router();

router.get("/", authenticateToken, async (req, res) => {
  try {
    const users = await pool.query("select * from users");
    res.json({ users: users.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/signup", async (req, res) => {
  try {
    let hashPassword;
    bcrypt.genSalt(10, function (err, salt) {
      bcrypt.hash(req.body.password, salt, async function (err, hash) {
        // Store hash in your password DB.
        console.log(req.body.password, hash);
        const newUSers = await pool.query(
          "insert into users (name, email, phone_number, password, created_at, role) values ($1, $2, $3, $4, $5, $6) returning *",
          [
            req.body.name,
            req.body.email,
            req.body.phone,
            hash,
            req.body.createdAt,
            req.body.role,
          ]
        );
        // res.json({users : newUSers.rows[0]});
        let tokens = await jwtTokens(newUSers.rows[0]);
        res.cookie("refresh_token", tokens.refreshToken, { httpOnly: true });
        let response = {
          tokens: tokens,
          details: newUSers.rows[0],
        };
        res.json(response);
      });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
