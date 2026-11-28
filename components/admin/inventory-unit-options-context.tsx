'use client';
import {createContext,useMemo,type ReactNode} from 'react';
import type {InventoryModel} from '@/lib/inventory/model';
import {slotSchedule} from '@/lib/inventory/operations';
export const InventoryUnitOptionsContext=createContext<{model:Pick<InventoryModel,'items'|'records'|'version'>;schedule:ReturnType<typeof slotSchedule>}|null>(null);
export function InventoryUnitOptionsProvider({model,children}:{model:Pick<InventoryModel,'items'|'records'|'version'>;children:ReactNode}){
 const schedule=useMemo(()=>slotSchedule(model.records),[model.records]);
 const value=useMemo(()=>({model,schedule}),[model.items,model.records,model.version,schedule]);
 return <InventoryUnitOptionsContext.Provider value={value}>{children}</InventoryUnitOptionsContext.Provider>;
}
