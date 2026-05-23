/**
 * @fileoverview Server-side authentication and user management functions.
 * These functions interact directly with the database to handle user data.
 * This file implements secure password handling using bcryptjs.
 * All functions in this file are server-only.
 */
"use server";

import { getDb, getAllRoles, getCompanySettings, getAllCustomers, getAllProducts, getAllStock, getAllExemptions, getExemptionLaws, getUnreadSuggestions, getDbModules, getStockSettings, getWarehouseData } from './db';
import { sendEmail, getEmailSettings as getEmailSettingsFromDb } from './email-service';
import type { User, ExchangeRateApiResponse, EmailSettings, Role } from '@/modules/core/types';
import bcrypt from 'bcryptjs';
import { logInfo, logWarn, logError } from './logger';
import { headers, cookies } from 'next/headers';
import { getExchangeRate, getEmailSettings } from './api-actions';
import { NewUserSchema, UserSchema } from './auth-schemas';
import { revalidatePath } from 'next/cache';
import { authorizeAction } from './auth-guard';

const SALT_ROUNDS = 10;
const SESSION_COOKIE_NAME = 'clic-tools-session';
const SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 hours in milliseconds

/**
 * Checks if a user has a specific permission.
 * Admins are always granted permission.
 * @param userId - The ID of the user to check.
 * @param permission - The permission string to validate.
 * @returns A promise that resolves to true if the user has permission, false otherwise.
 */
export async function hasPermission(userId: number, permission: string): Promise<boolean> {
    const db = await getDb();
    try {
        const userRoleInfo = db.prepare('SELECT role FROM core_users WHERE id = ?').get(userId) as { role: string } | undefined;

        if (!userRoleInfo) return false;
        if (userRoleInfo.role === 'admin') return true; // Admins have all permissions

        const role = db.prepare('SELECT permissions FROM core_roles WHERE id = ?').get(userRoleInfo.role) as { permissions: string } | undefined;
        if (!role) return false;

        const permissions: string[] = JSON.parse(role.permissions);
        
        // Strict check: The role's permissions array must explicitly include the required permission.
        return permissions.includes(permission);

    } catch (error: any) {
        await logError('Error in hasPermission check', { error: error.message, userId, permission });
        return false;
    }
}


/**
 * Attempts to log in a user with the given credentials.
 * It securely compares the provided password with the stored hash.
 * @param {string} email - The user's email.
 * @param {string} passwordProvided - The password provided by the user.
 * @returns {Promise<{ user: User | null, forcePasswordChange: boolean }>} The user object and a flag indicating if a password change is required.
 */
export async function login(email: string, passwordProvided: string): Promise<{ user: User | null, forcePasswordChange: boolean }> {
  const headerList = headers();
  const clientInfo = {
    ip: headerList.get("x-forwarded-for") || "N/A",
    host: headerList.get("host") || "N/A",
  };
  const db = await getDb();
  const logMeta = { email, ...clientInfo };
  try {
    const stmt = db.prepare('SELECT * FROM core_users WHERE email = ?');
    const user: User | undefined = stmt.get(email) as User | undefined;

    if (user && user.password) {
      if (user.employeeId) {
        const emp = db.prepare('SELECT ACTIVO FROM core_employees WHERE EMPLEADO = ?').get(user.employeeId) as { ACTIVO: string } | undefined;
        if (emp && emp.ACTIVO === 'N') {
          await logWarn(`Failed login attempt for email: ${email} - Linked employee is inactive.`, logMeta);
          return { user: null, forcePasswordChange: false };
        }
      }

      const isMatch = await bcrypt.compare(passwordProvided, user.password);
      if (isMatch) {
        const { password: _, ...userWithoutPassword } = user;
        const useSecureCookie = process.env.CLIC_TOOLS_COOKIE_SECURE === 'true';

        cookies().set(SESSION_COOKIE_NAME, String(user.id), {
            httpOnly: true,
            secure: useSecureCookie,
            maxAge: SESSION_DURATION / 1000,
            path: '/',
            sameSite: 'lax'
        });

        await logInfo(`User '${user.name}' logged in successfully.`, logMeta);
        return { user: userWithoutPassword as User, forcePasswordChange: !!user.forcePasswordChange };
      }
    }
    await logWarn(`Failed login attempt for email: ${email}`, logMeta);
    return { user: null, forcePasswordChange: false };
  } catch (error: any) {
    console.error("Login error:", error);
    await logError(`Login process failed for email: ${email}`, { error: error.message, ...logMeta});
    return { user: null, forcePasswordChange: false };
  }
}


