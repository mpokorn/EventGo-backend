import express from "express";
import pool from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { assignTicketToWaitlist } from "./waitlist.js";
import { validateId, validateIds, validateNumber, sanitizeBody } from "../middleware/validation.js";
import { userExists, eventExists, ticketTypeExists } from "../utils/dbHelpers.js";

const router = express.Router();

// Protect all ticket routes
router.use(requireAuth);
router.use(sanitizeBody);

/**
 * @swagger
 * tags:
 *   name: Tickets
 *   description: Ticket management endpoints
 */

/**
 * @swagger
 * /tickets:
 *   get:
 *     summary: Get all tickets
 *     tags: [Tickets]
 *     responses:
 *       200:
 *         description: List of all tickets
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 total_tickets:
 *                   type: integer
 *                 tickets:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Ticket'
 */
router.get("/", async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT 
        t.id,
        t.user_id,
        (u.first_name || ' ' || u.last_name) AS buyer_name,
        t.event_id,
        e.title AS event_name,
        t.ticket_type_id,
        tt.type AS ticket_type,
        tt.price AS ticket_price,
        t.transaction_id,
        t.status,
        t.issued_at
      FROM tickets t
      JOIN users u ON t.user_id = u.id
      JOIN events e ON t.event_id = e.id
      LEFT JOIN ticket_types tt ON t.ticket_type_id = tt.id
      ORDER BY t.issued_at DESC;
    `);

    if (result.rowCount === 0) {
      return res.status(200).json({
        message: "No tickets found.",
        tickets: [],
      });
    }

    res.status(200).json({
      message: "All tickets retrieved successfully.",
      total_tickets: result.rowCount,
      tickets: result.rows,
    });
  } catch (err) {
    console.error(" Error in GET /tickets:", err);
    next(err);
  }
});

/**
 * @swagger
 * /tickets/{id}:
 *   get:
 *     summary: Get single ticket by ID
 *     tags: [Tickets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Ticket details
 *       404:
 *         description: Ticket not found
 */
router.get("/:id", validateId('id'), async (req, res, next) => {
  const id = req.params.id; // Already validated

  try {
    const result = await pool.query(
      `
      SELECT 
        t.id,
        t.user_id,
        (u.first_name || ' ' || u.last_name) AS buyer_name,
        t.event_id,
        e.title AS event_name,
        t.ticket_type_id,
        tt.type AS ticket_type,
        tt.price AS ticket_price,
        t.transaction_id,
        t.status,
        t.issued_at
      FROM tickets t
      JOIN users u ON t.user_id = u.id
      JOIN events e ON t.event_id = e.id
      LEFT JOIN ticket_types tt ON t.ticket_type_id = tt.id
      WHERE t.id = $1;
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: `Ticket with ID ${id} does not exist.` });
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error(" Error in GET /tickets/:id:", err);
    next(err);
  }
});

/**
 * @swagger
 * /tickets/user/{user_id}:
 *   get:
 *     summary: Get all tickets for a user
 *     tags: [Tickets]
 *     parameters:
 *       - in: path
 *         name: user_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: User's tickets
 *       404:
 *         description: User not found
 */
