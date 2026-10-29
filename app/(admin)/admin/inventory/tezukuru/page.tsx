import {InventoryPage}from'@/components/admin/inventory-page';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{start?:string;end?:string;period?:string;product?:string}>}){return InventoryPage({searchParams,business:'tezukuru'});}