export async function logout(): Promise<void> {
    const cookieStore = cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
    
    if (sessionCookie && sessionCookie.value) {
        const userId = Number(sessionCookie.value);
        const db = await getDb();
        const user = db.prepare('SELECT name FROM core_users WHERE id = ?').get(userId) as { name: string } | undefined;
        if (user) {
            await logInfo(`User '${user.name}' logged out.`, { userId });
        }
    }
    
    const useSecureCookie = process.env.CLIC_TOOLS_COOKIE_SECURE === 'true';
    
    cookieStore.set(SESSION_COOKIE_NAME, '', {
        httpOnly: true,
        secure: useSecureCookie,
        maxAge: 0,
        path: '/',
        sameSite: 'lax',
    });
}

/**
 * Retrieves all users from the database, intended for server-side use where passwords might be needed.
 * This is an internal function and should not be confused with the client-safe `getAllUsers`.
 * @returns {Promise<User[]>} A promise that resolves to an array of all users, including password hashes.
 */
async function getAllUsersWithPasswords(): Promise<User[]> {
    const db = await getDb();
    try {
        const stmt = db.prepare('SELECT * FROM core_users ORDER BY name');
        return stmt.all() as User[];
    } catch (error) {
        console.error("Failed to get all users:", error);
        return [];
    }
}

/**
 * Retrieves all users from the database for client-side consumption.
 * Passwords are removed before sending the data.
 * @returns {Promise<User[]>} A promise that resolves to an array of all users without passwords.
 */
export async function getAllUsers(): Promise<User[]> {
    await authorizeAction('users:read');
    const users = await getAllUsersWithPasswords();
    return users.map(u => {
        const { password: _, ...userWithoutPassword } = u;
        return userWithoutPassword;
    }) as User[];
}

/**
 * Retrieves all users from the database for reporting purposes.
 * Passwords are removed.
 * @returns {Promise<User[]>} A promise that resolves to an array of all users without passwords.
 */
export async function getAllUsersForReport(): Promise<User[]> {
    await authorizeAction('users:read');
    const db = await getDb();
    try {
        const stmt = db.prepare('SELECT * FROM core_users ORDER BY name');
        const users = stmt.all() as User[];
        return users.map(u => {
            const { password: _, ...userWithoutPassword } = u;
            return userWithoutPassword;
        }) as User[];
    } catch (error: any) {
        await logError("getAllUsersForReport", { error: error.message });
        return [];
    }
}

/**
 * Adds a new user to the database.
 * @param userData - The data for the new user, including a plaintext password.
 * @returns The newly created user object, without the password hash.
 */
export async function addUser(userData: Omit<User, 'id' | 'avatar' | 'recentActivity' | 'securityQuestion' | 'securityAnswer'> & { password: string, forcePasswordChange: boolean }): Promise<User> {
  await authorizeAction('users:create');
  const db = await getDb();
  const validationResult = NewUserSchema.safeParse(userData);
  if (!validationResult.success) {
      throw new Error(`Validation failed: ${validationResult.error.errors.map(e => e.message).join(', ')}`);
  }
  
  const hashedPassword = bcrypt.hashSync(validationResult.data.password, SALT_ROUNDS);
  const highestIdResult = db.prepare('SELECT MAX(id) as maxId FROM core_users').get() as { maxId: number | null };
  const nextId = (highestIdResult.maxId || 0) + 1;

  const userToCreate: User = {
    id: nextId,
    name: validationResult.data.name,
    email: validationResult.data.email,
    password: hashedPassword,
    role: validationResult.data.role,
    avatar: "",
    recentActivity: "Usuario recién creado.",
    phone: validationResult.data.phone || "",
    whatsapp: validationResult.data.whatsapp || "",
    erpAlias: validationResult.data.erpAlias || "",
    forcePasswordChange: validationResult.data.forcePasswordChange,
    employeeId: validationResult.data.employeeId || null,
  };
  
  const stmt = db.prepare(
    `INSERT INTO core_users (id, name, email, password, phone, whatsapp, erpAlias, avatar, role, recentActivity, securityQuestion, securityAnswer, forcePasswordChange, employeeId) 
     VALUES (@id, @name, @email, @password, @phone, @whatsapp, @erpAlias, @avatar, @role, @recentActivity, @securityQuestion, @securityAnswer, @forcePasswordChange, @employeeId)`
  );
  
  stmt.run({
    ...userToCreate,
    phone: userToCreate.phone || null,
    whatsapp: userToCreate.whatsapp || null,
    erpAlias: userToCreate.erpAlias || null,
    securityQuestion: userToCreate.securityQuestion || null,
    securityAnswer: userToCreate.securityAnswer || null,
    forcePasswordChange: userToCreate.forcePasswordChange ? 1 : 0,
    employeeId: userToCreate.employeeId || null,
  });

  const { password: _, ...userWithoutPassword } = userToCreate;
  await logInfo(`Admin added a new user: ${userToCreate.name}`, { role: userToCreate.role });
  revalidatePath('/dashboard/admin/users');
  return userWithoutPassword as User;
}

