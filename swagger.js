import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'EventGo API',
      version: '1.0.0',
      description: 'API documentation for EventGo - Event Management System',
      contact: {
        name: 'EventGo Team',
        email: 'support@eventgo.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT token'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            first_name: { type: 'string', example: 'John' },
            last_name: { type: 'string', example: 'Doe' },
            email: { type: 'string', format: 'email', example: 'john.doe@example.com' },
            role: { type: 'string', enum: ['user', 'organizer', 'admin'], example: 'user' },
            created_at: { type: 'string', format: 'date-time' }
          }
        },
        Event: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            title: { type: 'string', example: 'Tech Conference 2025' },
            description: { type: 'string', example: 'Annual technology conference' },
            start_datetime: { type: 'string', format: 'date-time', example: '2025-12-15T09:00:00' },
            end_datetime: { type: 'string', format: 'date-time', example: '2025-12-15T18:00:00' },
            location: { type: 'string', example: 'Convention Center, Ljubljana' },
            total_tickets: { type: 'integer', example: 500 },
            tickets_sold: { type: 'integer', example: 250 },
            organizer_id: { type: 'integer', example: 1 },
            organizer_name: { type: 'string', example: 'John Doe' },
            is_past: { type: 'boolean', example: false },
            created_at: { type: 'string', format: 'date-time' }
          }
        },
        TicketType: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            event_id: { type: 'integer', example: 1 },
            type: { type: 'string', example: 'VIP' },
            price: { type: 'number', format: 'decimal', example: 99.99 },
            total_tickets: { type: 'integer', example: 100 },
            tickets_sold: { type: 'integer', example: 45 },
            created_at: { type: 'string', format: 'date-time' }
          }
        },
        Ticket: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            user_id: { type: 'integer', example: 1 },
            event_id: { type: 'integer', example: 1 },
            ticket_type_id: { type: 'integer', example: 1 },
            transaction_id: { type: 'integer', example: 1 },
            status: { type: 'string', enum: ['active', 'reserved', 'refunded', 'pending_return'], example: 'active' },
            issued_at: { type: 'string', format: 'date-time' }
          }
        },
        Transaction: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            user_id: { type: 'integer', example: 1 },
            total_price: { type: 'number', format: 'decimal', example: 199.98 },
            status: { type: 'string', enum: ['completed', 'pending', 'cancelled', 'expired'], example: 'completed' },
            payment_method: { type: 'string', enum: ['card', 'paypal', 'waitlist'], example: 'card' },
            created_at: { type: 'string', format: 'date-time' }
          }
        },
        Waitlist: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            user_id: { type: 'integer', example: 1 },
            event_id: { type: 'integer', example: 1 },
            joined_at: { type: 'string', format: 'date-time' },
            offered_at: { type: 'string', format: 'date-time', nullable: true },
            reservation_expires_at: { type: 'string', format: 'date-time', nullable: true }
          }
        },
        Error: {
          type: 'object',
          properties: {
            message: { type: 'string', example: 'Error message' }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: ['./routes/*.js', './index.js']
};

const swaggerSpec = swaggerJsdoc(options);

export { swaggerUi, swaggerSpec };
