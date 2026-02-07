import express from "express";
import pool from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { validateId, validateIds, validateNumber, sanitizeBody } from "../middleware/validation.js";
import { userExists, eventExists } from "../utils/dbHelpers.js";

const router = express.Router();

// Protect all waitlist routes - must be authenticated
router.use(requireAuth);
router.use(sanitizeBody);

/* --------------------------------------
  Helper: Cleanup expired reservations and reassign to waitlist
-------------------------------------- */
export async function cleanupExpiredReservations() {
  const client = await pool.connect();
  
  try {
    // Find all expired reservations from waitlist (30 minutes after offered_at)
    const expiredResult = await client.query(
      `SELECT t.id, t.event_id, t.ticket_type_id, t.user_id, t.transaction_id, w.id as waitlist_id
       FROM tickets t
       JOIN transactions tx ON t.transaction_id = tx.id
       LEFT JOIN waitlist w ON w.user_id = t.user_id AND w.event_id = t.event_id
       WHERE t.status = 'reserved' 
       AND tx.status = 'pending'
       AND w.reservation_expires_at IS NOT NULL
       AND w.reservation_expires_at < NOW()
       FOR UPDATE OF t SKIP LOCKED;`
    );

    if (expiredResult.rows.length === 0) {
      return { cleaned: 0 };
    }

    //console.log(` Found ${expiredResult.rows.length} expired reservations to cleanup`);

    for (const expiredTicket of expiredResult.rows) {
      await client.query('BEGIN');
      
      try {
        // Cancel the transaction
        await client.query(
          `UPDATE transactions SET status = 'expired' WHERE id = $1;`,
          [expiredTicket.transaction_id]
        );

        // Delete the expired reserved ticket
        await client.query(
          `DELETE FROM tickets WHERE id = $1;`,
          [expiredTicket.id]
        );

        // Remove from waitlist (their reservation expired)
        if (expiredTicket.waitlist_id) {
          await client.query(
            `DELETE FROM waitlist WHERE id = $1;`,
            [expiredTicket.waitlist_id]
          );
        }

        //console.log(`⏰ Expired reservation for user ${expiredTicket.user_id}, offering to next in waitlist...`);

        // Try to assign to next person in waitlist
        const nextAssignment = await assignTicketToWaitlist(expiredTicket.event_id, expiredTicket.ticket_type_id);
        
        if (nextAssignment.assigned) {
          //console.log(`✅ Ticket assigned to user ${nextAssignment.user_id}`);
        }

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`❌ Error cleaning up expired reservation ${expiredTicket.id}:`, error);
      }
    }

    return { cleaned: expiredResult.rows.length };

  } catch (error) {
    console.error("❌ Error in cleanupExpiredReservations:", error);
    throw error;
  } finally {
    client.release();
  }
}

// Run cleanup every 2 minutes
setInterval(() => {
  cleanupExpiredReservations().catch(err => {
    console.error("❌ Error in scheduled reservation cleanup:", err);
  });
}, 2 * 60 * 1000); // 2 minutes

/**
 * @swagger
 * tags:
 *   name: Waitlist
 *   description: Waitlist management for sold-out events
 */

/**
 * @swagger
 * /waitlist:
 *   get:
 *     summary: Get all waitlist entries
 *     tags: [Waitlist]
 *     parameters:
 *       - in: query
 *         name: event_id
 *         schema:
 *           type: integer
 *         description: Filter by event ID
 *       - in: query
 *         name: user_id
 *         schema:
 *           type: integer
 *         description: Filter by user ID
 *     responses:
 *       200:
 *         description: List of waitlist entries
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Waitlist'
 */
router.get("/", async (req, res, next) => {
  const { event_id, user_id } = req.query;

  try {
    let query = `
      SELECT 
        w.id,
        w.user_id,
        (u.first_name || ' ' || u.last_name) AS user_name,
        u.email AS user_email,
        w.event_id,
        e.title AS event_title,
        e.start_datetime,
        w.joined_at
      FROM waitlist w
      JOIN users u ON w.user_id = u.id
      JOIN events e ON w.event_id = e.id
    `;

    const params = [];
    if (event_id) {
      query += ` WHERE w.event_id = $1`;
      params.push(event_id);
    } else if (user_id) {
      query += ` WHERE w.user_id = $1`;
      params.push(user_id);
    }

    query += ` ORDER BY w.joined_at ASC;`;

    const result = await pool.query(query, params);

    return res.status(200).json({
      message: "Waitlist entries retrieved successfully.",
      total_entries: result.rowCount,
      waitlist: result.rows,
    });

  } catch (err) {
    console.error(" Error in GET /waitlist:", err);
    next(err);
  }
});

