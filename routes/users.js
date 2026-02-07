// src/routes/users.js
import express from "express";
import pool from "../db.js";
import { hashPassword, comparePassword, generateToken, generateRefreshToken, verifyToken } from "../utils/auth.js";
import { requireAuth } from "../middleware/auth.js";
import { validateId, validateEmail, validatePassword, validateString, sanitizeBody } from "../middleware/validation.js";
import { userExists, getUserById } from "../utils/dbHelpers.js";

const router = express.Router();

// Apply sanitization middleware to all POST/PUT routes
router.use(sanitizeBody);

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User management and authentication
 */

/**
 * @swagger
 * /users/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Users]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - first_name
 *               - last_name
 *               - email
 *               - password
 *             properties:
 *               first_name:
 *                 type: string
 *                 example: John
 *               last_name:
 *                 type: string
 *                 example: Doe
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john.doe@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: SecurePass123!
 *               role:
 *                 type: string
 *                 enum: [user, organizer, admin]
 *                 default: user
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 token:
 *                   type: string
 *                 refreshToken:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Validation error or user already exists
 */
router.post("/register", async (req, res, next) => {
  const { first_name, last_name, email, password, role } = req.body;

  // Validate first name
  const firstNameValidation = validateString(first_name, 'First name', 1, 50);
  if (!firstNameValidation.valid) {
    return res.status(400).json({ message: firstNameValidation.message });
  }

  // Validate last name
  const lastNameValidation = validateString(last_name, 'Last name', 1, 50);
  if (!lastNameValidation.valid) {
    return res.status(400).json({ message: lastNameValidation.message });
  }

  // Validate email
  const emailValidation = validateEmail(email);
  if (!emailValidation.valid) {
    return res.status(400).json({ message: emailValidation.message });
  }

  // Validate password
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    return res.status(400).json({ message: passwordValidation.message });
  }

  try {
    // Check if user already exists
    const existing = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [emailValidation.value || email]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        message: "User with this email already exists!"
      });
    }

    // Allowed roles from frontend for registration
    const allowedRoles = ["user", "organizer", "admin"];
    if (role && !allowedRoles.includes(role)) {
      return res.status(400).json({
        message: `Invalid role '${role}'. Allowed roles are: ${allowedRoles.join(", ")}.`
      });
    }

    const hashedPassword = await hashPassword(password);

    // Insert user with sanitized data
    const result = await pool.query(
      `
      INSERT INTO users (first_name, last_name, email, password, role)
      VALUES ($1, $2, $3, $4, COALESCE($5, 'user')::user_role)
      RETURNING id, first_name, last_name, email, role;
      `,
      [
        firstNameValidation.value,
        lastNameValidation.value,
        emailValidation.value || email,
        hashedPassword,
        role
      ]
    );

    const token = generateToken(result.rows[0]);
    const refreshToken = generateRefreshToken(result.rows[0]);

    res.status(201).json({
      message: "Registration successful!",
      token,
      refreshToken,
      user: result.rows[0]
    });
  } catch (err) {
    console.error("Error in registration:", err);
    next(err);
  }
});

/**
 * @swagger
 * /users/login:
 *   post:
 *     summary: User login
 *     tags: [Users]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john.doe@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: SecurePass123!
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 token:
 *                   type: string
 *                 refreshToken:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Invalid credentials
 */
router.post("/login", async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      message: "Email and password are required!"
    });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "Incorrect email or password!"
      });
    }

    const user = result.rows[0];
    const isValidPassword = await comparePassword(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({
        message: "Incorrect email or password!"
      });
    }

    const token = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    res.status(200).json({
      message: "Login successful!",
      token,
      refreshToken,
      user: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error("Error in login:", err);
    next(err);
  }
});

/**
 * @swagger
 * /users/organizer-register:
 *   post:
 *     summary: Register as an organizer
 *     tags: [Users]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - first_name
 *               - last_name
 *               - email
 *               - password
 *             properties:
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       201:
 *         description: Organizer registered successfully
 *       400:
 *         description: Validation error or email already exists
 */
