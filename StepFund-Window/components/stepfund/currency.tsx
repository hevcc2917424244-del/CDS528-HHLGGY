"use client";
import { createContext, useContext } from "react";
export const CurrencyContext = createContext("tUSD");
export function CurrencyUnit() { return <>{useContext(CurrencyContext)}</>; }