/**
 * @swagger
 * /waitlist/event/{event_id}:
 *   get:
 *     summary: Get waitlist entries for an event
 *     tags: [Waitlist]
 *     parameters:
 *       - in: path
 *         name: event_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Waitlist entries for event
 *       404:
 *         description: Event not found
 */
router.get("/event/:event_id", validateId('event_id'), async (req, res, next) => {
  const event_id = req.params.event_id; // Already validated

  try {
    // Check if event exists
    const exists = await eventExists(event_id);
    if (!exists) {
      return res.status(404).json({ message: "Event does not exist!" });
    }

    const eventCheck = await pool.query(
      `SELECT id, title FROM events WHERE id = $1;`,
      [event_id]
    );

    const result = await pool.query(
      `
      SELECT 
        w.id,
        w.user_id,
        (u.first_name || ' ' || u.last_name) AS user_name,
        u.email,
        w.joined_at
      FROM waitlist w
      JOIN users u ON w.user_id = u.id
      WHERE w.event_id = $1
      ORDER BY w.joined_at ASC;
      `,
      [event_id]
    );

    return res.status(200).json({
      event_id,
      event_title: eventCheck.rows[0].title,
      total_waiting: result.rowCount,
      waitlist: result.rows,
    });

  } catch (err) {
    console.error(" Error in GET /waitlist/event/:event_id:", err);
    next(err);
  }
});

/**
 * @swagger
 * /waitlist/user/{user_id}:
 *   get:
 *     summary: Get waitlist entries for a user
 *     tags: [Waitlist]
 *     parameters:
 *       - in: path
 *         name: user_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: User's waitlist entries with position
 */
router.get("/user/:user_id", validateId('user_id'), async (req, res, next) => {
  const user_id = req.params.user_id; // Already validated

  try {
    const result = await pool.query(
      `
      WITH ranked_waitlist AS (
        SELECT 
          w.id,
          w.user_id,
          w.event_id,
          w.joined_at,
          ROW_NUMBER() OVER (PARTITION BY w.event_id ORDER BY w.joined_at ASC) as position
        FROM waitlist w
      )
      SELECT 
        rw.id,
        rw.user_id,
        (u.first_name || ' ' || u.last_name) AS user_name,
        u.email AS user_email,
        rw.event_id,
        e.title AS event_name,
        e.start_datetime,
        e.end_datetime,
        rw.joined_at,
        rw.position
      FROM ranked_waitlist rw
      JOIN users u ON rw.user_id = u.id
      JOIN events e ON rw.event_id = e.id
      WHERE rw.user_id = $1
      ORDER BY rw.joined_at ASC;
      `,
      [user_id]
    );

    return res.status(200).json({ waitlist: result.rows });

  } catch (err) {
    console.error("Error in GET /waitlist/user/:user_id:", err);
    next(err);
  }
});

/**
 * @swagger
 * /waitlist:
 *   post:
 *     summary: Join event waitlist
 *     tags: [Waitlist]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user_id
 *               - event_id
 *             properties:
 *               user_id:
 *                 type: integer
 *                 example: 1
 *               event_id:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       201:
 *         description: Successfully joined waitlist
 *       400:
 *         description: Event not sold out or already on waitlist
 *       404:
 *         description: User or event not found
 */
