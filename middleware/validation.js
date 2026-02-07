// Validation middleware and utilities
import validator from 'validator';

/* --------------------------------------
   ID Validation Middleware
-------------------------------------- */
export function validateId(paramName = 'id') {
  return (req, res, next) => {
    const id = parseInt(req.params[paramName]);
    if (isNaN(id) || id < 1 || id > 2147483647) {
      return res.status(400).json({ 
        message: `${paramName} must be a valid positive number` 
      });
    }
    req.params[paramName] = id;
    next();
  };
}

/* --------------------------------------
   Multiple ID Validation
-------------------------------------- */
export function validateIds(...paramNames) {
  return (req, res, next) => {
    for (const paramName of paramNames) {
      const id = parseInt(req.params[paramName]);
      if (isNaN(id) || id < 1 || id > 2147483647) {
        return res.status(400).json({ 
          message: `${paramName} must be a valid positive number` 
        });
      }
      req.params[paramName] = id;
    }
    next();
  };
}

/* --------------------------------------
   Email Validation
-------------------------------------- */
export function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return { valid: false, message: 'Email is required' };
  }

  if (email.length > 255) {
    return { valid: false, message: 'Email is too long (max 255 characters)' };
  }

  if (!validator.isEmail(email)) {
    return { valid: false, message: 'Invalid email format' };
  }

  return { valid: true };
}

/* --------------------------------------
   Password Validation
-------------------------------------- */
export function validatePassword(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, message: 'Password is required' };
  }

  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long' };
  }

  if (password.length > 128) {
    return { valid: false, message: 'Password is too long (max 128 characters)' };
  }

  // Check for uppercase, lowercase, number, and special character
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

  if (!hasUpperCase || !hasLowerCase || !hasNumber || !hasSpecialChar) {
    return { 
      valid: false, 
      message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character' 
    };
  }

  return { valid: true };
}

/* --------------------------------------
   String Length Validation
-------------------------------------- */
export function validateString(value, fieldName, minLength = 1, maxLength = 255) {
  if (!value || typeof value !== 'string') {
    return { valid: false, message: `${fieldName} is required` };
  }

  const trimmed = value.trim();
  
  if (trimmed.length < minLength) {
    return { valid: false, message: `${fieldName} must be at least ${minLength} character(s) long` };
  }

  if (trimmed.length > maxLength) {
    return { valid: false, message: `${fieldName} is too long (max ${maxLength} characters)` };
  }

  return { valid: true, value: trimmed };
}

/* --------------------------------------
   Numeric Range Validation
-------------------------------------- */
export function validateNumber(value, fieldName, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const num = Number(value);
  
  if (isNaN(num)) {
    return { valid: false, message: `${fieldName} must be a number` };
  }

  if (num < min) {
    return { valid: false, message: `${fieldName} must be at least ${min}` };
  }

  if (num > max) {
    return { valid: false, message: `${fieldName} cannot exceed ${max}` };
  }

  return { valid: true, value: num };
}

/* --------------------------------------
   Date Validation
-------------------------------------- */
export function validateDate(dateString, fieldName, options = {}) {
  const { 
    allowPast = false, 
    maxYearsInFuture = 10 
  } = options;

  if (!dateString) {
    return { valid: false, message: `${fieldName} is required` };
  }

  const date = new Date(dateString);
  
  if (isNaN(date.getTime())) {
    return { valid: false, message: `${fieldName} is not a valid date` };
  }

  const now = new Date();
  
  if (!allowPast && date < now) {
    return { valid: false, message: `${fieldName} cannot be in the past` };
  }

  const maxDate = new Date();
  maxDate.setFullYear(maxDate.getFullYear() + maxYearsInFuture);
  
  if (date > maxDate) {
    return { valid: false, message: `${fieldName} is too far in the future` };
  }

  return { valid: true, value: date };
}

/* --------------------------------------
   Date Range Validation
-------------------------------------- */
export function validateDateRange(startDate, endDate) {
  if (endDate <= startDate) {
    return { valid: false, message: 'End date must be after start date' };
  }

  return { valid: true };
}

/* --------------------------------------
   Sanitize HTML (XSS Prevention)
-------------------------------------- */
export function sanitizeHtml(text) {
  if (!text || typeof text !== 'string') return '';
  
  // Remove all HTML tags and dangerous characters
  return text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
}

/* --------------------------------------
   Sanitize Object (recursively sanitize all strings)
-------------------------------------- */
export function sanitizeObject(obj) {
  if (typeof obj === 'string') {
    return sanitizeHtml(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }
  
  if (obj && typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
  }
  
  return obj;
}

/* --------------------------------------
   Request Body Sanitization Middleware
-------------------------------------- */
export function sanitizeBody(req, res, next) {
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  next();
}
