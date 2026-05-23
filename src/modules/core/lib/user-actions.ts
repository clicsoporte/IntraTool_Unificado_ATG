/**
 * @fileoverview Server Actions related to user management, like creation.
 * Separated from auth.ts to avoid circular dependencies and keep logic clean.
 */
"use server";

import { getDb, getUserCount } from "@/modules/core/lib/db";
import type { User } from "@/modules/core/types";
import bcrypt from 'bcryptjs';
import { logInfo, logError } from '@/modules/core/lib/logger';
import { headers } from "next/headers";

const SALT_ROUNDS = 10;

/**
 * Creates the very first user in the system, assigning them the 'admin' role.
 * This function includes a check to ensure it only runs if no other users exist.
 * @param userData - The data for the new admin user.
 * @throws {Error} If a user already exists in the database.
 */
export async function createFirstUser(
  userData: Omit<User, 'id' | 'role' | 'avatar' | 'recentActivity' | 'securityQuestion' | 'securityAnswer' | 'forcePasswordChange'> & { password: string }
): Promise<void> {
  const headerList = headers();
  const clientInfo = {
    ip: headerList.get("x-forwarded-for") || "N/A",
    host: headerList.get("host") || "N/A",
  };
  const userCount = await getUserCount();
  if (userCount > 0) {
    await logError("Attempted to create first user when users already exist.", clientInfo);
    throw new Error("La configuración inicial ya fue completada. No se puede crear otro usuario administrador de esta forma.");
  }

  // Connect to the database. It will be created if it doesn't exist.
  const db = await getDb();
  
  const hashedPassword = bcrypt.hashSync(userData.password, SALT_ROUNDS);

  const userToCreate: User = {
    id: 1, // First user always gets ID 1
    name: userData.name,
    email: userData.email,
    password: hashedPassword,
    role: "admin", // Assign admin role
    avatar: "",
    recentActivity: "Primer usuario administrador creado.",
    phone: userData.phone,
    whatsapp: userData.whatsapp,
    forcePasswordChange: false,
  };
  
  const stmt = db.prepare(
    `INSERT INTO core_users (id, name, email, password, phone, whatsapp, avatar, role, recentActivity, forcePasswordChange) 
     VALUES (@id, @name, @email, @password, @phone, @whatsapp, @avatar, @role, @recentActivity, @forcePasswordChange)`
  );
  
  try {
    stmt.run({
        ...userToCreate,
        phone: userToCreate.phone || null,
        whatsapp: userToCreate.whatsapp || null,
        forcePasswordChange: 0,
    });
    await logInfo(`Initial admin user '${userToCreate.name}' created successfully.`, clientInfo);
  } catch (error: any) {
    await logError("Error in createFirstUser: Database error during user creation", { error: error.message, ...clientInfo });
    throw new Error("Hubo un error al guardar el usuario en la base de datos.");
  }
}
