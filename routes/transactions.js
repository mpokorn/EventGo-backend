import express from "express";
import pool from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { validateId, sanitizeBody } from "../middleware/validation.js";
import { userExists } from "../utils/dbHelpers.js";

const router = express.Router();

// Protect all transaction routes
router.use(requireAuth);
router.use(sanitizeBody);

/**
 * @swagger
 * tags:
 *   name: Transactions
 *   description: Transaction management endpoints
 */

/**
 * @swagger
 * /transactions:
 *   get:
 *     summary: Get all transactions
 *     tags: [Transactions]
 *     responses:
 *       200:
 *         description: List of all transactions
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Transaction'
 */
router.get("/", async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT 
        tr.id,
        tr.user_id AS buyer_id,
        u.first_name || ' ' || u.last_name AS buyer_name,
        tr.total_price,
        tr.status,
        tr.payment_method,
        tr.reference_code,
        tr.created_at,
        COUNT(t.id) AS total_tickets
      FROM transactions tr
      JOIN users u ON tr.user_id = u.id
      LEFT JOIN tickets t ON tr.id = t.transaction_id
      GROUP BY tr.id, u.first_name, u.last_name
      ORDER BY tr.created_at DESC;
    `);

    res.status(200).json(result.rows);
  } catch (err) {
    console.error("❌ Error in GET /transactions:", err);
    next(err);
  }
});

/**
 * @swagger
 * /transactions/user/{id}:
 *   get:
 *     summary: Get all transactions for a user
 *     tags: [Transactions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: User transactions
 *       404:
 *         description: User not found
 */
router.get("/user/:id", validateId('id'), async (req, res, next) => {
  const userId = req.params.id; // Already validated

  try {
    // Use helper to check if user exists
    const exists = await userExists(userId);
    if (!exists) {
      return res.status(404).json({
        message: `User with ID ${userId} does not exist.`,
      });
    }

    // Get user info for response
    const userCheck = await pool.query(
      `SELECT id, first_name, last_name FROM users WHERE id = $1;`,
      [userId]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        message: `User with ID ${userId} does not exist.`,
      });
    }

    // Fetch user transactions with event and ticket type details
    const transactionsResult = await pool.query(
      `
      SELECT 
        tr.id,
        tr.user_id AS buyer_id,
        u.first_name || ' ' || u.last_name AS buyer_name,
        tr.total_price,
        tr.status,
        tr.payment_method,
        tr.reference_code,
        tr.created_at,
        COUNT(t.id) AS quantity,
        e.title AS event_title,
        tt.type AS ticket_type
      FROM transactions tr
      JOIN users u ON tr.user_id = u.id
      LEFT JOIN tickets t ON tr.id = t.transaction_id
      LEFT JOIN events e ON t.event_id = e.id
      LEFT JOIN ticket_types tt ON t.ticket_type_id = tt.id
      WHERE tr.user_id = $1
      GROUP BY tr.id, u.first_name, u.last_name, e.title, tt.type
      ORDER BY tr.created_at DESC;
      `,
      [userId]
    );

    // If no transactions found
    if (transactionsResult.rows.length === 0) {
      return res.status(200).json({
        message: `User ${userCheck.rows[0].first_name} ${userCheck.rows[0].last_name} currently has no transactions.`,
        transactions: [],
      });
    }

    // Success: return user's transactions
    res.status(200).json({
      message: `Transactions found for user ${userCheck.rows[0].first_name} ${userCheck.rows[0].last_name}.`,
      transactions: transactionsResult.rows,
    });

  } catch (err) {
    console.error(" Error in GET /transactions/user/:id:", err);
    next(err);
  }
});


/**
 * @swagger
 * /transactions/{id}:
 *   get:
 *     summary: Get transaction details
 *     tags: [Transactions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Transaction details with tickets
 *       404:
 *         description: Transaction not found
 */
router.get("/:id", validateId('id'), async (req, res, next) => {
  const id = req.params.id; // Already validated

  try {
    const transactionResult = await pool.query(
      `
      SELECT 
        tr.id,
        tr.user_id AS buyer_id,
        u.first_name || ' ' || u.last_name AS buyer_name,
        tr.total_price,
        tr.status,
        tr.payment_method,
        tr.reference_code,
        tr.created_at
      FROM transactions tr
      JOIN users u ON tr.user_id = u.id
      WHERE tr.id = $1;
      `,
      [id]
    );

    if (transactionResult.rows.length === 0) {
      return res.status(404).json({ message: "Transaction not found!" });
    }

    const ticketsResult = await pool.query(
      `
      SELECT 
        e.title AS event_name,
        tt.type AS ticket_type,
        tt.price AS ticket_price,
        COUNT(t.id) AS quantity,
        SUM(tt.price) AS subtotal
      FROM tickets t
      JOIN events e ON t.event_id = e.id
      LEFT JOIN ticket_types tt ON t.ticket_type_id = tt.id
      WHERE t.transaction_id = $1
      GROUP BY e.title, tt.type, tt.price;
      `,
      [id]
    );


    const transaction = transactionResult.rows[0];
    transaction.tickets = ticketsResult.rows;

    res.status(200).json(transaction);
  } catch (err) {
    console.error(" Error in GET /transactions/:id:", err);
    next(err);
  }
});

/**
 * @swagger
 * /transactions:
 *   post:
 *     summary: Create a transaction manually
 *     tags: [Transactions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user_id
 *               - total_price
 *             properties:
 *               user_id:
 *                 type: integer
 *               total_price:
 *                 type: number
 *               status:
 *                 type: string
 *                 enum: [completed, pending, cancelled]
 *               payment_method:
 *                 type: string
 *     responses:
 *       201:
 *         description: Transaction created
 */
router.post("/", async (req, res, next) => {
  const { user_id, total_price, status, payment_method, reference_code } = req.body;

  if (!user_id || !total_price) {
    return res.status(400).json({ message: "Missing required data to create transaction!" });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO transactions (user_id, total_price, status, payment_method, reference_code)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
      `,
      [user_id, total_price, status || "completed", payment_method || "card", reference_code || null]
    );

    res.status(201).json({
      message: "Transaction successfully added!",
      transaction: result.rows[0],
    });
  } catch (err) {
    console.error(" Error in POST /transactions:", err);
    next(err);
  }
});

/**
 * @swagger
 * /transactions/{id}:
 *   delete:
 *     summary: Delete a transaction
 *     tags: [Transactions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Transaction deleted
 *       404:
 *         description: Transaction not found
 */
router.delete("/:id", validateId('id'), async (req, res, next) => {
  const id = req.params.id; // Already validated

  try {
    const result = await pool.query(
      `DELETE FROM transactions WHERE id = $1 RETURNING *;`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Transaction not found!" });
    }

    res.status(200).json({
      message: "Transaction successfully deleted!",
      deleted: result.rows[0],
    });
  } catch (err) {
    console.error(" Error in DELETE /transactions/:id:", err);
    next(err);
  }
});

export default router;
