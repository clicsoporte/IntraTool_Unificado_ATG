/**
 * @fileoverview This file defines a central authentication context and hook.
 * It provides a single source of truth for the current user, their role, companyData,
 * and loading status, preventing redundant data fetching and component re-renders.
 */
'use client';

import React, { createContext, useState, useContext, ReactNode, FC, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { User, Role, Company, Product, StockInfo, Customer, Exemption, ExemptionLaw, Notification, WarehouseLocation, WarehouseInventoryItem, ItemLocation, Warehouse } from "../types";
import { getCurrentUser as getCurrentUserClient, getInitialAuthData, logout as clientLogout } from '../lib/auth-client';
import { getUnreadSuggestionsCount as getUnreadSuggestionsCountAction } from "@/modules/core/lib/suggestions-actions";
import { getExchangeRate } from "../lib/api-actions";
import { getNotificationsForUser } from "../lib/notifications-actions";

export const REDIRECT_URL_KEY = 'redirectUrl';

const safeInternalPath = (value: string | null): string | null => {
  if (!value) return null;
  return value.startsWith("/") ? value : null;
};

/**
 * Defines the shape of the authentication context's value.
 */
interface AuthContextType {
  user: User | null;
  userRole: Role | null;
  companyData: Company | null;
  customers: Customer[];
  products: Product[];
  stockLevels: StockInfo[];
  allExemptions: Exemption[];
  exemptionLaws: ExemptionLaw[];
  allLocations: WarehouseLocation[];
  allInventory: WarehouseInventoryItem[];
  allItemLocations: ItemLocation[];
  stockSettings: { warehouses: Warehouse[] } | null;
  isAuthReady: boolean; // Flag to signal when ALL auth-related data is loaded
  exchangeRateData: {
      rate: number | null;
      date: string | null;
  };
  unreadSuggestionsCount: number;
  notifications: Notification[];
  unreadNotificationsCount: number;
  fetchUnreadNotifications: () => Promise<void>;
  refreshAuth: (userFromLogin?: User) => Promise<User | null>;
  redirectAfterLogin: (path?: string) => void;
  logout: () => void;
  refreshExchangeRate: () => Promise<void>;
  setCompanyData: (data: Company) => void;
  updateUnreadSuggestionsCount: () => Promise<void>;
  hasPermission: (permission: string | string[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * The provider component that wraps the authenticated parts of the application.
 * It handles the initial loading of all authentication-related data.
 * @param {object} props - The component props.
 * @param {ReactNode} props.children - The child components to render.
 */
export const AuthProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<Role | null>(null);
  const [companyData, setCompanyData] = useState<Company | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stockLevels, setStockLevels] = useState<StockInfo[]>([]);
  const [allExemptions, setAllExemptions] = useState<Exemption[]>([]);
  const [exemptionLaws, setExemptionLaws] = useState<ExemptionLaw[]>([]);
  const [allLocations, setAllLocations] = useState<WarehouseLocation[]>([]);
  const [allInventory, setAllInventory] = useState<WarehouseInventoryItem[]>([]);
  const [allItemLocations, setAllItemLocations] = useState<ItemLocation[]>([]);
  const [stockSettings, setStockSettings] = useState<{ warehouses: Warehouse[] } | null>(null);
  const [exchangeRateData, setExchangeRateData] = useState<{ rate: number | null; date: string | null }>({ rate: null, date: null });
  const [unreadSuggestionsCount, setUnreadSuggestionsCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [isAuthReady, setIsAuthReady] = useState(false); // This is the single source of truth for the initial auth load.

  const fetchExchangeRate = useCallback(async () => {
    try {
        const data = await getExchangeRate();
        if (data.venta?.valor) {
             setExchangeRateData({
                rate: data.venta.valor,
                date: new Date(data.venta.fecha).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: '2-digit' })
             });
        }
    } catch (error) {
        console.error("Failed to fetch exchange rate on refresh:", error);
    }
  }, []);

  const updateUnreadSuggestionsCount = useCallback(async () => {
    try {
        const count = await getUnreadSuggestionsCountAction();
        setUnreadSuggestionsCount(count);
    } catch (error) {
        console.error("Failed to update unread suggestions count:", error);
    }
  }, []);

  const fetchUnreadNotifications = useCallback(async () => {
    const currentUser = await getCurrentUserClient();
    if (!currentUser) return;
    try {
      const userNotifications = await getNotificationsForUser(currentUser.id);
      setNotifications(userNotifications);
      setUnreadNotificationsCount(userNotifications.filter(n => !n.isRead).length);
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
    }
  }, []);

  const hasPermission = useCallback((permission: string | string[]): boolean => {
    if (!userRole) return false;
    if (userRole.id === 'admin') return true;

    const userPermissions = userRole.permissions || [];
    
    const checkPermission = (p: string) => {
        return userPermissions.includes(p);
    };

    if (Array.isArray(permission)) {
        return permission.some(checkPermission);
    }

    return checkPermission(permission);
  }, [userRole]);

  const loadAuthData = useCallback(async (userFromLogin?: User): Promise<User | null> => {
    try {
      const currentUser = userFromLogin || await getCurrentUserClient();
      
      if (!currentUser) {
          setUser(null);
          setUserRole(null);
          setCompanyData(null);
          setCustomers([]);
          setProducts([]);
          setStockLevels([]);
          setAllExemptions([]);
          setExemptionLaws([]);
          setAllLocations([]);
          setAllInventory([]);
          setAllItemLocations([]);
          setStockSettings(null);
          setIsAuthReady(true);
          return null;
      }
      
      const data = await getInitialAuthData();
      
      setUser(currentUser);
      setCompanyData(data.companySettings);
      setCustomers(data.customers);
      setProducts(data.products);
      setStockLevels(data.stock);
      setAllExemptions(data.exemptions);
      setExemptionLaws(data.exemptionLaws);
      setAllLocations(data.allLocations);
      setAllInventory(data.allInventory);
      setAllItemLocations(data.allItemLocations);
      setStockSettings(data.stockSettings);
      setExchangeRateData(data.exchangeRate);
      
      const initialSuggestionsCount = await getUnreadSuggestionsCountAction();
      setUnreadSuggestionsCount(initialSuggestionsCount);
      
      const initialNotifications = await getNotificationsForUser(currentUser.id);
      setNotifications(initialNotifications);
      setUnreadNotificationsCount(initialNotifications.filter(n => !n.isRead).length);

      if (currentUser && data.roles.length > 0) {
        const role = data.roles.find((r: Role) => r.id === currentUser.role);
        setUserRole(role || null);
      } else {
        setUserRole(null);
      }
      
      setIsAuthReady(true);
      return currentUser;

    } catch (error) {
      console.error("Critical error in getInitialAuthData:", error);
      // Re-throw the error to be caught by the AuthProvider
      throw new Error(`Failed to load initial application data: ${(error as Error).message}`);
  }
  }, []);
  
  const redirectAfterLogin = useCallback((path?: string) => {
    const stored = safeInternalPath(sessionStorage.getItem(REDIRECT_URL_KEY));
    sessionStorage.removeItem(REDIRECT_URL_KEY);
    const destination = stored ?? path ?? "/dashboard";
    
    // Use window.location.href for a full page reload to ensure session is picked up.
    // This avoids issues with client-side router cache and iframe contexts.
    window.location.href = destination;
  }, []);

  const handleLogout = useCallback(async () => {
    await clientLogout();
    setUser(null);
    setUserRole(null);
    // Force a full page reload to the login page
    window.location.href = '/';
  }, []);

  useEffect(() => {
    loadAuthData().catch(err => {
      console.error("Failed to load authentication data on mount:", err);
      // Optionally set an error state here to display a global error message
    });
  }, [loadAuthData]);

  useEffect(() => {
    if (user && isAuthReady) {
      const interval = setInterval(() => {
        Promise.all([
            updateUnreadSuggestionsCount(),
            fetchUnreadNotifications()
        ]).catch(error => {
            console.warn("Periodic auth update failed, likely due to network interruption or page unload:", error);
        });
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [user, isAuthReady, updateUnreadSuggestionsCount, fetchUnreadNotifications]);

  const contextValue = useMemo<AuthContextType>(() => ({
    user, userRole, companyData, customers, products, stockLevels,
    allExemptions, exemptionLaws, allLocations, allInventory, allItemLocations,
    stockSettings, isAuthReady, exchangeRateData, unreadSuggestionsCount,
    notifications, unreadNotificationsCount, fetchUnreadNotifications,
    refreshAuth: loadAuthData, redirectAfterLogin, logout: handleLogout,
    refreshExchangeRate: fetchExchangeRate, setCompanyData,
    updateUnreadSuggestionsCount, hasPermission,
  }), [
    user, userRole, companyData, customers, products, stockLevels,
    allExemptions, exemptionLaws, allLocations, allInventory, allItemLocations,
    stockSettings, isAuthReady, exchangeRateData, unreadSuggestionsCount,
    notifications, unreadNotificationsCount, fetchUnreadNotifications,
    loadAuthData, redirectAfterLogin, handleLogout, fetchExchangeRate, setCompanyData,
    updateUnreadSuggestionsCount, hasPermission,
  ]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * A custom hook to easily access the central authentication context.
 */
export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
};
