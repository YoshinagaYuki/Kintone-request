type CatalogItem={id:string;name:string;category:string;inventory_role?:string|null;is_active?:boolean};
/** Materials and shared accessories must not become physical rental selections. */
export function quickHoldCatalog<T extends CatalogItem>(items:T[]):T[]{return items.filter(i=>i.is_active!==false&&(i.category==='allmight'&&!i.inventory_role||i.category==='tezukuru'&&i.inventory_role==='rental_kit'));}
