import express from "express";
import pool from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { validateId, validateString, validateNumber, sanitizeBody } from "../middleware/validation.js";
import { eventExists, userOwnsEvent } from "../utils/dbHelpers.js";

const router = express.Router();

// Protect all modification routes (POST, PUT, DELETE)
// GET routes can remain public for browsing
router.use(sanitizeBody);

/**
 * @swagger
 * tags:
 *   name: Ticket Types
 *   description: Ticket type management for events
 */

/**
 * @swagger
 * /ticket-types/{event_id}:
 *   get:
 *     summary: Get all ticket types for an event
 *     tags: [Ticket Types]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: event_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of ticket types
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/TicketType'
 *       404:
 *         description: No ticket types found
 */
router.get("/:event_id", validateId('event_id'), async (req, res, next) => {
  const event_id = req.params.event_id; // Already validated

  try {
    const result = await pool.query(
      `
      SELECT 
        tt.id, 
        tt.type, 
        tt.price, 
        tt.total_tickets, 
        tt.tickets_sold, 
        tt.created_at,
        e.title AS event_name,
        e.start_datetime
      FROM ticket_types tt
      JOIN events e ON tt.event_id = e.id
      WHERE tt.event_id = $1
      ORDER BY tt.price ASC;
      `,
      [event_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "No ticket types defined for this event." });
    }

    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Error in GET /ticket-types/:event_id:", err);
    next(err);
  }
});

/**
 * @swagger
 * /ticket-types:
 *   post:
 *     summary: Create a new ticket type
 *     tags: [Ticket Types]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - event_id
 *               - type
 *               - price
 *               - total_tickets
 *             properties:
 *               event_id:
 *                 type: integer
 *                 example: 1
 *               type:
 *                 type: string
 *                 example: VIP
 *               price:
 *                 type: number
 *                 example: 99.99
 *               total_tickets:
 *                 type: integer
 *                 example: 100
 *     responses:
 *       201:
 *         description: Ticket type created successfully
 *       403:
 *         description: Not authorized - must be event owner
 */
router.post("/", requireAuth, async (req, res, next) => {
  const { event_id, type, price, total_tickets } = req.body;

  // Validate event_id
  const eventIdValidation = validateNumber(event_id, 'Event ID', 1, 2147483647);
  if (!eventIdValidation.valid) {
    return res.status(400).json({ message: eventIdValidation.message });
  }

  // Validate type (ticket type name)
  const typeValidation = validateString(type, 'Ticket type name', 2, 100);
  if (!typeValidation.valid) {
    return res.status(400).json({ message: typeValidation.message });
  }

  // Validate price
  const priceValidation = validateNumber(price, 'Price', 0, 1000000);
  if (!priceValidation.valid) {
    return res.status(400).json({ message: priceValidation.message });
  }

  // Validate total_tickets
  const ticketsValidation = validateNumber(total_tickets, 'Total tickets', 1, 100000);
  if (!ticketsValidation.valid) {
    return res.status(400).json({ message: ticketsValidation.message });
  }

  // Use validated values
  const validEventId = eventIdValidation.value;
  const validType = typeValidation.value;
  const validPrice = priceValidation.value;
  const validTotalTickets = ticketsValidation.value;

  try {
    // Use helper to verify event ownership
    const ownsEvent = await userOwnsEvent(req.user.id, validEventId);
    if (!ownsEvent) {
      return res.status(403).json({ message: "Event not found or you don't have permission to create ticket types for it!" });
    }

    const result = await pool.query(
      `
      INSERT INTO ticket_types (event_id, type, price, total_tickets, tickets_sold)
      VALUES ($1, $2, $3, $4, 0)
      RETURNING *;
      `,
      [validEventId, validType, validPrice, validTotalTickets]
    );

    // Sync event's total_tickets
    await pool.query(
      `UPDATE events
       SET total_tickets = (
         SELECT COALESCE(SUM(total_tickets), 0)
         FROM ticket_types
         WHERE event_id = $1
       )
       WHERE id = $1;`,
      [validEventId]
    );

    res.status(201).json({
      message: "Ticket type successfully added!",
      ticket_type: result.rows[0],
    });
  } catch (err) {
    console.error("Error in POST /ticket-types:", err);
    next(err);
  }
});

