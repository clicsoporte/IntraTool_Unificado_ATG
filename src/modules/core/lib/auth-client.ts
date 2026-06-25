/**
 * @fileoverview This file contains client-side functions for interacting with server-side authentication logic.
 * This abstraction layer prevents direct DB access from the client and ensures that server-side
 * functions are called correctly. It's safe to use these functions in "use client" components.
 */
'use client';

import type { User } from '@/modules/core/types';
import { 
    getAllUsers as getAllUsersServer, 
    login as loginServer, 
    saveAllUsers as saveAllUsersServer, 
    updateUser as updateUserServer,
    deleteUser as deleteUserServer,
    comparePasswords as comparePasswordsServer, 
    addUser as addUserServer, 
    logout as logoutServer,
    getInitialAuthData as getInitialAuthDataServer,
    sendPasswordRecoveryEmail as sendRecoveryEmailServer,
    getCurrentUser as getCurrentUserServer,
    getUserPreferenceAction,
    saveUserPreferenceAction,
    updateOwnProfile as updateOwnProfileServer,
    completeForcedPasswordChange as completeForcedPasswordChangeServer,
} from '@/modules/core/lib/auth';

/**
 * Logs in a user by calling the server-side login function which sets a session cookie.
 * @param {string} email - The user's email.
 * @param {string} password - The password provided by the user.
 * @returns {Promise<{ user: User | null, forcePasswordChange: boolean }>} A promise that resolves to the login result.
 */
export async function login(email: string, password: string): Promise<{ user: User | null, forcePasswordChange: boolean }> {
    return await loginServer(email, password);
}

/**
 * Logs out the current user by invalidating the session cookie on the server.
 */
export async function logout() {
    await logoutServer();
}

/**
 * Retrieves the currently logged-in user from the server by leveraging the server-side cookie.
 * This is now a simple pass-through to the server action.
 * @returns {Promise<User | null>} A promise that resolves to the user object, or null if no user is logged in.
 */
export async function getCurrentUser(): Promise<User | null> {
    // This now calls the server-side function which handles cookie validation.
    return await getCurrentUserServer();
}

/**
 * Retrieves all users from the server.
 * This is a client-side wrapper for the server-side function.
 * @returns {Promise<User[]>} A promise that resolves to an array of all users.
 */
export async function getAllUsers(): Promise<User[]> {
    return getAllUsersServer();
}

/**
 * Adds a new user via a server action.
 * @param userData - The new user's data.
 * @returns The created user object.
 */
export async function addUser(userData: Omit<User, 'id' | 'avatar' | 'recentActivity' | 'securityQuestion' | 'securityAnswer'> & { password: string, forcePasswordChange: boolean }): Promise<User> {
    return addUserServer(userData);
}

/**
 * Saves or updates a single user's data via the server.
 * @param {User} user - The user object with updated data.
 * @returns {Promise<User>} The updated user object.
 */
export async function updateUser(user: User): Promise<User> {
    return await updateUserServer(user);
}

/**
 * Deletes a single user via the server.
 * @param {number} userId - The ID of the user to delete.
 */
export async function deleteUser(userId: number): Promise<void> {
    return await deleteUserServer(userId);
}


/**
 * Saves the entire list of users to the database via the server.
 * This is a client-side wrapper for the server-side function.
 * @param {User[]} users - The full array of users to save.
 * @returns {Promise<void>} A promise that resolves when the users are saved.
 */
export async function saveAllUsers(users: User[]): Promise<void> {
    return saveAllUsersServer(users);
}

/**
 * Securely compares a plaintext password with a user's stored bcrypt hash.
 * This is a client-side wrapper for the server-side password comparison.
 * @param {number} userId - The ID of the user whose password hash should be retrieved.
 * @param {string} password - The plaintext password to check.
 * @returns {Promise<boolean>} True if the password matches the hash.
 */
export async function comparePasswords(userId: number, password: string): Promise<boolean> {
    return await comparePasswordsServer(userId, password);
}

/**
 * Fetches all the initial data required for the application's authentication context.
 * This function acts as a wrapper around a server action to keep the data fetching logic
 * on the server while being callable from the client.
 */
export async function getInitialAuthData() {
    return await getInitialAuthDataServer();
}

/**
 * Triggers the password recovery email process.
 * @param email - The email of the user requesting recovery.
 */
export async function sendRecoveryEmail(email: string): Promise<void> {
    return await sendRecoveryEmailServer(email);
}

export async function getUserPreference(userId: number, key: string): Promise<any | null> {
    return await getUserPreferenceAction(userId, key);
}

export async function saveUserPreference(userId: number, key: string, value: any): Promise<void> {
    await saveUserPreferenceAction(userId, key, value);
}

/**
 * Cliente-safe wrapper para actualizar el perfil propio.
 */
export async function updateOwnProfile(userData: Partial<User>): Promise<{ success: boolean; error?: string }> {
    return await updateOwnProfileServer(userData);
}

/**
 * Cliente-safe wrapper para completar el cambio forzado de contraseña.
 */
export async function completeForcedPasswordChange(newPassword: string): Promise<{ success: boolean; error?: string }> {
    return await completeForcedPasswordChangeServer(newPassword);
}

