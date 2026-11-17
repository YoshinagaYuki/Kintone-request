'use client';
import {createContext,useContext} from 'react';
import type {WarehouseClosure} from '@/lib/inventory/warehouse-calendar';
const Context=createContext<WarehouseClosure[]>([]);
export const useWarehouseClosures=()=>useContext(Context);
export function WarehouseCalendarProvider({closures,children}:{closures:WarehouseClosure[];children:React.ReactNode}){return <Context.Provider value={closures}>{children}</Context.Provider>;}