router.post("/", async (req, res, next) => {
  const { user_id, event_id } = req.body;

  // Validate user_id
  const userIdValidation = validateNumber(user_id, 'User ID', 1, 2147483647);
  if (!userIdValidation.valid) {
    return res.status(400).json({ message: userIdValidation.message });
  }

  // Validate event_id
  const eventIdValidation = validateNumber(event_id, 'Event ID', 1, 2147483647);
  if (!eventIdValidation.valid) {
    return res.status(400).json({ message: eventIdValidation.message });
  }

  try {
    // Use helpers to validate existence
    const [userCheckExists, eventCheck] = await Promise.all([
      userExists(userIdValidation.value),
      pool.query(
        `SELECT id, total_tickets, tickets_sold, end_datetime, start_datetime FROM events WHERE id = $1`,
        [eventIdValidation.value]
      )
    ]);

    if (!userCheckExists) {
      return res.status(404).json({ message: "User does not exist!" });
    }

    if (eventCheck.rowCount === 0) {
      return res.status(404).json({ message: "Event does not exist!" });
    }

    const event = eventCheck.rows[0];
    const validUserId = userIdValidation.value;
    const validEventId = eventIdValidation.value;

    // Check if event has already passed
    const eventEndTime = new Date(event.end_datetime || event.start_datetime);
    if (eventEndTime < new Date()) {
      return res.status(400).json({ message: "Cannot join waitlist for past events!" });
    }

    // Check if sold out
    if (event.tickets_sold < event.total_tickets) {
      return res.status(400).json({
        message: "Event is not sold out — purchase is available!",
      });
    }

    // Prevent duplicate entry
    const existing = await pool.query(
      `SELECT id FROM waitlist WHERE user_id = $1 AND event_id = $2`,
      [validUserId, validEventId]
    );

    if (existing.rowCount > 0) {
      return res.status(409).json({
        message: "User is already on the waitlist for this event!",
      });
    }

    // Check if there are any pending_return tickets for this event
    const pendingTicketCheck = await pool.query(
      `SELECT t.id, t.ticket_type_id, tt.price 
       FROM tickets t
       LEFT JOIN ticket_types tt ON t.ticket_type_id = tt.id
       WHERE t.event_id = $1 AND t.status = 'pending_return'
       ORDER BY t.issued_at ASC
       LIMIT 1;`,
      [validEventId]
    );

    // If there's a pending_return ticket, offer it immediately instead of joining waitlist
    if (pendingTicketCheck.rows.length > 0) {
      const pendingTicket = pendingTicketCheck.rows[0];
      
      // Create PENDING transaction for this user
      const txResult = await pool.query(
        `INSERT INTO transactions (user_id, total_price, status, payment_method)
         VALUES ($1, $2, 'pending', 'waitlist')
         RETURNING id;`,
        [validUserId, pendingTicket.price || 0]
      );
      const transaction_id = txResult.rows[0].id;

      // Create reserved ticket for the user
      await pool.query(
        `INSERT INTO tickets (transaction_id, ticket_type_id, event_id, user_id, status)
         VALUES ($1, $2, $3, $4, 'reserved');`,
        [transaction_id, pendingTicket.ticket_type_id, validEventId, validUserId]
      );

      return res.status(201).json({
        message: "A ticket is available! You have been offered a returned ticket. Please accept or decline it.",
        ticket_offered: true,
        transaction_id: transaction_id
      });
    }

    // No pending tickets available, join waitlist normally
    const inserted = await pool.query(
      `INSERT INTO waitlist (user_id, event_id)
       VALUES ($1, $2)
       RETURNING *;`,
      [validUserId, validEventId]
    );

    // Calculate position in waitlist using ROW_NUMBER
    const positionResult = await pool.query(
      `SELECT position FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY joined_at ASC) as position
        FROM waitlist 
        WHERE event_id = $1
      ) ranked
      WHERE id = $2;`,
      [validEventId, inserted.rows[0].id]
    );

    return res.status(201).json({
      message: "User successfully added to waitlist!",
      entry: inserted.rows[0],
      position: parseInt(positionResult.rows[0].position)
    });

  } catch (err) {
    console.error("Error in POST /waitlist:", err);
    next(err);
  }
});

/**
 * @swagger
 * /waitlist/{id}:
 *   delete:
 *     summary: Remove waitlist entry by ID
 *     tags: [Waitlist]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: User removed from waitlist
 *       404:
 *         description: Entry not found
 */
