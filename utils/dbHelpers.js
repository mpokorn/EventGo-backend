// Database helper functions to eliminate code duplication
import pool from '../db.js';

/* --------------------------------------
   Check if User Exists
-------------------------------------- */
export async function userExists(userId) {
  const result = await pool.query(
    'SELECT id FROM users WHERE id = $1',
    [userId]
  );
  return result.rows.length > 0;
}

/* --------------------------------------
   Get User by ID
-------------------------------------- */
export async function getUserById(userId) {
  const result = await pool.query(
    'SELECT id, name, surname, email, role, created_at FROM users WHERE id = $1',
    [userId]
  );
  return result.rows[0] || null;
}

/* --------------------------------------
   Check if Event Exists
-------------------------------------- */
export async function eventExists(eventId) {
  const result = await pool.query(
    'SELECT id FROM events WHERE id = $1',
    [eventId]
  );
  return result.rows.length > 0;
}

/* --------------------------------------
   Get Event by ID
-------------------------------------- */
export async function getEventById(eventId) {
  const result = await pool.query(
    'SELECT * FROM events WHERE id = $1',
    [eventId]
  );
  return result.rows[0] || null;
}

/* --------------------------------------
   Check if Ticket Type Exists
-------------------------------------- */
export async function ticketTypeExists(ticketTypeId) {
  const result = await pool.query(
    'SELECT id FROM ticket_types WHERE id = $1',
    [ticketTypeId]
  );
  return result.rows.length > 0;
}

/* --------------------------------------
   Get Ticket Type by ID
-------------------------------------- */
export async function getTicketTypeById(ticketTypeId) {
  const result = await pool.query(
    'SELECT * FROM ticket_types WHERE id = $1',
    [ticketTypeId]
  );
  return result.rows[0] || null;
}

/* --------------------------------------
   Check if User Owns Event
-------------------------------------- */
export async function userOwnsEvent(userId, eventId) {
  const result = await pool.query(
    'SELECT id FROM events WHERE id = $1 AND organizer_id = $2',
    [eventId, userId]
  );
  return result.rows.length > 0;
}

/* --------------------------------------
   Transaction Helper - Execute queries in transaction
-------------------------------------- */
export async function executeTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
