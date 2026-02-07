# EventGo API Documentation

## Table of Contents
- [Overview](#overview)
- [Base URL](#base-url)
- [Authentication](#authentication)
- [Swagger Documentation](#swagger-documentation)
- [API Endpoints](#api-endpoints)
  - [Users](#users)
  - [Events](#events)
  - [Tickets](#tickets)
  - [Ticket Types](#ticket-types)
  - [Transactions](#transactions)
  - [Waitlist](#waitlist)
- [Error Responses](#error-responses)
- [Data Models](#data-models)

---

## Overview

EventGo is a comprehensive event management platform API that enables users to browse, create, and manage events, purchase tickets, and handle waitlists for sold-out events. The API supports user registration, authentication, event management, ticket purchasing, and transaction processing.

**Version:** 1.0.0  
**Last Updated:** February 2026

---

## Base URL

```
http://localhost:5000
```

For production deployments, replace `localhost:5000` with your production domain.

---

## Authentication

Most endpoints require authentication using JSON Web Tokens (JWT). After successful registration or login, you will receive an access token that must be included in subsequent requests.

### Authentication Header

```
Authorization: Bearer <your-jwt-token>
```

### Token Refresh

Access tokens expire after a certain period. Use the refresh token endpoint to obtain a new access token without requiring the user to log in again.

### Public Endpoints (No Authentication Required)

- `GET /events` - Browse events
- `GET /events/:id` - Get event details
- `GET /ticket-types/:event_id` - Get ticket types for an event
- `POST /users/register` - User registration
- `POST /users/login` - User login
- `POST /users/organizer-register` - Organizer registration
- `POST /users/organizer-login` - Organizer login
- `POST /users/refresh-token` - Refresh access token

---

## Swagger Documentation

Interactive API documentation is available via Swagger UI.

### Accessing Swagger

1. **Start the backend server**:
   ```bash
   cd backend
   npm start
   ```

2. **Open your browser** and navigate to:
   ```
   http://localhost:5000/api-docs
   ```

### Swagger Features

- **Interactive API Explorer**: Test endpoints directly from the browser
- **Authentication**: Use the "Authorize" button to add your JWT token
- **Request/Response Examples**: See sample requests and responses
- **Schema Documentation**: View all data models and their properties
- **Filter & Search**: Filter endpoints by tags (Users, Events, Tickets, etc.)

---

## API Endpoints

### Users

#### Register User
```
POST /users/register
```
Create a new user account.

**Request Body:**
```json
{
  "first_name": "John",
  "last_name": "Doe",
  "email": "john.doe@example.com",
  "password": "SecurePass123!",
  "role": "user"
}
```

**Response:** `201 Created`
```json
{
  "message": "User registered successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@example.com",
    "role": "user"
  }
}
```

---

#### Login
```
POST /users/login
```
Authenticate a user and receive access tokens.

**Request Body:**
```json
{
  "email": "john.doe@example.com",
  "password": "SecurePass123!"
}
```

**Response:** `200 OK`
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@example.com",
    "role": "user"
  }
}
```

---

#### Register Organizer
```
POST /users/organizer-register
```
Register as an event organizer.

**Request Body:**
```json
{
  "first_name": "Jane",
  "last_name": "Smith",
  "email": "jane.smith@example.com",
  "password": "SecurePass123!",
  "organization_name": "Event Masters Inc."
}
```

**Response:** `201 Created`

---

#### Organizer Login
```
POST /users/organizer-login
```
Authenticate an organizer account.

**Request Body:**
```json
{
  "email": "jane.smith@example.com",
  "password": "SecurePass123!"
}
```

**Response:** `200 OK`

---

#### Refresh Token
```
POST /users/refresh-token
```
Get a new access token using a refresh token.

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:** `200 OK`
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

#### Get All Users
```
GET /users
```
**Authentication Required**

Retrieve a list of all users.

**Query Parameters:**
- `role` (string): Filter by user role (`user`, `organizer`, `admin`)

**Response:** `200 OK`
```json
[
  {
    "id": 1,
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@example.com",
    "role": "user",
    "created_at": "2026-01-15T10:30:00Z"
  }
]
```

---

#### Get User by ID
```
GET /users/:id
```
**Authentication Required**

Retrieve a specific user by ID (users can only access their own profile).

**Response:** `200 OK`
```json
{
  "user": {
    "id": 1,
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@example.com",
    "role": "user",
    "created_at": "2026-01-15T10:30:00Z"
  },
  "related_counts": {
    "event_count": "0",
    "transaction_count": "5",
    "ticket_count": "8",
    "waitlist_count": "2"
  }
}
```

---

#### Create User
```
POST /users
```
**Authentication Required**

Create a new user (admin functionality).

---

#### Update User
```
PUT /users/:id
```
**Authentication Required**

Update user information.

**Request Body:**
```json
{
  "first_name": "John",
  "last_name": "Doe",
  "email": "john.updated@example.com",
  "password": "NewSecurePass123!",
  "oldPassword": "SecurePass123!"
}
```

**Note:** When changing password, both `password` (new password) and `oldPassword` (current password) are required.

**Response:** `200 OK`

---

#### Delete User
```
DELETE /users/:id
```
**Authentication Required**

Delete a user account.

**Response:** `200 OK`

---

### Events

#### Get All Events
```
GET /events
```
Get a list of events with optional filters.

**Query Parameters:**
- `search` (string): Search by title or description
- `location` (string): Filter by location
- `startDate` (string): Filter events starting from this date
- `endDate` (string): Filter events ending before this date
- `filter` (string): Filter by status (`all`, `upcoming`, `past`) - default: `upcoming`
- `page` (integer): Page number - default: 1
- `limit` (integer): Items per page - default: 12

**Example:**
```
GET /events?search=concert&location=New York&filter=upcoming&page=1&limit=10
```

**Response:** `200 OK`
```json
{
  "events": [
    {
      "id": 1,
      "title": "Summer Music Festival",
      "description": "Annual summer music festival",
      "start_datetime": "2026-07-15T18:00:00Z",
      "end_datetime": "2026-07-15T23:00:00Z",
      "location": "Central Park, New York",
      "total_tickets": 5000,
      "tickets_sold": 3200,
      "organizer_name": "Jane Smith",
      "is_past": false,
      "created_at": "2026-01-10T12:00:00Z"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalEvents": 48,
    "eventsPerPage": 10
  }
}
```

---

#### Get Event by ID
```
GET /events/:id
```
Get detailed information about a specific event.

**Response:** `200 OK`
```json
{
  "id": 1,
  "title": "Summer Music Festival",
  "description": "Annual summer music festival featuring top artists",
  "start_datetime": "2026-07-15T18:00:00Z",
  "end_datetime": "2026-07-15T23:00:00Z",
  "location": "Central Park, New York",
  "total_tickets": 5000,
  "tickets_sold": 3200,
  "organizer_id": 5,
  "organizer_name": "Jane Smith",
  "is_past": false,
  "created_at": "2026-01-10T12:00:00Z",
  "ticket_types": [
    {
      "id": 1,
      "type": "VIP",
      "price": 100.00,
      "total_tickets": 500,
      "tickets_sold": 450,
      "created_at": "2026-01-10T12:00:00Z"
    },
    {
      "id": 2,
      "type": "General Admission",
      "price": 50.00,
      "total_tickets": 4500,
      "tickets_sold": 2750,
      "created_at": "2026-01-10T12:00:00Z"
    }
  ]
}
```

---

#### Get Events by Organizer
```
GET /events/organizer/:organizerId
```
**Authentication Required**

Get all events created by a specific organizer.

**Response:** `200 OK`

---

#### Create Event
```
POST /events
```
**Authentication Required** (Organizer role)

Create a new event.

**Request Body:**
```json
{
  "title": "Summer Music Festival",
  "description": "Annual summer music festival",
  "start_datetime": "2026-07-15T18:00:00Z",
  "end_datetime": "2026-07-15T23:00:00Z",
  "location": "Central Park, New York",
  "total_tickets": 5000
}
```

**Response:** `201 Created`
```json
{
  "message": "Event created successfully",
  "event": {
    "id": 1,
    "title": "Summer Music Festival",
    "organizer_id": 5,
    ...
  }
}
```

---

#### Update Event
```
PUT /events/:id
```
**Authentication Required** (Must be event organizer)

Update event details.

**Request Body:**
```json
{
  "title": "Summer Music Festival 2026",
  "description": "Updated description",
  "location": "Madison Square Garden, New York"
}
```

**Response:** `200 OK`

---

#### Get Event Analytics
```
GET /events/:id/analytics
```
**Authentication Required** (Must be event organizer)

Get analytics and statistics for an event.

**Response:** `200 OK`
```json
{
  "event_id": 1,
  "title": "Summer Music Festival",
  "total_tickets": 5000,
  "tickets_sold": 3200,
  "tickets_available": 1800,
  "total_revenue": 96000.00,
  "ticket_types": [
    {
      "type": "VIP",
      "total": 500,
      "sold": 450,
      "revenue": 22500.00
    }
  ]
}
```

---

#### Delete Event
```
DELETE /events/:id
```
**Authentication Required** (Must be event organizer)

Delete an event.

**Response:** `200 OK`

---

### Tickets

#### Get All Tickets
```
GET /tickets
```
**Authentication Required**

Get a list of all tickets.

**Response:** `200 OK`
```json
{
  "message": "All tickets retrieved successfully",
  "total_tickets": 150,
  "tickets": [
    {
      "id": 1,
      "user_id": 3,
      "buyer_name": "John Doe",
      "event_id": 1,
      "event_name": "Summer Music Festival",
      "ticket_type_id": 2,
      "ticket_type": "General Admission",
      "ticket_price": 50.00,
      "transaction_id": 10,
      "status": "active",
      "issued_at": "2026-02-01T14:30:00Z"
    }
  ]
}
```

---

#### Get Ticket by ID
```
GET /tickets/:id
```
**Authentication Required**

Get details of a specific ticket.

**Response:** `200 OK`

---

#### Get User's Tickets
```
GET /tickets/user/:user_id
```
**Authentication Required**

Get all tickets purchased by a specific user.

**Response:** `200 OK`
```json
{
  "message": "User tickets retrieved successfully.",
  "user": {
    "id": 3,
    "name": "John Doe"
  },
  "total_tickets": 3,
  "tickets": [
    {
      "id": 45,
      "event_name": "Summer Music Festival",
      "location": "Central Park, New York",
      "start_datetime": "2026-07-15T18:00:00Z",
      "ticket_type": "General Admission",
      "ticket_price": 50.00,
      "status": "active",
      "issued_at": "2026-02-01T14:30:00Z"
    }
  ]
}
```

---

#### Get User's Tickets for Event
```
GET /tickets/user/:user_id/event/:event_id
```
**Authentication Required**

Get all tickets for a specific user and event combination.

**Response:** `200 OK`

---

#### Get Tickets for Event
```
GET /tickets/event/:event_id
```
**Authentication Required**

Get all tickets sold for a specific event.

**Response:** `200 OK`

---

#### Purchase Tickets
```
POST /tickets
```
**Authentication Required**

Purchase one or more tickets for an event.

**Request Body:**
```json
{
  "event_id": 1,
  "ticket_type_id": 2,
  "quantity": 2,
  "payment_method": "card"
}
```

**Note:** 
- `quantity` defaults to 1 if not provided (maximum: 10)
- `payment_method` options: `card`, `paypal`

**Response:** `201 Created`
```json
{
  "message": "Successfully purchased 2 ticket(s)!",
  "transaction_id": 10,
  "total_price": 100.00,
  "quantity": 2,
  "payment_method": "card"
}
```

---

#### Refund Ticket (User)
```
PUT /tickets/:id/refund
```
**Authentication Required**

Request a refund for a ticket.

**Important:** 
- Only works for sold-out events
- Ticket status changes to `pending_return`
- You keep the ticket until someone from waitlist purchases it
- If waitlist exists, ticket is offered to first person

**Response:** `200 OK`
```json
{
  "message": "Your ticket has been offered to someone on the waitlist...",
  "ticket": {
    "id": 45,
    "status": "pending_return"
  },
  "assigned_to_waitlist": true
}
```

---

#### Refund Ticket (Organizer)
```
PUT /tickets/:id/organizer-refund
```
**Authentication Required** (Must be event organizer)

Organizer-initiated ticket refund.

**Note:** 
- Can refund tickets anytime (not just sold-out events)
- Immediately refunds and decrements `tickets_sold`
- If event was sold out, offers ticket to waitlist

**Response:** `200 OK`
```json
{
  "message": "Ticket refunded successfully! It has been offered to the first person on the waitlist.",
  "ticket_id": 45,
  "event_id": 1,
  "tickets_available": 1801,
  "waitlist_assigned": true
}
```

---

#### Delete Ticket
```
DELETE /tickets/:id
```
**Authentication Required**

Delete a ticket.

**Response:** `200 OK`

---

### Ticket Types

#### Get Ticket Types for Event
```
GET /ticket-types/:event_id
```
Get all ticket types available for a specific event.

**Response:** `200 OK`
```json
[
  {
    "id": 1,
    "type": "VIP",
    "price": 100.00,
    "total_tickets": 500,
    "tickets_sold": 450,
    "created_at": "2026-01-10T12:00:00Z",
    "event_name": "Summer Music Festival",
    "start_datetime": "2026-07-15T18:00:00Z"
  },
  {
    "id": 2,
    "type": "General Admission",
    "price": 50.00,
    "total_tickets": 4500,
    "tickets_sold": 2750,
    "created_at": "2026-01-10T12:00:00Z",
    "event_name": "Summer Music Festival",
    "start_datetime": "2026-07-15T18:00:00Z"
  }
]
```

---

#### Create Ticket Type
```
POST /ticket-types
```
**Authentication Required** (Must be event organizer)

Create a new ticket type for an event.

**Request Body:**
```json
{
  "event_id": 1,
  "type": "VIP",
  "price": 100.00,
  "total_tickets": 500
}
```

**Response:** `201 Created`
```json
{
  "message": "Ticket type successfully added!",
  "ticket_type": {
    "id": 1,
    "event_id": 1,
    "type": "VIP",
    "price": 100.00,
    "total_tickets": 500,
    "tickets_sold": 0,
    "created_at": "2026-02-07T10:00:00Z"
  }
}
```

**Note:** Creating a ticket type automatically updates the event's `total_tickets` count.

---

#### Update Ticket Type
```
PATCH /ticket-types/:id
```
**Authentication Required** (Must be event organizer)

Update ticket type details.

**Request Body:**
```json
{
  "type": "Premium VIP",
  "price": 120.00
}
```

**Response:** `200 OK`

---

#### Delete Ticket Type
```
DELETE /ticket-types/:id
```
**Authentication Required** (Must be event organizer)

Delete a ticket type.

**Response:** `200 OK`

---

#### Recount Tickets Sold
```
PUT /ticket-types/:id/recount
```
**Authentication Required** (Must be event organizer)

Recalculate the number of tickets sold for a ticket type.

**Response:** `200 OK`

---

#### Sync All Ticket Types
```
POST /ticket-types/sync-all
```
**Authentication Required**

Synchronize ticket counts across all ticket types and events. This endpoint recounts all `tickets_sold` from actual ticket records and updates both ticket types and events accordingly.

**Use case:** Fix data inconsistencies or refresh counts after manual database changes.

**Response:** `200 OK`
```json
{
  "message": "All ticket counts synchronized successfully!",
  "success": true,
  "ticket_types_updated": [
    {
      "id": 1,
      "type": "VIP",
      "tickets_sold": 450,
      "total_tickets": 500
    }
  ]
}
```

---

#### Debug Ticket Type
```
GET /ticket-types/debug/:event_id
```
Get debug information for ticket types of an event.

**Response:** `200 OK`

---

### Transactions

#### Get All Transactions
```
GET /transactions
```
**Authentication Required**

Get a list of all transactions.

**Response:** `200 OK`
```json
[
  {
    "id": 10,
    "buyer_id": 3,
    "buyer_name": "John Doe",
    "total_price": 150.00,
    "status": "completed",
    "payment_method": "credit_card",
    "reference_code": "TXN-20260201-ABC123",
    "created_at": "2026-02-01T14:30:00Z",
    "total_tickets": 3
  }
]
```

---

#### Get Transactions by User
```
GET /transactions/user/:id
```
**Authentication Required**

Get all transactions for a specific user.

**Response:** `200 OK`

---

#### Get Transaction by ID
```
GET /transactions/:id
```
**Authentication Required**

Get details of a specific transaction.

**Response:** `200 OK`
```json
{
  "id": 10,
  "user_id": 3,
  "buyer_name": "John Doe",
  "total_price": 150.00,
  "status": "completed",
  "payment_method": "credit_card",
  "reference_code": "TXN-20260201-ABC123",
  "created_at": "2026-02-01T14:30:00Z",
  "tickets": [
    {
      "ticket_id": 45,
      "event_name": "Summer Music Festival",
      "ticket_type": "General Admission",
      "price": 50.00
    }
  ]
}
```

---

#### Create Transaction
```
POST /transactions
```
**Authentication Required**

Create a new transaction.

**Request Body:**
```json
{
  "user_id": 3,
  "total_price": 150.00,
  "status": "completed",
  "payment_method": "card",
  "reference_code": "TXN-20260207-XYZ789"
}
```

**Note:** Most fields are optional. `status` defaults to `completed`, `payment_method` defaults to `card`.

**Response:** `201 Created`
```json
{
  "message": "Transaction successfully added!",
  "transaction": {
    "id": 50,
    "user_id": 3,
    "total_price": 150.00,
    "status": "completed",
    "payment_method": "card",
    "reference_code": "TXN-20260207-XYZ789",
    "created_at": "2026-02-07T10:00:00Z"
  }
}
```

---

#### Delete Transaction
```
DELETE /transactions/:id
```
**Authentication Required**

Delete a transaction.

**Response:** `200 OK`

---

### Waitlist

#### Get All Waitlist Entries
```
GET /waitlist
```
**Authentication Required**

Get all waitlist entries.

**Query Parameters:**
- `event_id` (integer): Filter by specific event
- `user_id` (integer): Filter by specific user

**Response:** `200 OK`
```json
{
  "message": "All waitlist entries retrieved successfully",
  "total_entries": 25,
  "waitlist": [
    {
      "id": 1,
      "user_id": 5,
      "user_name": "Alice Johnson",
      "event_id": 1,
      "event_name": "Summer Music Festival",
      "ticket_type_id": 2,
      "ticket_type": "General Admission",
      "position": 1,
      "status": "waiting",
      "joined_at": "2026-02-05T10:00:00Z"
    }
  ]
}
```

---

#### Get Waitlist for Event
```
GET /waitlist/event/:event_id
```
**Authentication Required**

Get all waitlist entries for a specific event.

**Response:** `200 OK`

---

#### Get User's Waitlist Entries
```
GET /waitlist/user/:user_id
```
**Authentication Required**

Get all waitlist entries for a specific user.

**Response:** `200 OK`

---

#### Join Waitlist
```
POST /waitlist
```
**Authentication Required**

Join the waitlist for a sold-out event.

**Request Body:**
```json
{
  "user_id": 5,
  "event_id": 1
}
```

**Note:** 
- Only works for sold-out events
- Cannot join waitlist for past events
- User cannot be on the same event's waitlist twice
- If a ticket is available from someone returning it, you'll be offered it immediately instead of joining the waitlist

**Response:** `201 Created`

**Scenario 1: Joined waitlist successfully**
```json
{
  "message": "User successfully added to waitlist!",
  "entry": {
    "id": 1,
    "user_id": 5,
    "event_id": 1,
    "joined_at": "2026-02-05T10:00:00Z"
  },
  "position": 15
}
```

**Scenario 2: Ticket offered immediately (someone returning)**
```json
{
  "message": "A ticket is available! You have been offered a returned ticket. Please accept or decline it.",
  "ticket_offered": true,
  "transaction_id": 45
}
```

---

#### Leave Waitlist (by ID)
```
DELETE /waitlist/:id
```
**Authentication Required**

Remove yourself from a waitlist entry by ID.

**Response:** `200 OK`

---

#### Leave Waitlist (by Event and User)
```
DELETE /waitlist/event/:event_id/user/:user_id
```
**Authentication Required**

Remove yourself from a waitlist for a specific event.

**Response:** `200 OK`

---

#### Accept Offered Ticket
```
POST /waitlist/accept-ticket/:transaction_id
```
**Authentication Required**

Accept a ticket that was offered from the waitlist.

**No request body required.**

**Important:**
- You have 30 minutes to accept after being offered the ticket
- After 30 minutes, the reservation expires and goes to the next person
- Previous ticket owner receives 98% refund (2% platform fee)

**Response:** `200 OK`
```json
{
  "message": "Ticket accepted successfully! Previous owner will receive a refund of €49.00 (2% platform fee applied).",
  "ticket": {
    "id": 123,
    "status": "active"
  },
  "refunded_ticket_id": 122,
  "refund_amount": 49.00,
  "platform_fee": "1.00"
}
```

**Error Response:** `410 Gone` (if reservation expired)
```json
{
  "message": "This reservation has expired (30 minutes limit). The ticket has been offered to the next person in the waitlist."
}
```

---

#### Decline Offered Ticket
```
POST /waitlist/decline-ticket/:transaction_id
```
**Authentication Required**

Decline a ticket that was offered from the waitlist.

**No request body required.**

**Response:** `200 OK`
```json
{
  "message": "Reservation declined.",
  "assigned_to_next": true
}
```

**Note:** You'll be removed from the waitlist after declining. You can rejoin manually if you change your mind.

---

## Error Responses

The API uses standard HTTP status codes to indicate the success or failure of requests.

### Status Codes

- `200 OK` - Request successful
- `201 Created` - Resource created successfully
- `400 Bad Request` - Invalid request parameters or body
- `401 Unauthorized` - Authentication required or invalid token
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `409 Conflict` - Conflict with existing resource
- `500 Internal Server Error` - Server error

### Error Response Format

```json
{
  "message": "Error description",
  "error": "Detailed error information (in development mode)"
}
```

### Common Error Examples

#### 400 Bad Request
```json
{
  "message": "Validation error: Email is required"
}
```

#### 401 Unauthorized
```json
{
  "message": "No token provided"
}
```

#### 403 Forbidden
```json
{
  "message": "You do not have permission to perform this action"
}
```

#### 404 Not Found
```json
{
  "message": "Event with ID 999 not found"
}
```

---

## Data Models

### User
```json
{
  "id": 1,
  "first_name": "John",
  "last_name": "Doe",
  "email": "john.doe@example.com",
  "role": "user",
  "created_at": "2026-01-15T10:30:00Z"
}
```

**Roles:** `user`, `organizer`, `admin`

---

### Event
```json
{
  "id": 1,
  "title": "Summer Music Festival",
  "description": "Annual summer music festival",
  "start_datetime": "2026-07-15T18:00:00Z",
  "end_datetime": "2026-07-15T23:00:00Z",
  "location": "Central Park, New York",
  "total_tickets": 5000,
  "tickets_sold": 3200,
  "organizer_id": 5,
  "organizer_name": "Jane Smith",
  "created_at": "2026-01-10T12:00:00Z"
}
```

---

### Ticket
```json
{
  "id": 1,
  "user_id": 3,
  "buyer_name": "John Doe",
  "event_id": 1,
  "event_name": "Summer Music Festival",
  "ticket_type_id": 2,
  "ticket_type": "General Admission",
  "ticket_price": 50.00,
  "transaction_id": 10,
  "status": "active",
  "issued_at": "2026-02-01T14:30:00Z"
}
```

**Ticket Status:** `active`, `refunded`, `reserved`, `cancelled`

---

### Ticket Type
```json
{
  "id": 1,
  "event_id": 1,
  "type": "VIP",
  "price": 100.00,
  "total_tickets": 500,
  "tickets_sold": 450,
  "created_at": "2026-01-10T12:00:00Z"
}
```

---

### Transaction
```json
{
  "id": 10,
  "user_id": 3,
  "buyer_name": "John Doe",
  "total_price": 150.00,
  "status": "completed",
  "payment_method": "credit_card",
  "reference_code": "TXN-20260201-ABC123",
  "created_at": "2026-02-01T14:30:00Z"
}
```

**Transaction Status:** `pending`, `completed`, `refunded`, `expired`, `cancelled`

**Payment Methods:** `credit_card`, `debit_card`, `paypal`, `cash`

---

### Waitlist Entry
```json
{
  "id": 1,
  "user_id": 5,
  "user_name": "Alice Johnson",
  "event_id": 1,
  "event_name": "Summer Music Festival",
  "ticket_type_id": 2,
  "ticket_type": "General Admission",
  "position": 1,
  "status": "waiting",
  "joined_at": "2026-02-05T10:00:00Z",
  "offered_at": null,
  "reservation_expires_at": null
}
```

**Waitlist Status:** `waiting`, `offered`, `expired`

---

## Additional Notes

### Pagination

List endpoints support pagination using `page` and `limit` query parameters:
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 12)

### Date/Time Format

All date and time values use ISO 8601 format:
```
2026-07-15T18:00:00Z
```

### Validation

- Email addresses must be valid format
- Passwords must be at least 8 characters
- Required fields are validated on all endpoints
- Numeric IDs must be positive integers

### Security

- Passwords are hashed using bcrypt
- JWT tokens expire after 24 hours
- Refresh tokens expire after 7 days
- All sensitive routes require authentication
- SQL injection protection via parameterized queries
- XSS protection via input sanitization

---

## Support

For questions or issues, please contact the development team or refer to the Swagger documentation at `/api-docs`.

1. **Register or Login** to get a token
2. **Click "Authorize"** in Swagger UI
3. **Enter**: `Bearer <your-token-here>`
4. All subsequent requests will include the token

### Example Workflow

1. Register a new user: `POST /users/register`
2. Copy the returned token
3. Click "Authorize" and paste the token
4. Create an event: `POST /events` (requires organizer role)
5. Browse events: `GET /events`
6. Purchase tickets: `POST /tickets`

### Development

To add documentation to new endpoints, use JSDoc comments:

```javascript
/**
 * @swagger
 * /your-endpoint:
 *   get:
 *     summary: Short description
 *     tags: [TagName]
 *     parameters:
 *       - in: query
 *         name: paramName
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success response
 */
router.get("/your-endpoint", async (req, res) => {
  // Your code
});
```

### Schema Definitions

All data models are defined in `backend/swagger.js`:
- User
- Event
- Ticket
- TicketType
- Transaction
- Waitlist

### Notes

- The documentation is automatically generated from JSDoc comments
- Swagger UI is accessible only when the backend server is running
- Authentication tokens expire after a set time (check token settings)

## Useful Links

- **Swagger UI**: http://localhost:5000/api-docs
- **API Base URL**: http://localhost:5000
- **Swagger Specification**: https://swagger.io/specification/