/**
 * @swagger
 * /ticket-types/{id}:
 *   patch:
 *     summary: Update a ticket type
 *     tags: [Ticket Types]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *               price:
 *                 type: number
 *               total_tickets:
 *                 type: integer
 *               tickets_sold:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Ticket type updated
 *       403:
 *         description: Must be event owner
 */
router.patch("/:id", requireAuth, validateId('id'), async (req, res, next) => {
  const id = req.params.id; // Already validated
  const { type, price, total_tickets, tickets_sold } = req.body;

  // Validate fields if provided
  if (type) {
    const typeValidation = validateString(type, 'Ticket type name', 2, 100);
    if (!typeValidation.valid) {
      return res.status(400).json({ message: typeValidation.message });
    }
  }

  if (price !== undefined) {
    const priceValidation = validateNumber(price, 'Price', 0, 1000000);
    if (!priceValidation.valid) {
      return res.status(400).json({ message: priceValidation.message });
    }
  }

  if (total_tickets !== undefined) {
    const ticketsValidation = validateNumber(total_tickets, 'Total tickets', 1, 100000);
    if (!ticketsValidation.valid) {
      return res.status(400).json({ message: ticketsValidation.message });
    }
  }

  if (tickets_sold !== undefined) {
    const soldValidation = validateNumber(tickets_sold, 'Tickets sold', 0, 100000);
    if (!soldValidation.valid) {
      return res.status(400).json({ message: soldValidation.message });
    }
  }

  try {
    const result = await pool.query(
      `
      UPDATE ticket_types
      SET 
        type = COALESCE($1, type),
        price = COALESCE($2, price),
        total_tickets = COALESCE($3, total_tickets),
        tickets_sold = COALESCE($4, tickets_sold)
      WHERE id = $5
      RETURNING *;
      `,
      [type, price, total_tickets, tickets_sold, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Ticket type not found!" });
    }

    // Sync event's total_tickets and tickets_sold
    const ticketTypeRow = result.rows[0];
    await pool.query(
      `UPDATE events
       SET total_tickets = (
         SELECT COALESCE(SUM(total_tickets), 0)
         FROM ticket_types
         WHERE event_id = $1
       ),
       tickets_sold = (
         SELECT COALESCE(SUM(tickets_sold), 0)
         FROM ticket_types
         WHERE event_id = $1
       )
       WHERE id = $1;`,
      [ticketTypeRow.event_id]
    );

    res.status(200).json({
      message: "Ticket type successfully updated!",
      ticket_type: result.rows[0],
    });
  } catch (err) {
    console.error("Error in PATCH /ticket-types/:id:", err);
    next(err);
  }
});

/**
 * @swagger
 * /ticket-types/{id}:
 *   delete:
 *     summary: Delete a ticket type
 *     tags: [Ticket Types]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Ticket type deleted
 *       403:
 *         description: Must be event owner
 *       404:
 *         description: Ticket type not found
 */
router.delete("/:id", requireAuth, validateId('id'), async (req, res, next) => {
  const id = req.params.id; // Already validated

  try {
    // Verify ticket type belongs to user's event
    const ownerCheck = await pool.query(
      `SELECT tt.id, e.organizer_id 
       FROM ticket_types tt 
       JOIN events e ON tt.event_id = e.id 
       WHERE tt.id = $1`,
      [id]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ message: "Ticket type not found!" });
    }

    if (ownerCheck.rows[0].organizer_id !== req.user.id) {
      return res.status(403).json({ message: "You can only delete ticket types for your own events!" });
    }

    // Check if any tickets have been sold for this type
    const usageCheck = await pool.query(
      `SELECT COUNT(*) AS sold FROM tickets WHERE ticket_type_id = $1;`,
      [id]
    );

    if (parseInt(usageCheck.rows[0].sold) > 0) {
      return res.status(400).json({
        message: "Cannot delete this ticket type because tickets have already been sold!",
      });
    }

    const result = await pool.query(
      `DELETE FROM ticket_types WHERE id = $1 RETURNING *;`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Ticket type not found!" });
    }

    // Sync event's total_tickets after deletion
    const deletedType = result.rows[0];
    await pool.query(
      `UPDATE events
       SET total_tickets = (
         SELECT COALESCE(SUM(total_tickets), 0)
         FROM ticket_types
         WHERE event_id = $1
       ),
       tickets_sold = (
         SELECT COALESCE(SUM(tickets_sold), 0)
         FROM ticket_types
         WHERE event_id = $1
       )
       WHERE id = $1;`,
      [deletedType.event_id]
    );

    res.status(200).json({
      message: "Ticket type successfully deleted!",
      deleted: result.rows[0],
    });
  } catch (err) {
    console.error("Error in DELETE /ticket-types/:id:", err);
    next(err);
  }
});