/**
 * Saves or updates a single user in the database.
 * This is the new, safer way to handle user modifications.
 * @param {User} user - The user object to save or update.
 * @returns {Promise<User>} The updated user object without password.
 */
export async function updateUser(user: User): Promise<User> {
    await authorizeAction('users:update');
    const db = await getDb();
    const validationResult = UserSchema.safeParse(user);
    if (!validationResult.success) {
        throw new Error(`Validation failed: ${validationResult.error.errors.map(e => e.message).join(', ')}`);
    }

    const validatedUser = validationResult.data;
    let passwordToSave = validatedUser.password;

    // Password handling logic
    if (passwordToSave) { // Only if a new password is provided
        if (!passwordToSave.startsWith('$2a$')) { // Check if it's not already hashed
            passwordToSave = bcrypt.hashSync(passwordToSave, SALT_ROUNDS);
        }
    } else {
        // If no password is provided, fetch the existing one to avoid erasing it.
        const existingUser = db.prepare('SELECT password FROM core_users WHERE id = ?').get(validatedUser.id) as { password?: string };
        passwordToSave = existingUser?.password;
    }

    const userToUpdate = {
        ...validatedUser,
        password: passwordToSave,
        phone: validatedUser.phone || null,
        whatsapp: validatedUser.whatsapp || null,
        erpAlias: validatedUser.erpAlias || null,
        securityQuestion: validatedUser.securityQuestion || null,
        securityAnswer: validatedUser.securityAnswer || null,
        forcePasswordChange: validatedUser.forcePasswordChange ? 1 : 0,
        employeeId: validatedUser.employeeId || null,
    };
    
    db.prepare(`
        UPDATE core_users SET
            name = @name, email = @email, password = @password,
            phone = @phone, whatsapp = @whatsapp, erpAlias = @erpAlias,
            avatar = @avatar, role = @role, recentActivity = @recentActivity,
            securityQuestion = @securityQuestion, securityAnswer = @securityAnswer,
            forcePasswordChange = @forcePasswordChange, employeeId = @employeeId
        WHERE id = @id
    `).run(userToUpdate);
    
    const { password: _, ...userWithoutPassword } = userToUpdate;
    revalidatePath('/dashboard/admin/users');
    return userWithoutPassword as User;
}

/**
 * Deletes a user from the database.
 * @param {number} userId - The ID of the user to delete.
 */
export async function deleteUser(userId: number): Promise<void> {
    await authorizeAction('users:delete');
    const db = await getDb();
    if (userId === 1) {
        throw new Error("No se puede eliminar al usuario administrador principal.");
    }
    db.prepare('DELETE FROM core_users WHERE id = ?').run(userId);
    revalidatePath('/dashboard/admin/users');
}


/**
 * Saves the entire list of users to the database.
 * This is an "all-or-nothing" operation that replaces all existing users.
 * It handles password hashing for new or changed passwords.
 * @param {User[]} users - The full array of users to save.
 * @returns {Promise<void>}
 */