router.get("/user/:user_id", validateId('user_id'), async (req, res, next) => {
  const user_id = req.params.user_id; // Already validated

  try {
    // Use helper to check if user exists
    const exists = await userExists(user_id);
    if (!exists) {
      return res.status(404).json({ message: "User does not exist!" });
    }

    // Get user info for response
    const userCheck = await pool.query(`SELECT id, first_name, last_name FROM users WHERE id = $1;`, [user_id]);

    // Fetch all tickets where the user is the buyer or owner
    const result = await pool.query(
      `
      SELECT 
        t.id,
        t.user_id,
        (u.first_name || ' ' || u.last_name) AS buyer_name,
        t.event_id,
        e.title AS event_name,
        e.location,
        e.start_datetime,
        e.end_datetime,
        e.total_tickets AS event_total_tickets,
        e.tickets_sold AS event_tickets_sold,
        t.ticket_type_id,
        tt.type AS ticket_type,
        tt.price AS ticket_price,
        t.transaction_id,
        t.status,
        t.issued_at,
        CASE 
          WHEN t.status = 'reserved' THEN t.issued_at + INTERVAL '30 minutes'
          ELSE NULL 
        END as reservation_expires_at
      FROM tickets t
      JOIN users u ON t.user_id = u.id
      JOIN events e ON t.event_id = e.id
      LEFT JOIN ticket_types tt ON t.ticket_type_id = tt.id
      WHERE t.user_id = $1
      ORDER BY t.issued_at DESC;
      `,
      [user_id]
    );

    if (result.rowCount === 0) {
      return res.status(200).json({
        message: `User ${userCheck.rows[0].first_name} ${userCheck.rows[0].last_name} has no tickets.`,
        tickets: [],
      });
    }

    res.status(200).json({
      message: "User tickets retrieved successfully.",
      user: {
        id: user_id,
        name: `${userCheck.rows[0].first_name} ${userCheck.rows[0].last_name}`,
      },
      total_tickets: result.rowCount,
      tickets: result.rows,
    });
  } catch (err) {
    console.error(" Error in GET /tickets/user/:user_id:", err);
    next(err);
  }
});

/**
 * @swagger
 * /tickets/user/{user_id}/event/{event_id}:
 *   get:
 *     summary: Get user tickets for specific event
 *     tags: [Tickets]
 *     parameters:
 *       - in: path
 *         name: user_id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: event_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: User's tickets for the event
 */
router.get("/user/:user_id/event/:event_id", validateIds('user_id', 'event_id'), async (req, res, next) => {
  const user_id = req.params.user_id; // Already validated
  const event_id = req.params.event_id; // Already validated

  try {
    // Get event details
    const eventCheck = await pool.query(
      `SELECT id, title, start_datetime, end_datetime, location FROM events WHERE id = $1;`,
      [event_id]
    );

    if (eventCheck.rowCount === 0) {
      return res.status(404).json({ message: "Event does not exist!" });
    }

    // Fetch tickets for this user and event
    const result = await pool.query(
      `
      SELECT 
        t.id,
        t.user_id,
        t.event_id,
        t.ticket_type_id,
        tt.type AS ticket_type,
        tt.price AS ticket_price,
        t.transaction_id,
        t.status,
        t.issued_at
      FROM tickets t
      LEFT JOIN ticket_types tt ON t.ticket_type_id = tt.id
      WHERE t.user_id = $1 AND t.event_id = $2
      ORDER BY t.issued_at DESC;
      `,
      [user_id, event_id]
    );

    res.status(200).json({
      message: "User event tickets retrieved successfully.",
      event: eventCheck.rows[0],
      total_tickets: result.rowCount,
      tickets: result.rows,
    });
  } catch (err) {
    console.error(" Error in GET /tickets/user/:user_id/event/:event_id:", err);
    next(err);
  }
});

/**
 * @swagger
 * /tickets/event/{event_id}:
 *   get:
 *     summary: Get all tickets for an event
 *     tags: [Tickets]
 *     parameters:
 *       - in: path
 *         name: event_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: All tickets for the event
 *       404:
 *         description: Event not found
 */
