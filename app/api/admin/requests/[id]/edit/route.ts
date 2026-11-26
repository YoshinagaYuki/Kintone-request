import {editPendingRequest} from '@/lib/requests/edit-pending';
import {withInventorySheetPush} from '@/lib/inventory/sheet-push';
export const PATCH=withInventorySheetPush((req:import('next/server').NextRequest,context:{params:Promise<{id:string}>})=>editPendingRequest(req,context));
