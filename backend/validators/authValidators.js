/**
 * TossArena Authentication Validators
 * Strict validation and normalization for registration and login payloads.
 */

// Basic email regex conforming to standard RFC 5322 approximation
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * Normalizes email address consistently (lowercase and trimmed)
 * @param {string} email
 * @returns {string}
 */
function normalizeEmail(email) {
  if (typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

/**
 * Validates registration input
 * @param {object} body
 * @returns {{ isValid: boolean, errors: string[], sanitized: object }}
 */
function validateRegistration(body) {
  const errors = [];
  const { fullName, email, password, confirmPassword } = body || {};

  // 1. Full Name Validation
  const trimmedName = typeof fullName === 'string' ? fullName.trim() : '';
  if (!trimmedName) {
    errors.push('Full name is required.');
  } else if (trimmedName.length < 2) {
    errors.push('Full name must be at least 2 characters long.');
  } else if (trimmedName.length > 100) {
    errors.push('Full name cannot exceed 100 characters.');
  } else if (/<[^>]*>/g.test(trimmedName)) {
    errors.push('Full name cannot contain HTML or script markup.');
  }

  // 2. Email Validation
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    errors.push('Email address is required.');
  } else if (normalizedEmail.length > 150) {
    errors.push('Email address cannot exceed 150 characters.');
  } else if (!EMAIL_REGEX.test(normalizedEmail)) {
    errors.push('Please provide a valid email address.');
  }

  // 3. Password Validation
  if (!password || typeof password !== 'string') {
    errors.push('Password is required.');
  } else {
    if (password.length < 12) {
      errors.push('Password must be at least 12 characters in length.');
    }
    if (password.length > 128) {
      errors.push('Password cannot exceed 128 characters.');
    }
  }

  // 4. Confirm Password Validation
  if (confirmPassword !== undefined && password !== confirmPassword) {
    errors.push('Passwords do not match.');
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized: {
      fullName: trimmedName,
      email: normalizedEmail,
      password: typeof password === 'string' ? password : ''
    }
  };
}

/**
 * Validates login input
 * @param {object} body
 * @returns {{ isValid: boolean, errors: string[], sanitized: object }}
 */
function validateLogin(body) {
  const errors = [];
  const { email, password } = body || {};

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    errors.push('Email address is required.');
  } else if (!EMAIL_REGEX.test(normalizedEmail)) {
    errors.push('Please provide a valid email address.');
  }

  if (!password || typeof password !== 'string') {
    errors.push('Password is required.');
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized: {
      email: normalizedEmail,
      password: typeof password === 'string' ? password : ''
    }
  };
}

module.exports = {
  normalizeEmail,
  validateRegistration,
  validateLogin
};