router.get("/event/:event_id", validateId('event_id'), async (req, res, next) => {
  const event_id = req.params.event_id; // Already validated

  try {
    // Use helper to check if event exists
    const exists = await eventExists(event_id);
    if (!exists) {
      return res.status(404).json({ message: "Event does not exist!" });
    }

    // Get event info for response
    const eventCheck = await pool.query(
      `SELECT id, title FROM events WHERE id = $1;`,
      [event_id]
    );

    // Get all tickets for this event
    const result = await pool.query(
      `
      SELECT 
        t.id,
        t.user_id,
        (u.first_name || ' ' || u.last_name) AS buyer_name,
        t.ticket_type_id,
        tt.type AS ticket_type,
        tt.price AS ticket_price,
        t.status,
        t.issued_at
      FROM tickets t
      JOIN users u ON t.user_id = u.id
      LEFT JOIN ticket_types tt ON t.ticket_type_id = tt.id
      WHERE t.event_id = $1
      ORDER BY t.issued_at DESC;
      `,
      [event_id]
    );

    if (result.rowCount === 0) {
      return res.status(200).json({
        message: `Event "${eventCheck.rows[0].title}" currently has no sold tickets.`,
        event_id,
        tickets: [],
      });
    }

    res.status(200).json({
      message: `Tickets for event "${eventCheck.rows[0].title}" retrieved successfully.`,
      event_id,
      event_title: eventCheck.rows[0].title,
      total_tickets: result.rowCount,
      tickets: result.rows,
    });
  } catch (err) {
    console.error(" Error in GET /tickets/event/:event_id:", err);
    next(err);
  }
});





/**
 * @swagger
 * /tickets:
 *   post:
 *     summary: Purchase new tickets
 *     tags: [Tickets]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - event_id
 *               - ticket_type_id
 *             properties:
 *               event_id:
 *                 type: integer
 *                 example: 1
 *               ticket_type_id:
 *                 type: integer
 *                 example: 1
 *               quantity:
 *                 type: integer
 *                 default: 1
 *                 minimum: 1
 *                 maximum: 10
 *               payment_method:
 *                 type: string
 *                 enum: [card, paypal]
 *                 default: card
 *     responses:
 *       201:
 *         description: Tickets purchased successfully
 *       400:
 *         description: Not enough tickets available
 *       404:
 *         description: Event or ticket type not found
 */
router.post("/", async (req, res, next) => {
  const { event_id, ticket_type_id, quantity = 1, payment_method } = req.body;
  const user_id = req.user.id; // Get user ID from authenticated token

  // Validate event_id
  const eventIdValidation = validateNumber(event_id, 'Event ID', 1, 2147483647);
  if (!eventIdValidation.valid) {
    return res.status(400).json({ message: eventIdValidation.message });
  }

  // Validate ticket_type_id
  const ticketTypeIdValidation = validateNumber(ticket_type_id, 'Ticket type ID', 1, 2147483647);
  if (!ticketTypeIdValidation.valid) {
    return res.status(400).json({ message: ticketTypeIdValidation.message });
  }

  // Validate quantity
  const quantityValidation = validateNumber(quantity, 'Quantity', 1, 10);
  if (!quantityValidation.valid) {
    return res.status(400).json({ message: quantityValidation.message });
  }

  // Use validated values
  const validEventId = eventIdValidation.value;
  const validTicketTypeId = ticketTypeIdValidation.value;
  const validQuantity = quantityValidation.value;

  // Use a transaction to ensure atomicity
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Use helpers to validate existence
    const [userCheckExists, eventCheck, typeCheck] = await Promise.all([
      userExists(user_id),
      client.query(`SELECT id, end_datetime, start_datetime FROM events WHERE id = $1`, [validEventId]),
      client.query(`SELECT total_tickets, tickets_sold, price FROM ticket_types WHERE id = $1`, [validTicketTypeId]),
    ]);

    if (!userCheckExists) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: "User does not exist!" });
    }
    if (eventCheck.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: "Event does not exist!" });
    }
    
    // Check if event has already passed
    const event = eventCheck.rows[0];
    const eventEndTime = new Date(event.end_datetime || event.start_datetime);
    if (eventEndTime < new Date()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: "Cannot purchase tickets for past events!" });
    }
    
    if (typeCheck.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: "Ticket type does not exist!" });
    }

    const { total_tickets, tickets_sold, price } = typeCheck.rows[0];
    const available = total_tickets - tickets_sold;
    if (available < validQuantity) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: `Only ${available} tickets available for this type!`,
      });
    }

    // 🧾 Create transaction
    const total_price = Number(price) * validQuantity;
    const txResult = await client.query(
      `INSERT INTO transactions (user_id, total_price, status, payment_method)
       VALUES ($1, $2, 'completed', $3)
       RETURNING id;`,
      [user_id, total_price, payment_method || "card"]
    );
    const transaction_id = txResult.rows[0].id;

    // Create tickets
    const insertPromises = [];
    for (let i = 0; i < validQuantity; i++) {
      insertPromises.push(
        client.query(
          `INSERT INTO tickets (transaction_id, ticket_type_id, event_id, user_id, status)
           VALUES ($1, $2, $3, $4, 'active');`,
          [transaction_id, validTicketTypeId, validEventId, user_id]
        )
      );
    }
    await Promise.all(insertPromises);

    // Update counts
    await client.query(
      `UPDATE ticket_types SET tickets_sold = tickets_sold + $1 WHERE id = $2;`,
      [validQuantity, validTicketTypeId]
    );
    
    // Update event's tickets_sold AND total_tickets based on ticket types
    await client.query(
      `UPDATE events
       SET tickets_sold = (
         SELECT COALESCE(SUM(tickets_sold), 0)
         FROM ticket_types
         WHERE event_id = $1
       ),
       total_tickets = (
         SELECT COALESCE(SUM(total_tickets), 0)
         FROM ticket_types
         WHERE event_id = $1
       )
       WHERE id = $1;`,
      [validEventId]
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: `Successfully purchased ${validQuantity} ticket(s)!`,
      transaction_id,
      total_price,
      quantity: validQuantity,
      payment_method: payment_method || "card",
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("❌ Error in POST /tickets:", err);
    next(err);
  } finally {
    client.release();
  }
});