router.delete("/:id", validateId('id'), async (req, res, next) => {
  const id = req.params.id; // Already validated

  try {
    const result = await pool.query(
      `DELETE FROM waitlist WHERE id = $1 RETURNING *;`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Entry not found." });
    }

    return res.status(200).json({
      message: "User removed from waitlist.",
      deleted: result.rows[0],
    });

  } catch (err) {
    console.error("Error in DELETE /waitlist/:id:", err);
    next(err);
  }
});

/**
 * @swagger
 * /waitlist/event/{event_id}/user/{user_id}:
 *   delete:
 *     summary: Remove specific user from event waitlist
 *     tags: [Waitlist]
 *     parameters:
 *       - in: path
 *         name: event_id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: user_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: User removed from waitlist
 *       404:
 *         description: Entry not found
 */
router.delete("/event/:event_id/user/:user_id", validateId('event_id'), validateId('user_id'), async (req, res, next) => {
  const event_id = req.params.event_id; // Already validated
  const user_id = req.params.user_id; // Already validated

  try {
    const result = await pool.query(
      `DELETE FROM waitlist WHERE event_id = $1 AND user_id = $2 RETURNING *;`,
      [event_id, user_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "User not found on waitlist!",
      });
    }

    return res.status(200).json({
      message: "User removed from waitlist!",
      deleted: result.rows[0],
    });

  } catch (err) {
    console.error("Error in DELETE /waitlist/event/:event_id/user/:user_id:", err);
    next(err);
  }
});

