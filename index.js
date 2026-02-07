import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pool from "./db.js";
import eventsRouter from "./routes/events.js"; // 
import ticketTypesRouter from "./routes/ticketTypes.js"; //
import usersRouter from "./routes/users.js";
import ticketsRouter from "./routes/tickets.js"; //
import transactionsRouter from "./routes/transactions.js";
import waitlistRouter from "./routes/waitlist.js";
import { swaggerUi, swaggerSpec } from "./swagger.js";

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

/**
 * @swagger
 * /:
 *   get:
 *     summary: API Health Check
 *     description: Returns a simple message to verify the API is running
 *     tags: [Health]
 *     security: []
 *     responses:
 *       200:
 *         description: API is working
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: EventGo API is working
 */
app.get("/", (req, res) => {
  res.json({ message: "EventGo API is working" });
});

// Swagger UI
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: "EventGo API Documentation"
}));

// API routes
app.use("/events", eventsRouter);
app.use("/ticket-types", ticketTypesRouter);
app.use("/users", usersRouter);
app.use("/tickets", ticketsRouter);
app.use("/transactions", transactionsRouter);
app.use("/waitlist", waitlistRouter);

// 404 handler - must come after all routes
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.path 
  });
});

// Global error handler - must be last middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  
  // Don't expose internal errors in production
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : err.message;
  
  const statusCode = err.statusCode || 500;
  
  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { 
      stack: err.stack,
      details: err.details 
    })
  });
});

const PORT = process.env.PORT || 5000;

// Get network IP addresses
import { networkInterfaces } from 'os';
const getNetworkIPs = () => {
  const nets = networkInterfaces();
  const ips = [];
  
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  return ips;
};

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Local: http://localhost:${PORT}`);
  
  const networkIPs = getNetworkIPs();
  if (networkIPs.length > 0) {
    networkIPs.forEach(ip => {
      console.log(`Network: http://${ip}:${PORT}`);
    });
  }
});