/**
 * @swagger
 * /tickets/{id}/refund:
 *   put:
 *     summary: Request ticket refund
 *     tags: [Tickets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Refund processed successfully
 *       403:
 *         description: Not authorized to refund this ticket
 *       404:
 *         description: Ticket not found
 */
router.put("/:id/refund", validateId('id'), async (req, res, next) => {
  const id = req.params.id; // Already validated

  try {
    // Get ticket details and check event status
    const ticketCheck = await pool.query(
      `
      SELECT 
        t.id, t.ticket_type_id, t.event_id, t.user_id, t.status,
        e.tickets_sold, e.total_tickets,
        tt.type as ticket_type_name
      FROM tickets t
      JOIN events e ON t.event_id = e.id
      LEFT JOIN ticket_types tt ON t.ticket_type_id = tt.id
      WHERE t.id = $1;
      `,
      [id]
    );

    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ message: "Ticket not found!" });
    }

    const ticket = ticketCheck.rows[0];

    if (ticket.status !== 'active') {
      return res.status(400).json({ message: "Only active tickets can be refunded!" });
    }

    const isSoldOut = ticket.tickets_sold >= ticket.total_tickets;

    // Check if event is sold out - only allow returns for sold out events
    if (!isSoldOut) {
      return res.status(400).json({ 
        message: "You can only return tickets for sold out events. This event still has available tickets."
      });
    }

    // Change status to 'pending_return' - user keeps ticket until someone buys it
    const result = await pool.query(
      `UPDATE tickets SET status = 'pending_return' WHERE id = $1 RETURNING *;`,
      [id]
    );

    // Try to assign to waitlist if anyone is waiting
    const waitlistAssignment = await assignTicketToWaitlist(ticket.event_id, ticket.ticket_type_id);

    // Message based on waitlist assignment
    const message = waitlistAssignment.assigned
      ? "Your ticket has been offered to someone on the waitlist. You'll keep access until they accept it."
      : "Your return request has been submitted. You'll keep the ticket until someone from the waitlist purchases it.";

    res.status(200).json({
      message,
      ticket: result.rows[0],
      assigned_to_waitlist: waitlistAssignment.assigned
    });
  } catch (err) {
    console.error(" Error in PUT /tickets/:id/refund:", err);
    next(err);
  }
});

