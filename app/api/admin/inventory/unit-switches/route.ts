import {NextResponse} from 'next/server';
import {inventoryAccess} from '@/lib/inventory/access';
export async function POST(){const access=await inventoryAccess();if('error'in access)return NextResponse.json({error:access.error},{status:access.status});return NextResponse.json({error:'機器交換の機能は終了しました。画面を再読み込みし、機器番号から変更してください。'},{status:410});}
