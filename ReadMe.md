# EventGO Backend

Backend API server for the EventGO event management platform, built with Node.js, Express, and PostgreSQL.

## Overview

EventGO Backend provides a RESTful API for managing events, tickets, users, and transactions. It supports role-based access control with separate interfaces for regular users and event organizers.

### Key Capabilities

- **User Management**: Registration, authentication, profile management
- **Event Management**: Create, update, and manage events
- **Ticket System**: Multiple ticket types, purchases, and refunds
- **Waitlist System**: Automatic ticket offering when events sell out
- **Analytics**: Event statistics and revenue tracking

---

## Features

### For Users
- Browse and search events
- Purchase tickets 
- Join waitlist for sold-out events
- Manage tickets
- View transaction history

### For Organizers
- Create and manage events
- Define multiple ticket types with different pricing
- View event analytics and revenue reports
- Issue refunds to attendees
- Monitor ticket sales in real-time

---

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL
- **Authentication**: JWT (JSON Web Tokens)
- **Documentation**: Swagger
- **Password Hashing**: bcrypt
- **HTTP Client**: Axios

---

## Related Projects

- **Frontend**: [EventGO-frontend](https://github.com/mpokorn/EventGo-frontend) 
- **Mobile App**: [EventGO-mobile-app](https://github.com/mpokorn/EventGo-mobile-app) 

---