/**
 * @swagger
 * /ticket-types/{id}/recount:
 *   put:
 *     summary: Recalculate sold tickets count
 *     tags: [Ticket Types]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Ticket count refreshed
 */
router.put("/:id/recount", requireAuth, validateId('id'), async (req, res, next) => {
  const id = req.params.id; // Already validated

  try {
    await pool.query(`
      UPDATE ticket_types
      SET tickets_sold = (
        SELECT COUNT(*) FROM tickets WHERE ticket_type_id = $1
      )
      WHERE id = $1;
    `, [id]);
    res.json({ message: "Number of sold tickets refreshed!" });
  } catch (err) {
    console.error("Error in PUT /ticket-types/:id/recount:", err);
    next(err);
  }
});

// Sync ALL ticket types and events (useful for fixing data)
router.post("/sync-all", requireAuth, async (req, res, next) => {
  try {
    // 1. Update all ticket_types.tickets_sold based on actual tickets
    const result = await pool.query(`
      UPDATE ticket_types tt
      SET tickets_sold = (
        SELECT COUNT(*) FROM tickets t 
        WHERE t.ticket_type_id = tt.id
      )
      RETURNING id, type, tickets_sold, total_tickets;
    `);

    // 2. Update all events.total_tickets and tickets_sold from ticket_types
    await pool.query(`
      UPDATE events e
      SET 
        total_tickets = (
          SELECT COALESCE(SUM(total_tickets), 0)
          FROM ticket_types
          WHERE event_id = e.id
        ),
        tickets_sold = (
          SELECT COALESCE(SUM(tickets_sold), 0)
          FROM ticket_types
          WHERE event_id = e.id
        );
    `);

    res.json({ 
      message: "All ticket counts synchronized successfully!",
      success: true,
      ticket_types_updated: result.rows
    });
  } catch (err) {
    console.error("Error in sync-all:", err);
    next(err);
  }
});

// Debug endpoint to check ticket count discrepancies
router.get("/debug/:event_id", async (req, res, next) => {
  const { event_id } = req.params;
  
  try {
    const result = await pool.query(`
      SELECT 
        tt.id as ticket_type_id,
        tt.type,
        tt.total_tickets,
        tt.tickets_sold as stored_count,
        (SELECT COUNT(*) FROM tickets t WHERE t.ticket_type_id = tt.id) as actual_count
      FROM ticket_types tt
      WHERE tt.event_id = $1;
    `, [event_id]);
    
    res.json({
      event_id,
      ticket_types: result.rows
    });
  } catch (err) {
    console.error("Error in debug:", err);
    next(err);
  }
});


export default router;
