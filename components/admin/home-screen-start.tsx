'use client';
import {useEffect,useRef} from 'react';
import {usePathname,useRouter} from 'next/navigation';
import {legacyHomeRedirect} from '@/lib/home-screen';
/** Compatibility for installed icons whose manifest still starts at requests. */
export function HomeScreenStart({preferred}:{preferred:string}){
 const checked=useRef(false),path=usePathname(),router=useRouter();
 useEffect(()=>{
  if(checked.current||path==='/admin/login')return;checked.current=true;
  const standalone=window.matchMedia('(display-mode: standalone)').matches||(navigator as Navigator&{standalone?:boolean}).standalone===true;
  const target=legacyHomeRedirect({standalone,path,search:window.location.search,preferred});
  if(target)router.replace(target);
 },[path,preferred,router]);
 return null;
}