export async function saveAllUsers(users: User[]): Promise<void> {
   await authorizeAction('users:update');
   const db = await getDb();
   const upsert = db.prepare(`
    INSERT INTO core_users (id, name, email, password, phone, whatsapp, erpAlias, avatar, role, recentActivity, securityQuestion, securityAnswer, forcePasswordChange, employeeId) 
    VALUES (@id, @name, @email, @password, @phone, @whatsapp, @erpAlias, @avatar, @role, @recentActivity, @securityQuestion, @securityAnswer, @forcePasswordChange, @employeeId)
    ON CONFLICT(id) DO UPDATE SET
        name = excluded.name, email = excluded.email, password = excluded.password,
        phone = excluded.phone, whatsapp = excluded.whatsapp, erpAlias = excluded.erpAlias,
        avatar = excluded.avatar, role = excluded.role, recentActivity = excluded.recentActivity,
        securityQuestion = excluded.securityQuestion, securityAnswer = excluded.securityAnswer,
        forcePasswordChange = excluded.forcePasswordChange, employeeId = excluded.employeeId
   `);

    const transaction = db.transaction((usersToSave: User[]) => {
        const existingUsersMap = new Map<number, { pass: string | undefined; force: boolean | number | undefined }>(
            (db.prepare('SELECT id, password, forcePasswordChange FROM core_users').all() as User[]).map(u => [u.id, { pass: u.password, force: u.forcePasswordChange }])
        );

        for (const user of usersToSave) {
          const validationResult = UserSchema.safeParse(user);
          if (!validationResult.success) {
              logError(`Skipping user save due to validation error for user ID ${user.id}`, { errors: validationResult.error.flatten() });
              continue;
          }

          const validatedUser = validationResult.data;
          let passwordToSave = validatedUser.password;
          const existingUserData = existingUsersMap.get(validatedUser.id);
          
          if (passwordToSave && passwordToSave !== existingUserData?.pass) {
              if (!passwordToSave.startsWith('$2a$')) {
                  passwordToSave = bcrypt.hashSync(passwordToSave, SALT_ROUNDS);
              }
          } else {
             passwordToSave = existingUserData?.pass;
          }

          const userToInsert = {
            ...validatedUser, 
            password: passwordToSave,
            role: validatedUser.role.toLowerCase(),
            phone: validatedUser.phone || null, 
            whatsapp: validatedUser.whatsapp || null,
            erpAlias: validatedUser.erpAlias || null, 
            securityQuestion: validatedUser.securityQuestion || null,
            securityAnswer: validatedUser.securityAnswer || null,
            forcePasswordChange: validatedUser.forcePasswordChange ? 1 : 0,
            employeeId: validatedUser.employeeId || null,
          };
          upsert.run(userToInsert);
        }
    });

    try {
        transaction(users);
        await logInfo(`${users.length} user records were processed for saving.`);
        revalidatePath('/dashboard/admin/users');
    } catch (error) {
        await logError("Failed to save all users (saveAllUsers)", { error: (error as Error).message });
        throw new Error("Database transaction failed to save users.");
    }
}

/**
 * Securely compares a plaintext password with a user's stored bcrypt hash.
 * @param {number} userId - The ID of the user whose password should be checked.
 * @param {string} password - The plaintext password to check.
 * @returns {Promise<boolean>} True if the password matches the hash.
 */
export async function comparePasswords(userId: number, password: string): Promise<boolean> {
    const headerList = headers();
    const clientInfo = {
      ip: headerList.get("x-forwarded-for") || "N/A",
      host: headerList.get("host") || "N/A",
    };
    const db = await getDb();
    const user = db.prepare('SELECT password FROM core_users WHERE id = ?').get(userId) as User | undefined;
    if (!user || !user.password) return false;
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      await logWarn('Password comparison failed during settings update/recovery.', clientInfo);
    }
    return isMatch;
}

/**
 * Retrieves the currently authenticated user based on the session cookie.
 */
export async function getCurrentUser(): Promise<User | null> {
    const cookieStore = cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

    if (!sessionCookie || !sessionCookie.value) {
        return null;
    }

    const userId = Number(sessionCookie.value);
    if (isNaN(userId)) {
        return null;
    }

    try {
        const db = await getDb();
        const user = db.prepare('SELECT * FROM core_users WHERE id = ?').get(userId) as User | undefined;

        if (!user) {
            return null;
        }

        if (user.employeeId) {
            const emp = db.prepare('SELECT ACTIVO FROM core_employees WHERE EMPLEADO = ?').get(user.employeeId) as { ACTIVO: string } | undefined;
            if (emp && emp.ACTIVO === 'N') {
                await logWarn(`Deactivated employee session lockout for user ID: ${userId}, employee ID: ${user.employeeId}`);
                try {
                    const useSecureCookie = process.env.CLIC_TOOLS_COOKIE_SECURE === 'true';
                    cookieStore.set(SESSION_COOKIE_NAME, '', {
                        httpOnly: true,
                        secure: useSecureCookie,
                        maxAge: 0,
                        path: '/',
                        sameSite: 'lax',
                    });
                } catch (cookieError) {
                    // Next.js might throw an error if cookies are modified during page render
                }
                return null;
            }
        }

        const { password: _, ...userWithoutPassword } = user;
        return userWithoutPassword as User;

    } catch (error) {
        console.error("Error getting current user:", error);
        return null;
    }
}

