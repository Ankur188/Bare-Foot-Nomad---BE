import express from 'express';
import pool from '../../db.js';

const router = express.Router();

// GET all leads
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        id,
        type,
        name,
        location,
        travellers,
        days,
        email,
        phone,
        message,
        budget,
        date,
        created_at
       FROM leads
       ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE a lead
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM leads WHERE id = $1', [id]);
    res.json({ message: 'Lead deleted successfully' });
  } catch (error) {
    console.error('Error deleting lead:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