router.post("/organizer-register", async (req, res, next) => {
  const { first_name, last_name, email, password } = req.body;

  // Validate all fields
  const firstNameValidation = validateString(first_name, 'First name', 1, 50);
  if (!firstNameValidation.valid) {
    return res.status(400).json({ message: firstNameValidation.message });
  }

  const lastNameValidation = validateString(last_name, 'Last name', 1, 50);
  if (!lastNameValidation.valid) {
    return res.status(400).json({ message: lastNameValidation.message });
  }

  const emailValidation = validateEmail(email);
  if (!emailValidation.valid) {
    return res.status(400).json({ message: emailValidation.message });
  }

  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    return res.status(400).json({ message: passwordValidation.message });
  }

  try {
    const existing = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [emailValidation.value || email]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        message: "User with this email already exists!"
      });
    }

    const hashedPassword = await hashPassword(password);

    const result = await pool.query(
      `
      INSERT INTO users (first_name, last_name, email, password, role)
      VALUES ($1, $2, $3, $4, 'organizer'::user_role)
      RETURNING id, first_name, last_name, email, role;
      `,
      [
        firstNameValidation.value,
        lastNameValidation.value,
        emailValidation.value || email,
        hashedPassword
      ]
    );

    const token = generateToken(result.rows[0]);
    const refreshToken = generateRefreshToken(result.rows[0]);

    res.status(201).json({
      message: "Organizer registration successful!",
      token,
      refreshToken,
      user: result.rows[0]
    });
  } catch (err) {
    console.error("Error in organizer registration:", err);
    next(err);
  }
});

/**
 * @swagger
 * /users/organizer-login:
 *   post:
 *     summary: Organizer login
 *     tags: [Users]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Organizer login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 token:
 *                   type: string
 *                 refreshToken:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Invalid credentials or not an organizer
 */
router.post("/organizer-login", async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      message: "Email and password are required!"
    });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1 AND role = 'organizer'",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "Incorrect email or password, or you are not an organizer!"
      });
    }

    const user = result.rows[0];
    const isValidPassword = await comparePassword(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({
        message: "Incorrect email or password!"
      });
    }

    const token = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    res.status(200).json({
      message: "Organizer login successful!",
      token,
      refreshToken,
      user: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error("Error in organizer login:", err);
    next(err);
  }
});

/**
 * @swagger
 * /users:
 *   get:
 *     summary: Get all users
 *     tags: [Users]
 *     parameters:
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [user, organizer, admin]
 *         description: Filter by user role
 *     responses:
 *       200:
 *         description: List of users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 */
router.get("/", requireAuth, async (req, res, next) => {
  const { role } = req.query;

  try {
    const result = await pool.query(
      `
      SELECT id, first_name, last_name, email, role, created_at
      FROM users
      ${role ? "WHERE role = $1" : ""}
      ORDER BY created_at DESC;
      `,
      role ? [role] : []
    );

    res.status(200).json({
      message: role ? `Users with role '${role}' found.` : "All users found.",
      users: result.rows
    });
  } catch (err) {
    console.error("Error in GET /users:", err);
    next(err);
  }
});

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     summary: Get user by ID
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     responses:
 *       200:
 *         description: User details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       403:
 *         description: Can only access own profile
 *       404:
 *         description: User not found
 */