/**
 * Fetches all the initial data required for the application's authentication context.
 */
export async function getInitialAuthData() {
  try {
      const db = await getDb();
      const dbModules = await getDbModules();
      for (const dbModule of dbModules) {
          await getDb(); // This just ensures connection is open, though getDb() is singleton anyway
      }
      
      const [
          roles, companySettings, customers, products, stock, exemptions,
          exemptionLaws, exchangeRate, unreadSuggestions, warehouseData
      ] = await Promise.all([
          getAllRoles(), getCompanySettings(), getAllCustomers(), getAllProducts(),
          getAllStock(), getAllExemptions(), getExemptionLaws(), getExchangeRate(),
          getUnreadSuggestions(), getWarehouseData()
      ]);
      
      const rateData: { rate: number | null; date: string | null } = { rate: null, date: null };
      const exchangeRateResponse = exchangeRate as ExchangeRateApiResponse;
      if (exchangeRateResponse?.venta?.valor) {
          rateData.rate = exchangeRateResponse.venta.valor;
          rateData.date = new Date(exchangeRateResponse.venta.fecha).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: '2-digit' });
      }

      return {
          roles, companySettings, customers, products, stock, exemptions,
          exemptionLaws, exchangeRate: rateData, unreadSuggestions,
          allLocations: warehouseData.locations, allInventory: warehouseData.inventory,
          allItemLocations: warehouseData.itemLocations, stockSettings: warehouseData.stockSettings,
      };
  } catch (error) {
      console.error("Critical error in getInitialAuthData:", error);
      // Re-throw the error to be caught by the AuthProvider
      throw new Error(`Failed to load initial application data: ${(error as Error).message}`);
  }
}


/**
 * Handles the password recovery process.
 */
export async function sendPasswordRecoveryEmail(email: string): Promise<void> {
    const headerList = headers();
    const clientInfo = {
      ip: headerList.get("x-forwarded-for") || "N/A",
      host: headerList.get("host") || "N/A",
    };
    const db = await getDb();
    const logMeta = { email, ...clientInfo };

    const user = db.prepare('SELECT * FROM core_users WHERE email = ?').get(email) as User | undefined;
    if (!user) {
        await logWarn('Password recovery requested for non-existent email.', logMeta);
        return;
    }

    const tempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(tempPassword, SALT_ROUNDS);

    db.prepare('UPDATE core_users SET password = ?, forcePasswordChange = 1 WHERE id = ?')
      .run(hashedPassword, user.id);

    try {
        const emailSettings = await getEmailSettingsFromDb();
        const companySettings = await getCompanySettings();
        if (!emailSettings.smtpHost) {
            throw new Error("La configuración de SMTP no está establecida. No se puede enviar el correo.");
        }
        
        let emailBody = (emailSettings.recoveryEmailBody || '')
            .replace('[NOMBRE_USUARIO]', user.name)
            .replace('[CLAVE_TEMPORAL]', tempPassword);
            
        if (companySettings?.publicUrl) {
            emailBody += `<p style="margin-top: 20px; font-size: 12px; color: #7f8c8d;">Accede al sistema en: <a href="${companySettings.publicUrl}">${companySettings.publicUrl}</a></p>`;
        }
            
        await sendEmail({
            to: user.email,
            subject: emailSettings.recoveryEmailSubject || 'Recuperación de Contraseña',
            html: emailBody
        });

        await logInfo(`Password recovery email sent successfully to ${user.name}.`, logMeta);
    } catch (error: any) {
        await logError('Failed to send password recovery email.', { ...logMeta, error: error.message });
        throw new Error("No se pudo enviar el correo de recuperación. Revisa la configuración de SMTP.");
    }
}
