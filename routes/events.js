import express from "express";
import pool from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { validateId, validateString, validateNumber, validateDate, validateDateRange, sanitizeBody } from "../middleware/validation.js";
import { eventExists, getEventById, userOwnsEvent } from "../utils/dbHelpers.js";

const router = express.Router();

// Apply sanitization middleware to all POST/PUT routes
router.use(sanitizeBody);

/**
 * @swagger
 * tags:
 *   name: Events
 *   description: Event management endpoints
 */

/**
 * @swagger
 * /events:
 *   get:
 *     summary: Get all events with filters
 *     tags: [Events]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by title or description
 *       - in: query
 *         name: location
 *         schema:
 *           type: string
 *         description: Filter by location
 *       - in: query
 *         name: filter
 *         schema:
 *           type: string
 *           enum: [all, upcoming, past]
 *           default: upcoming
 *         description: Filter by event status
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 12
 *     responses:
 *       200:
 *         description: List of events
 */
router.get("/", async (req, res, next) => {
  try {
    const { search, location, startDate, endDate, filter = 'upcoming', page = 1, limit = 12 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    let queryText = `
      SELECT 
        e.id,
        e.title,
        e.description,
        e.start_datetime,
        e.end_datetime,
        e.location,
        e.total_tickets,
        e.tickets_sold,
        e.created_at,
        CONCAT(u.first_name, ' ', u.last_name) AS organizer_name,
        CASE 
          WHEN COALESCE(e.end_datetime, e.start_datetime) < NOW() THEN true
          ELSE false
        END as is_past
      FROM events e
      LEFT JOIN users u ON e.organizer_id = u.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 1;
    
    // Search by title or description
    if (search) {
      queryText += ` AND (LOWER(e.title) LIKE $${paramCount} OR LOWER(e.description) LIKE $${paramCount})`;
      params.push(`%${search.toLowerCase()}%`);
      paramCount++;
    }
    
    // Filter by location
    if (location) {
      queryText += ` AND LOWER(e.location) LIKE $${paramCount}`;
      params.push(`%${location.toLowerCase()}%`);
      paramCount++;
    }
    
    // Filter by start date range
    if (startDate) {
      queryText += ` AND e.start_datetime >= $${paramCount}`;
      params.push(startDate);
      paramCount++;
    }
    
    // Filter by end date range
    if (endDate) {
      queryText += ` AND e.start_datetime <= $${paramCount}`;
      params.push(endDate);
      paramCount++;
    }
    
    // Filter by event status (upcoming, past, all)
    if (filter === 'past') {
      queryText += ` AND COALESCE(e.end_datetime, e.start_datetime) < NOW()`;
    } else if (filter === 'upcoming') {
      queryText += ` AND COALESCE(e.end_datetime, e.start_datetime) >= NOW()`;
    }
    // filter === 'all' shows both
    
    // Sort order: 
    // - past: most recent first (DESC)
    // - upcoming: soonest first (ASC)
    // - all: upcoming first (ASC), then past (DESC) using CASE
    if (filter === 'past') {
      queryText += ` ORDER BY e.start_datetime DESC`;
    } else if (filter === 'all') {
      queryText += ` ORDER BY 
        CASE 
          WHEN COALESCE(e.end_datetime, e.start_datetime) >= NOW() THEN 0
          ELSE 1
        END,
        CASE 
          WHEN COALESCE(e.end_datetime, e.start_datetime) >= NOW() THEN e.start_datetime
          ELSE NULL
        END ASC,
        CASE 
          WHEN COALESCE(e.end_datetime, e.start_datetime) < NOW() THEN e.start_datetime
          ELSE NULL
        END DESC`;
    } else {
      queryText += ` ORDER BY e.start_datetime ASC`;
    }
    
    // Get total count for pagination
    const countQuery = queryText.replace(/SELECT[\s\S]+?FROM/, 'SELECT COUNT(*) FROM').split('ORDER BY')[0];
    const countResult = await pool.query(countQuery, params);
    const totalEvents = parseInt(countResult.rows[0].count);
    
    // Add pagination
    queryText += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(parseInt(limit), offset);
    
    const result = await pool.query(queryText, params);

    res.status(200).json({
      events: result.rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalEvents / parseInt(limit)),
        totalEvents,
        eventsPerPage: parseInt(limit)
      }
    });
  } catch (err) {
    console.error("Error in GET /events:", err);
    next(err);
  }
});


/**
 * @swagger
 * /events/organizer/{organizerId}:
 *   get:
 *     summary: Get all events for a specific organizer
 *     tags: [Events]
 *     parameters:
 *       - in: path
 *         name: organizerId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Organizer ID
 *     responses:
 *       200:
 *         description: List of organizer's events
 *       403:
 *         description: Forbidden - can only view own events
 */
router.get("/organizer/:organizerId", requireAuth, validateId('organizerId'), async (req, res, next) => {
  const organizerId = req.params.organizerId; // Already validated

  // Verify user is requesting their own events
  if (req.user.id !== organizerId) {
    return res.status(403).json({ message: "You can only view your own events!" });
  }

  try {
    const result = await pool.query(
      `SELECT 
          e.id,
          e.title,
          e.description,
          e.start_datetime,
          e.end_datetime,
          e.location,
          e.total_tickets,
          e.tickets_sold,
          e.created_at,
          CASE 
            WHEN COALESCE(e.end_datetime, e.start_datetime) < NOW() THEN true
            ELSE false
          END as is_past
        FROM events e
        WHERE e.organizer_id = $1
        ORDER BY e.start_datetime ASC`,
      [organizerId]
    );

    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Error GET /events/organizer/:organizerId:", err);
    next(err);
  }
});


/**
 * @swagger
 * /events/{id}:
 *   get:
 *     summary: Get single event with ticket types
 *     tags: [Events]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Event ID
 *     responses:
 *       200:
 *         description: Event details with ticket types
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Event'
 *       404:
 *         description: Event not found
 */
router.get("/:id", validateId('id'), async (req, res, next) => {
  const id = req.params.id; // Already validated

  try {
    const eventResult = await pool.query(
      `SELECT e.*, 
              CONCAT(u.first_name, ' ', u.last_name) AS organizer_name,
              CASE 
                WHEN COALESCE(e.end_datetime, e.start_datetime) < NOW() THEN true
                ELSE false
              END as is_past
       FROM events e
       LEFT JOIN users u ON e.organizer_id = u.id
       WHERE e.id = $1`,
      [id]
    );

    if (eventResult.rows.length === 0) {
      return res.status(404).json({ message: `Event with ID ${id} does not exist.` });
    }

    const event = eventResult.rows[0];

    //  Get ticket types for this event
    const ticketTypesResult = await pool.query(
      `SELECT id, type, price, total_tickets, tickets_sold, created_at
       FROM ticket_types
       WHERE event_id = $1
       ORDER BY price ASC`,
      [id]
    );

    event.ticket_types = ticketTypesResult.rows;

    res.status(200).json(event);
  } catch (err) {
    console.error("Error in GET /events/:id:", err);
    next(err);
  }
});

/**
 * @swagger
 * /events:
 *   post:
 *     summary: Create a new event
 *     tags: [Events]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - location
 *               - start_datetime
 *               - total_tickets
 *             properties:
 *               title:
 *                 type: string
 *                 example: Tech Conference 2025
 *               description:
 *                 type: string
 *                 example: Annual technology conference
 *               start_datetime:
 *                 type: string
 *                 format: date-time
 *               end_datetime:
 *                 type: string
 *                 format: date-time
 *               location:
 *                 type: string
 *                 example: Ljubljana Convention Center
 *               total_tickets:
 *                 type: integer
 *                 example: 500
 *     responses:
 *       201:
 *         description: Event created successfully
 *       403:
 *         description: Only organizers can create events
 */
router.post("/", requireAuth, async (req, res, next) => {
  const {
    title,
    description,
    start_datetime,
    end_datetime,
    location,
    total_tickets,
  } = req.body;

  const organizer_id = req.user.id; // Get from JWT token

  // Verify user is an organizer
  if (req.user.role !== 'organizer') {
    return res.status(403).json({ message: "Only organizers can create events!" });
  }

  // Validate title
  const titleValidation = validateString(title, 'Title', 3, 200);
  if (!titleValidation.valid) {
    return res.status(400).json({ message: titleValidation.message });
  }

  // Validate description 
  let descriptionValue = null;
  if (description) {
    const descValidation = validateString(description, 'Description', 1, 5000);
    if (!descValidation.valid) {
      return res.status(400).json({ message: descValidation.message });
    }
    descriptionValue = descValidation.value;
  }

  // Validate location
  const locationValidation = validateString(location, 'Location', 3, 200);
  if (!locationValidation.valid) {
    return res.status(400).json({ message: locationValidation.message });
  }

  // Validate total_tickets
  const ticketsValidation = validateNumber(total_tickets, 'Total tickets', 1, 100000);
  if (!ticketsValidation.valid) {
    return res.status(400).json({ message: ticketsValidation.message });
  }

  // Validate start date
  const startDateValidation = validateDate(start_datetime, 'Start date', { allowPast: false });
  if (!startDateValidation.valid) {
    return res.status(400).json({ message: startDateValidation.message });
  }

  // Validate end date
  const endDateValidation = validateDate(end_datetime, 'End date', { allowPast: false });
  if (!endDateValidation.valid) {
    return res.status(400).json({ message: endDateValidation.message });
  }

  // Validate date range
  const dateRangeValidation = validateDateRange(startDateValidation.value, endDateValidation.value);
  if (!dateRangeValidation.valid) {
    return res.status(400).json({ message: dateRangeValidation.message });
  }

  try {

    // 2️ Vstavi dogodek
    const sql = `
      INSERT INTO events (title, description, start_datetime, end_datetime, location, total_tickets, organizer_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;

    const result = await pool.query(sql, [
      titleValidation.value,
      descriptionValue,
      start_datetime,
      end_datetime,
      locationValidation.value,
      ticketsValidation.value,
      organizer_id,
    ]);

    res.status(201).json({
      message: "Event successfully added!",
      event: result.rows[0],
    });
  } catch (err) {
    console.error("Error in POST /events:", err);
    next(err);
  }
});

/**
 * @swagger
 * /events/{id}:
 *   put:
 *     summary: Update an event
 *     tags: [Events]
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
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               start_datetime:
 *                 type: string
 *                 format: date-time
 *               end_datetime:
 *                 type: string
 *                 format: date-time
 *               location:
 *                 type: string
 *               total_tickets:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Event updated successfully
 *       403:
 *         description: Not authorized to edit this event
 *       404:
 *         description: Event not found
 */
router.put("/:id", requireAuth, validateId('id'), async (req, res, next) => {
  const id = req.params.id; // Already validated
  const {
    title,
    description,
    start_datetime,
    end_datetime,
    location,
    total_tickets,
  } = req.body;

  try {
    // Use helper to check ownership
    const ownsEvent = await userOwnsEvent(req.user.id, id);
    if (!ownsEvent) {
      return res.status(403).json({
        message: "Event not found or you don't have permission to edit it!",
      });
    }

    // Validate fields if provided
    // Validate title
    if (title) {
      const titleValidation = validateString(title, 'Title', 3, 200);
      if (!titleValidation.valid) {
        return res.status(400).json({ message: titleValidation.message });
      }
    }

     // Validate description
    if (description) {
      const descValidation = validateString(description, 'Description', 1, 5000);
      if (!descValidation.valid) {
        return res.status(400).json({ message: descValidation.message });
      }
    }

     // Validate location  
    if (location) {
      const locationValidation = validateString(location, 'Location', 3, 200);
      if (!locationValidation.valid) {
        return res.status(400).json({ message: locationValidation.message });
      }
    }

    // Validate total_tickets
    if (total_tickets) {
      const ticketsValidation = validateNumber(total_tickets, 'Total tickets', 1, 100000);
      if (!ticketsValidation.valid) {
        return res.status(400).json({ message: ticketsValidation.message });
      }
    }

    // Validate start_datetime and end_datetime
    if (start_datetime && end_datetime) {
      const startValidation = validateDate(start_datetime, 'Start date', { allowPast: false });
      if (!startValidation.valid) {
        return res.status(400).json({ message: startValidation.message });
      }
      const endValidation = validateDate(end_datetime, 'End date', { allowPast: false });
      if (!endValidation.valid) {
        return res.status(400).json({ message: endValidation.message });
      }
      const rangeValidation = validateDateRange(startValidation.value, endValidation.value);
      if (!rangeValidation.valid) {
        return res.status(400).json({ message: rangeValidation.message });
      }
    }

    // Update event
    const sql = `
      UPDATE events
      SET title = COALESCE($1, title),
          description = COALESCE($2, description),
          start_datetime = COALESCE($3, start_datetime),
          end_datetime = COALESCE($4, end_datetime),
          location = COALESCE($5, location),
          total_tickets = COALESCE($6, total_tickets)
      WHERE id = $7
      RETURNING *;
    `;

    const result = await pool.query(sql, [
      title,
      description,
      start_datetime,
      end_datetime,
      location,
      total_tickets,
      id,
    ]);

    res.status(200).json({
      message: "Event successfully updated!",
      event: result.rows[0],
    });
  } catch (err) {
    console.error("Error in PUT /events/:id:", err);
    next(err);
  }
});



/**
 * @swagger
 * /events/{id}/analytics:
 *   get:
 *     summary: Get event analytics and statistics
 *     tags: [Events]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Event analytics data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ticketTypes:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/TicketType'
 *                 totalRevenue:
 *                   type: string
 *                 transactionCount:
 *                   type: integer
 *                 waitlistCount:
 *                   type: integer
 *                 recentSales:
 *                   type: array
 *                 paymentMethods:
 *                   type: array
 *       403:
 *         description: Can only view analytics for own events
 *       404:
 *         description: Event not found
 */
router.get("/:id/analytics", requireAuth, async (req, res, next) => {
  const { id } = req.params;

  try {
    // Verify event belongs to user
    const eventCheck = await pool.query(
      `SELECT organizer_id FROM events WHERE id = $1`,
      [id]
    );

    if (eventCheck.rows.length === 0) {
      return res.status(404).json({ message: "Event not found!" });
    }

    if (eventCheck.rows[0].organizer_id !== req.user.id) {
      return res.status(403).json({ message: "You can only view analytics for your own events!" });
    }
    // Get ticket types with sales data
    const ticketTypesResult = await pool.query(
      `SELECT id, type, price, total_tickets, tickets_sold
       FROM ticket_types
       WHERE event_id = $1
       ORDER BY price ASC`,
      [id]
    );

    // Get total revenue and transaction count
    const revenueResult = await pool.query(
      `SELECT 
        COALESCE(SUM(t.total_price), 0) as total_revenue,
        COUNT(DISTINCT t.id) as transaction_count
       FROM transactions t
       INNER JOIN tickets tk ON tk.transaction_id = t.id
       WHERE tk.event_id = $1 AND t.status = 'completed'`,
      [id]
    );

    // Get waitlist count
    const waitlistResult = await pool.query(
      `SELECT COUNT(*) as waitlist_count
       FROM waitlist
       WHERE event_id = $1`,
      [id]
    );

    // Get recent sales (last 10)
    const recentSalesResult = await pool.query(
      `SELECT 
        tk.id,
        tt.type as ticket_type,
        tt.price,
        CONCAT(u.first_name, ' ', u.last_name) as buyer_name,
        t.created_at
       FROM tickets tk
       INNER JOIN ticket_types tt ON tk.ticket_type_id = tt.id
       INNER JOIN transactions t ON tk.transaction_id = t.id
       INNER JOIN users u ON tk.user_id = u.id
       WHERE tk.event_id = $1 AND tk.status = 'active'
       ORDER BY t.created_at DESC
       LIMIT 10`,
      [id]
    );

    // Get payment methods breakdown (exclude 'waitlist' as it's internal system status)
    const paymentMethodsResult = await pool.query(
      `SELECT 
        t.payment_method,
        COUNT(*) as count,
        SUM(t.total_price) as total_revenue
       FROM transactions t
       INNER JOIN tickets tk ON tk.transaction_id = t.id
       WHERE tk.event_id = $1 AND t.status = 'completed' AND t.payment_method != 'waitlist'
       GROUP BY t.payment_method
       ORDER BY total_revenue DESC`,
      [id]
    );

    res.status(200).json({
      ticketTypes: ticketTypesResult.rows,
      totalRevenue: parseFloat(revenueResult.rows[0].total_revenue).toFixed(2),
      transactionCount: parseInt(revenueResult.rows[0].transaction_count),
      waitlistCount: parseInt(waitlistResult.rows[0].waitlist_count),
      recentSales: recentSalesResult.rows,
      paymentMethods: paymentMethodsResult.rows,
    });
  } catch (err) {
    console.error("Error getting event analytics:", err);
    next(err);
  }
});

/**
 * @swagger
 * /events/{id}:
 *   delete:
 *     summary: Delete an event
 *     tags: [Events]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Event deleted successfully
 *       403:
 *         description: Can only delete own events
 *       404:
 *         description: Event not found
 */
router.delete("/:id", requireAuth, async (req, res, next) => {
  const { id } = req.params;

  try {
    // Verify event exists and belongs to user
    const eventCheck = await pool.query(
      `SELECT id, organizer_id FROM events WHERE id = $1`,
      [id]
    );

    if (eventCheck.rows.length === 0) {
      return res.status(404).json({ message: "The event was not found!" });
    }

    const event = eventCheck.rows[0];

    // Check ownership
    if (event.organizer_id !== req.user.id) {
      return res.status(403).json({
        message: "You can only delete your own events!",
      });
    }

    //  Izbriši dogodek
    const result = await pool.query(
      `DELETE FROM events WHERE id = $1 RETURNING *`,
      [id]
    );

    res.status(200).json({
      message: "Event successfully deleted!",
      deleted: result.rows[0],
    });
  } catch (err) {
    console.error("Error in DELETE /events/:id:", err);
    next(err);
  }
});


export default router;
