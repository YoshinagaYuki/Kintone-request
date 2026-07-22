import { createClient } from "@/lib/supabase/server";
import {
  RentalPlanManager,
  type RentalPlanRow,
} from "@/components/admin/rental-plan-manager";

export const dynamic = "force-dynamic";

/** レンタルプランマスター管理(CRUD)。middleware により認証必須 */
export default async function PlansPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("rental_plans")
    .select("id, name, description, sort_order, is_active")
    .order("sort_order", { ascending: true });

  const plans = (data ?? []) as RentalPlanRow[];

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <h1 className="text-xl font-bold sm:text-2xl">レンタルプランマスター</h1>
      <RentalPlanManager plans={plans} />
    </main>
  );
}