/* --------------------------------------
   Organizer refund ticket (admin action)
   - Can refund anytime (not just sold out events)
   - Ticket goes back to normal sale (decrements tickets_sold)
   - If sold out, offers to waitlist with 30-min window
-------------------------------------- */
router.put("/:id/organizer-refund", validateId('id'), async (req, res, next) => {
  const id = req.params.id;
  const organizer_id = req.user.id; // From JWT token

  try {
    // Get ticket with event info
    const ticketCheck = await pool.query(
      `
      SELECT 
        t.id, t.ticket_type_id, t.event_id, t.user_id, t.status, t.transaction_id,
        e.tickets_sold, e.total_tickets, e.organizer_id,
        tt.type as ticket_type_name
      FROM tickets t
      JOIN events e ON t.event_id = e.id
      LEFT JOIN ticket_types tt ON t.ticket_type_id = tt.id
      WHERE t.id = $1;
      `,
      [id]
    );

    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ message: "Ticket not found!" });
    }

    const ticket = ticketCheck.rows[0];

    // Verify user is the event organizer
    if (ticket.organizer_id !== organizer_id) {
      return res.status(403).json({ message: "Only the event organizer can refund tickets!" });
    }

    if (ticket.status !== 'active') {
      return res.status(400).json({ message: "Only active tickets can be refunded!" });
    }

    const isSoldOut = ticket.tickets_sold >= ticket.total_tickets;

    // Mark ticket as refunded and update event tickets_sold
    await pool.query(
      `UPDATE tickets SET status = 'refunded' WHERE id = $1;`,
      [id]
    );

    await pool.query(
      `UPDATE events SET tickets_sold = tickets_sold - 1 WHERE id = $1;`,
      [ticket.event_id]
    );

    await pool.query(
      `UPDATE ticket_types SET tickets_sold = tickets_sold - 1 WHERE id = $1;`,
      [ticket.ticket_type_id]
    );

    // Mark original transaction as refunded
    await pool.query(
      `UPDATE transactions SET status = 'refunded' WHERE id = $1;`,
      [ticket.transaction_id]
    );

    let waitlistAssigned = false;

    // If event WAS sold out, offer to waitlist (with 30-min acceptance window)
    if (isSoldOut) {
      const waitlistAssignment = await assignTicketToWaitlist(ticket.event_id, ticket.ticket_type_id);
      waitlistAssigned = waitlistAssignment.assigned;
    }

    // Return appropriate message
    const message = isSoldOut && waitlistAssigned
      ? "Ticket refunded successfully! It has been offered to the first person on the waitlist."
      : "Ticket refunded successfully! It is now available for purchase.";

    res.status(200).json({
      message,
      ticket_id: id,
      event_id: ticket.event_id,
      tickets_available: ticket.total_tickets - (ticket.tickets_sold - 1),
      waitlist_assigned: waitlistAssigned
    });
  } catch (err) {
    console.error(" Error in PUT /tickets/:id/organizer-refund:", err);
    next(err);
  }
});

/**
 * @swagger
 * /tickets/{id}:
 *   delete:
 *     summary: Delete a ticket
 *     tags: [Tickets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Ticket deleted
 *       404:
 *         description: Ticket not found
 */
router.delete("/:id", validateId('id'), async (req, res, next) => {
  const id = req.params.id; // Already validated

  try {
    const result = await pool.query(`DELETE FROM tickets WHERE id = $1 RETURNING *;`, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Ticket not found!" });
    }

    res.status(200).json({
      message: "Ticket successfully deleted!",
      deleted: result.rows[0],
    });
  } catch (err) {
    console.error(" Error in DELETE /tickets/:id:", err);
    next(err);
  }
});

export default router;