/* --------------------------------------
  Helper: Auto-assign ticket to next waitlist user
  Called when a ticket is refunded
  Creates a PENDING transaction that user must accept
-------------------------------------- */
export async function assignTicketToWaitlist(event_id, ticket_type_id) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    //console.log(`🔍 Looking for waitlist users for event ${event_id}, ticket_type ${ticket_type_id}`);
    
    // Find first person in waitlist who hasn't been offered yet (offered_at IS NULL)
    const waitlistResult = await client.query(
      `SELECT * FROM waitlist 
       WHERE event_id = $1 
       AND offered_at IS NULL
       ORDER BY joined_at ASC 
       LIMIT 1
       FOR UPDATE SKIP LOCKED;`,
      [event_id]
    );

    //console.log(`📋 Found ${waitlistResult.rows.length} waitlist user(s)`);

    if (waitlistResult.rows.length === 0) {
      await client.query('ROLLBACK');
      //console.log('❌ No waitlist users found');
      return { assigned: false };
    }

    const waitlistUser = waitlistResult.rows[0];
    
    // Get ticket type and price
    const ticketTypeResult = await client.query(
      `SELECT price FROM ticket_types WHERE id = $1;`,
      [ticket_type_id]
    );
    const price = ticketTypeResult.rows[0]?.price || 0;

    // Update waitlist entry with offer times (DON'T delete yet - track expiration here)
    const waitlistUpdate = await client.query(
      `UPDATE waitlist 
       SET offered_at = NOW(), 
           reservation_expires_at = NOW() + INTERVAL '30 minutes'
       WHERE id = $1
       RETURNING offered_at, reservation_expires_at;`,
      [waitlistUser.id]
    );

    // Create PENDING transaction for the waitlist user (they must accept)
    const txResult = await client.query(
      `INSERT INTO transactions (user_id, total_price, status, payment_method)
       VALUES ($1, $2, 'pending', 'waitlist')
       RETURNING id;`,
      [waitlistUser.user_id, price]
    );
    const transaction_id = txResult.rows[0].id;
    
    //console.log(` Created transaction ${transaction_id} for user ${waitlistUser.user_id}. Offered at: ${waitlistUpdate.rows[0].offered_at}, Expires at: ${waitlistUpdate.rows[0].reservation_expires_at}`);

    // Ticket status lifecycle:
    //   'reserved' - Ticket is held for a user promoted from the waitlist; user must accept and complete payment to activate.
    //   'active'   - Ticket is fully purchased and valid for event entry.
    //   'refunded' - Ticket has been refunded and is no longer valid.
    //
    // Here, we create a ticket with 'reserved' status for the waitlist user. The ticket will become 'active' once the user accepts and completes payment.
    // Reservation expires in 30 minutes from issued_at (calculated on-the-fly)
    await client.query(
      `INSERT INTO tickets (transaction_id, ticket_type_id, event_id, user_id, status)
       VALUES ($1, $2, $3, $4, 'reserved');`,
      [transaction_id, ticket_type_id, event_id, waitlistUser.user_id]
    );

    // Keep waitlist entry with expiration tracking - will be removed on accept/decline
    // Don't increment tickets_sold yet - only when they accept!

    await client.query('COMMIT');

    return { 
      assigned: true, 
      user_id: waitlistUser.user_id,
      transaction_id: transaction_id
    };

  } catch (error) {
    await client.query('ROLLBACK');
    console.error("❌ Error in assignTicketToWaitlist:", error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * @swagger
 * /waitlist/accept-ticket/{transaction_id}:
 *   post:
 *     summary: Accept reserved ticket from waitlist
 *     tags: [Waitlist]
 *     parameters:
 *       - in: path
 *         name: transaction_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Ticket confirmed
 *       404:
 *         description: Reservation not found
 *       410:
 *         description: Reservation expired
 */
router.post("/accept-ticket/:transaction_id", validateId('transaction_id'), async (req, res, next) => {
  const transaction_id = req.params.transaction_id; // Already validated

  try {
    // Get transaction and verify it's pending
    const txResult = await pool.query(
      `SELECT * FROM transactions WHERE id = $1 AND status = 'pending' AND payment_method = 'waitlist';`,
      [transaction_id]
    );

    if (txResult.rows.length === 0) {
      return res.status(404).json({ message: "Reservation not found or already confirmed!" });
    }

    // Get ticket info and check expiration
    const ticketResult = await pool.query(
      `SELECT * FROM tickets 
       WHERE transaction_id = $1 AND status = 'reserved';`,
      [transaction_id]
    );

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ message: "Ticket not found!" });
    }

    const ticket = ticketResult.rows[0];
    const transaction = txResult.rows[0];

    //console.log(` Checking waitlist for user ${transaction.user_id}, event ${ticket.event_id}`);

    // Check waitlist entry for expiration (if it exists)
    const waitlistCheck = await pool.query(
      `SELECT * FROM waitlist WHERE user_id = $1 AND event_id = $2;`,
      [transaction.user_id, ticket.event_id]
    );

   //console.log(` Waitlist check result:`, waitlistCheck.rows);

    // If waitlist entry exists, check for expiration
    if (waitlistCheck.rows.length > 0) {
      const waitlistEntry = waitlistCheck.rows[0];

      // Only check expiration if the entry has been offered
      if (waitlistEntry.offered_at && waitlistEntry.reservation_expires_at) {
        const now = new Date();
        const expiresAt = new Date(waitlistEntry.reservation_expires_at);
        const offeredAt = new Date(waitlistEntry.offered_at);
        
        /*console.log(' Reservation check:', {
          transaction_id,
          offered_at: offeredAt.toISOString(),
          current_time: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          is_expired: expiresAt < now,
          minutes_remaining: Math.floor((expiresAt - now) / (60 * 1000))
        });*/
        
        if (expiresAt < now) {
          // Reservation expired - clean it up and return error
          await pool.query(`UPDATE transactions SET status = 'expired' WHERE id = $1;`, [transaction_id]);
          await pool.query(`DELETE FROM tickets WHERE id = $1;`, [ticket.id]);
          
          // Try to assign to next person
          await assignTicketToWaitlist(ticket.event_id, ticket.ticket_type_id);
          
          return res.status(410).json({ 
            message: "This reservation has expired (30 minutes limit). The ticket has been offered to the next person in the waitlist." 
          });
        }
      }
    }

    // Find the original ticket that's pending return for the same event and ticket type
    const pendingReturnTicket = await pool.query(
      `SELECT * FROM tickets 
       WHERE event_id = $1 
       AND ticket_type_id = $2 
       AND status = 'pending_return' 
       ORDER BY issued_at ASC 
       LIMIT 1;`,
      [ticket.event_id, ticket.ticket_type_id]
    );

    // Update transaction to completed
    await pool.query(
      `UPDATE transactions SET status = 'completed' WHERE id = $1;`,
      [transaction_id]
    );

    // Update ticket to active
    await pool.query(
      `UPDATE tickets SET status = 'active' WHERE id = $1;`,
      [ticket.id]
    );

    // If there was a ticket pending return, NOW refund it with 2% platform fee
    let refundAmount = 0;
    let platformFee = 0;
    if (pendingReturnTicket.rows.length > 0) {
      const returnedTicket = pendingReturnTicket.rows[0];
      
      // Get original transaction to calculate refund (98% of original price)
      const originalTx = await pool.query(
        `SELECT total_price FROM transactions WHERE id = $1;`,
        [returnedTicket.transaction_id]
      );
      
      const originalPrice = parseFloat(originalTx.rows[0].total_price);
      platformFee = originalPrice * 0.02; // 2% fee
      refundAmount = originalPrice - platformFee;
      
      // Update ticket to refunded
      await pool.query(
        `UPDATE tickets SET status = 'refunded' WHERE id = $1;`,
        [returnedTicket.id]
      );
      
      // Create refund transaction record for the original owner
      await pool.query(
        `INSERT INTO transactions (user_id, total_price, status, payment_method)
         VALUES ($1, $2, 'refunded', 'waitlist_return');`,
        [returnedTicket.user_id, -refundAmount]
      );
    }

    // Decrement tickets_sold by 1 (removing pending_return ticket) then increment by 1 (adding new active ticket)
    // Net effect: tickets_sold stays the same, just ownership changes
    // So we don't need to update tickets_sold count

    // Remove from waitlist after successful acceptance
    await pool.query(
      `DELETE FROM waitlist WHERE user_id = $1 AND event_id = $2;`,
      [transaction.user_id, ticket.event_id]
    );

    return res.status(200).json({
      message: refundAmount > 0 
        ? `Ticket accepted successfully! Previous owner will receive a refund of €${refundAmount.toFixed(2)} (2% platform fee applied).`
        : "Ticket accepted successfully!",
      ticket: ticket,
      refunded_ticket_id: pendingReturnTicket.rows[0]?.id,
      refund_amount: refundAmount,
      platform_fee: platformFee.toFixed(2)
    });

  } catch (err) {
    console.error("Error accepting ticket:", err);
    next(err);
  }
});

