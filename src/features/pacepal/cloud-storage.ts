import type { SupabaseClient } from "@supabase/supabase-js";

import { appStateSchema, type AppState } from "@/features/pacepal/model";

const tableName = "pacepal_states";

export async function loadCloudState(
  client: SupabaseClient,
  userId: string,
): Promise<AppState | null> {
  const { data, error } = await client
    .from(tableName)
    .select("state")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const parsed = appStateSchema.safeParse(data.state);
  if (!parsed.success) throw new Error("Cloud state is invalid.");
  return parsed.data;
}

export async function saveCloudState(
  client: SupabaseClient,
  userId: string,
  state: AppState,
) {
  const parsed = appStateSchema.parse(state);
  const { error } = await client.from(tableName).upsert(
    {
      state: parsed,
      updated_at: new Date().toISOString(),
      user_id: userId,
    },
    { onConflict: "user_id" },
  );

  if (error) throw error;
}