router.get("/:id", requireAuth, validateId('id'), async (req, res, next) => {
  const id = req.params.id; // Already validated and converted to number

  // Verify user is accessing their own profile
  if (req.user.id !== id) {
    return res.status(403).json({ message: "You can only access your own profile!" });
  }

  try {
    const result = await pool.query(
      `
      SELECT id, first_name, last_name, email, role, created_at
      FROM users
      WHERE id = $1;
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: `User with ID ${id} does not exist.` });
    }

    const counts = await pool.query(
      `
      SELECT 
        (SELECT COUNT(*) FROM events WHERE organizer_id = $1) AS event_count,
        (SELECT COUNT(*) FROM transactions WHERE user_id = $1) AS transaction_count,
        (SELECT COUNT(*) FROM tickets WHERE user_id = $1) AS ticket_count,
        (SELECT COUNT(*) FROM waitlist WHERE user_id = $1) AS waitlist_count;
      `,
      [id]
    );

    res.status(200).json({
      user: result.rows[0],
      related_counts: counts.rows[0]
    });
  } catch (err) {
    console.error("Error in GET /users/:id:", err);
    next(err);
  }
});

/**
 * @swagger
 * /users:
 *   post:
 *     summary: Create a new user (admin)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - first_name
 *               - last_name
 *               - email
 *               - password
 *             properties:
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *               role:
 *                 type: string
 *                 enum: [user, organizer, admin]
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: Validation error or email already exists
 */
router.post("/", requireAuth, async (req, res, next) => {
  const { first_name, last_name, email, password, role } = req.body;

  // Validate all fields
  const firstNameValidation = validateString(first_name, 'First name', 1, 50);
  if (!firstNameValidation.valid) {
    return res.status(400).json({ message: firstNameValidation.message });
  }

  const lastNameValidation = validateString(last_name, 'Last name', 1, 50);
  if (!lastNameValidation.valid) {
    return res.status(400).json({ message: lastNameValidation.message });
  }

  const emailValidation = validateEmail(email);
  if (!emailValidation.valid) {
    return res.status(400).json({ message: emailValidation.message });
  }

  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    return res.status(400).json({ message: passwordValidation.message });
  }

  const validRoles = ["user", "organizer", "admin"];
  if (role && !validRoles.includes(role)) {
    return res.status(400).json({
      message: `Invalid role '${role}'.`
    });
  }

  try {
    const check = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [emailValidation.value || email]
    );

    if (check.rows.length > 0) {
      return res.status(400).json({
        message: "User with this email already exists!"
      });
    }

    const hashedPassword = await hashPassword(password);

    const result = await pool.query(
      `
      INSERT INTO users (first_name, last_name, email, password, role)
      VALUES ($1, $2, $3, $4, COALESCE($5,'user')::user_role)
      RETURNING id, first_name, last_name, email, role, created_at;
      `,
      [
        firstNameValidation.value,
        lastNameValidation.value,
        emailValidation.value || email,
        hashedPassword,
        role
      ]
    );

    res.status(201).json({
      message: "User successfully added!",
      user: result.rows[0]
    });
  } catch (err) {
    console.error("Error in POST /users:", err);
    next(err);
  }
});

/**
 * @swagger
 * /users/refresh-token:
 *   post:
 *     summary: Refresh access token
 *     tags: [Users]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: The refresh token received during login
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 token:
 *                   type: string
 *                 refreshToken:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Invalid or expired refresh token
 *       404:
 *         description: User not found
 */
router.post("/refresh-token", async (req, res, next) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({
      message: "Refresh token is required"
    });
  }

  try {
    const decoded = verifyToken(refreshToken);

    if (decoded.type !== 'refresh') {
      return res.status(401).json({
        message: "Invalid refresh token"
      });
    }

    // Get fresh user data
    const result = await pool.query(
      "SELECT id, first_name, last_name, email, role FROM users WHERE id = $1",
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    const user = result.rows[0];
    const newToken = generateToken(user);
    const newRefreshToken = generateRefreshToken(user);

    res.status(200).json({
      message: "Token refreshed successfully",
      token: newToken,
      refreshToken: newRefreshToken,
      user
    });
  } catch (err) {
    console.error("Error refreshing token:", err);
    return res.status(401).json({
      message: err.message || "Invalid or expired refresh token"
    });
  }
});

/**
 * @swagger
 * /users/{id}:
 *   put:
 *     summary: Update user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *                 description: New password
 *               oldPassword:
 *                 type: string
 *                 format: password
 *                 description: Current password (required if changing password)
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       400:
 *         description: Validation error or email already in use
 *       403:
 *         description: Can only update own profile
 *       404:
 *         description: User not found
 */
router.put("/:id", requireAuth, validateId('id'), sanitizeBody, async (req, res, next) => {
  const id = req.params.id; // Already validated and converted to number
  const { first_name, last_name, email, password, oldPassword } = req.body;

  // Verify user is updating their own account
  if (req.user.id !== id) {
    return res.status(403).json({ message: "You can only update your own profile!" });
  }

  // Validate at least one field is provided
  if (!first_name && !last_name && !email && !password) {
    return res.status(400).json({ message: "At least one field must be provided to update." });
  }

  try {
    // Check user exists and get password for verification if needed
    const userCheck = await pool.query("SELECT id, email, password FROM users WHERE id = $1", [id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ message: "User not found!" });
    }

    // If user wants to change password, verify old password first
    if (password !== undefined && password.trim() !== '') {
      if (!oldPassword) {
        return res.status(400).json({ message: "Current password is required to set a new password!" });
      }
      
      const isValidOldPassword = await comparePassword(oldPassword, userCheck.rows[0].password);
      if (!isValidOldPassword) {
        return res.status(401).json({ message: "Current password is incorrect!" });
      }
    }

    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (first_name !== undefined) {
      const validation = validateString(first_name, 'First name', 1, 100);
      if (!validation.valid) {
        return res.status(400).json({ message: validation.message });
      }
      updates.push(`first_name = $${paramIndex++}`);
      values.push(validation.value);
    }

    if (last_name !== undefined) {
      const validation = validateString(last_name, 'Last name', 1, 100);
      if (!validation.valid) {
        return res.status(400).json({ message: validation.message });
      }
      updates.push(`last_name = $${paramIndex++}`);
      values.push(validation.value);
    }

    if (email !== undefined) {
      const validation = validateEmail(email);
      if (!validation.valid) {
        return res.status(400).json({ message: validation.message });
      }
      
      const sanitizedEmail = email.toLowerCase().trim();
      
      // Check if email is already taken by another user
      const emailCheck = await pool.query(
        "SELECT id FROM users WHERE email = $1 AND id != $2",
        [sanitizedEmail, id]
      );
      
      if (emailCheck.rows.length > 0) {
        return res.status(400).json({ message: "Email already in use by another account!" });
      }
      
      updates.push(`email = $${paramIndex++}`);
      values.push(sanitizedEmail);
    }

    if (password !== undefined && password.trim() !== '') {
      const validation = validatePassword(password);
      if (!validation.valid) {
        return res.status(400).json({ message: validation.message });
      }
      
      const hashedPassword = await hashPassword(password);
      updates.push(`password = $${paramIndex++}`);
      values.push(hashedPassword);
    }

    // Check if any fields were actually updated
    if (updates.length === 0) {
      return res.status(400).json({ message: "No valid fields provided to update." });
    }

    // Add user ID for WHERE clause
    values.push(id);

    const query = `
      UPDATE users 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, first_name, last_name, email, role, created_at;
    `;

    const result = await pool.query(query, values);

    res.status(200).json({
      message: "Profile updated successfully!",
      user: result.rows[0]
    });
  } catch (err) {
    console.error("Error in PUT /users/:id:", err);
    next(err);
  }
});

/**
 * @swagger
 * /users/{id}:
 *   delete:
 *     summary: Delete user account
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     responses:
 *       200:
 *         description: User deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 deleted:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Cannot delete - user has related records
 *       403:
 *         description: Can only delete own account
 *       404:
 *         description: User not found
 */
router.delete("/:id", requireAuth, validateId('id'), async (req, res, next) => {
  const id = req.params.id; // Already validated

  // Verify user is deleting their own account
  if (req.user.id !== id) {
    return res.status(403).json({ message: "You can only delete your own account!" });
  }

  try {
    const check = await pool.query(
      "SELECT id FROM users WHERE id = $1",
      [id]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({
        message: "User not found!"
      });
    }

    const rel = await pool.query(
      `
      SELECT 
        (SELECT COUNT(*) FROM events WHERE organizer_id = $1) AS event_count,
        (SELECT COUNT(*) FROM transactions WHERE user_id = $1) AS transaction_count,
        (SELECT COUNT(*) FROM tickets WHERE user_id = $1) AS ticket_count,
        (SELECT COUNT(*) FROM waitlist WHERE user_id = $1) AS waitlist_count;
      `,
      [id]
    );

    const { event_count, transaction_count, ticket_count, waitlist_count } = rel.rows[0];

    if (
      parseInt(event_count) > 0 ||
      parseInt(transaction_count) > 0 ||
      parseInt(ticket_count) > 0 ||
      parseInt(waitlist_count) > 0
    ) {
      return res.status(400).json({
        message: "Cannot delete user - has related records.",
        relations: rel.rows[0]
      });
    }

    const deleted = await pool.query(
      `
      DELETE FROM users
      WHERE id = $1
      RETURNING id, first_name, last_name, email, role, created_at;
      `,
      [id]
    );

    res.status(200).json({
      message: "User successfully deleted!",
      deleted: deleted.rows[0]
    });
  } catch (err) {
    console.error("Error in DELETE /users/:id:", err);
    next(err);
  }
});

export default router;
