/**
 * @fileoverview Centralized Zod schemas for user and authentication data validation.
 * This ensures consistent validation rules across the application.
 */

import { z } from 'zod';

// Preprocess for is_active to handle text columns/values from database gracefully
const preprocessIsActive = z.preprocess(
  (val) => {
    if (val === null || val === undefined) return undefined;
    if (typeof val === 'string') {
      const parsed = parseInt(val, 10);
      return isNaN(parsed) ? undefined : parsed;
    }
    if (typeof val === 'boolean') {
      return val ? 1 : 0;
    }
    return val;
  },
  z.number().int().optional()
);

// Base schema for a User, matching the database structure.
// This is used for validating existing user data, e.g., when updating.
export const UserSchema = z.object({
  id: z.number().int(),
  name: z.string().min(2, { message: "El nombre es requerido." }),
  email: z.string().email({ message: "El formato del correo no es válido." }),
  password: z.string().optional(), // Password is not always present, especially when sending data to client
  phone: z.string().optional().nullable(),
  whatsapp: z.string().optional().nullable(),
  avatar: z.string().optional().nullable(),
  role: z.string(),
  erpAlias: z.string().optional().nullable(),
  recentActivity: z.string().optional().nullable(),
  securityQuestion: z.string().optional().nullable(),
  securityAnswer: z.string().optional().nullable(),
  forcePasswordChange: z.union([z.boolean(), z.number()]).optional(),
  employeeId: z.string().optional().nullable(),
  salespersonId: z.string().optional().nullable(),
  is_active: preprocessIsActive,
});


// Schema specifically for creating a new user.
// It requires a password and has stricter validation.
export const NewUserSchema = z.object({
    name: z.string().min(2, { message: "El nombre es requerido." }),
    email: z.string().email({ message: "El formato del correo no es válido." }),
    password: z.string().min(6, { message: "La contraseña debe tener al menos 6 caracteres." }),
    role: z.string(),
    phone: z.string().optional(),
    whatsapp: z.string().optional(),
    erpAlias: z.string().optional(),
    forcePasswordChange: z.boolean(),
    employeeId: z.string().optional().nullable(),
    salespersonId: z.string().optional().nullable(),
    is_active: preprocessIsActive,
});

