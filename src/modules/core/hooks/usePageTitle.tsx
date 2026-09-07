
/**
 * @fileoverview This file defines a custom hook and provider for managing the page title.
 * This allows any child component to set the title that is displayed in the main Header component,
 * creating a centralized and reusable way to manage the page's heading.
 */
'use client';

import React, { createContext, useState, useContext, ReactNode, FC } from "react";
import { usePathname } from "next/navigation";

/**
 * Defines the shape of the context's value.
 */
interface PageTitleContextType {
  title: string;
  setTitle: (title: string) => void;
}

/**
 * Creates the context with a default value.
 * This context will be used to share the title state between the layout and the pages.
 */
const PageTitleContext = createContext<PageTitleContextType | undefined>(undefined);

/**
 * Props for the PageTitleProvider component.
 */
interface PageTitleProviderProps {
  children: ReactNode;
  initialTitle: string;
}

/**
 * The provider component that wraps parts of the application needing access to the page title state.
 * It initializes the state and provides the context value to its children.
 * @param {PageTitleProviderProps} props - The component props.
 * @returns {JSX.Element} The provider component.
 */
export const PageTitleProvider: FC<PageTitleProviderProps> = ({ children, initialTitle }) => {
  const [title, setTitle] = useState(initialTitle);
  const pathname = usePathname();
  const [prevPathname, setPrevPathname] = useState(pathname);

  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setTitle(initialTitle);
  }

  return (
    <PageTitleContext.Provider value={{ title, setTitle }}>
      {children}
    </PageTitleContext.Provider>
  );
};

/**
 * A custom hook that provides a simple way to access the page title context.
 * It throws an error if used outside of a PageTitleProvider to ensure proper usage.
 * @returns {PageTitleContextType} The context value including the current title and the function to set it.
 */
export const usePageTitle = (): PageTitleContextType => {
    const context = useContext(PageTitleContext);
    if (context === undefined) {
        throw new Error("usePageTitle must be used within a PageTitleProvider");
    }
    return context;
};