/**
 * @swagger
 * /waitlist/decline-ticket/{transaction_id}:
 *   post:
 *     summary: Decline reserved ticket from waitlist
 *     tags: [Waitlist]
 *     parameters:
 *       - in: path
 *         name: transaction_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Reservation cancelled, next user notified
 *       404:
 *         description: Reservation not found
 */
router.post("/decline-ticket/:transaction_id", validateId('transaction_id'), async (req, res, next) => {
  const transaction_id = req.params.transaction_id; // Already validated

  try {
    // Get transaction and verify it's pending
    const txResult = await pool.query(
      `SELECT * FROM transactions WHERE id = $1 AND status = 'pending' AND payment_method = 'waitlist';`,
      [transaction_id]
    );

    if (txResult.rows.length === 0) {
      return res.status(404).json({ message: "Reservation not found!" });
    }

    // Get ticket info
    const ticketResult = await pool.query(
      `SELECT * FROM tickets WHERE transaction_id = $1 AND status = 'reserved';`,
      [transaction_id]
    );

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ message: "Ticket not found!" });
    }

    const ticket = ticketResult.rows[0];
    const transaction = txResult.rows[0];

    // Update transaction to cancelled
    await pool.query(
      `UPDATE transactions SET status = 'cancelled' WHERE id = $1;`,
      [transaction_id]
    );

    // Delete the reserved ticket
    await pool.query(
      `DELETE FROM tickets WHERE id = $1;`,
      [ticket.id]
    );

    // Remove from waitlist after decline (they can rejoin manually if they want)
    await pool.query(
      `DELETE FROM waitlist WHERE user_id = $1 AND event_id = $2;`,
      [transaction.user_id, ticket.event_id]
    );

    // Assign to next person in waitlist
    const nextAssignment = await assignTicketToWaitlist(ticket.event_id, ticket.ticket_type_id);

    return res.status(200).json({
      message: "Reservation declined.",
      assigned_to_next: nextAssignment.assigned
    });

  } catch (err) {
    console.error("Error declining ticket:", err);
    next(err);
  }
});

export default router;
