import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "contractor-private";
const TABLE = "contractor_entries";
const RETENTION_DAYS = 30;
const BATCH_SIZE = 100;
const MAX_BATCHES_PER_RUN = 50;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const expectedSecret = Deno.env.get("CRON_SECRET");
  const suppliedSecret = req.headers.get("x-cron-secret");
  if (!expectedSecret || !suppliedSecret || suppliedSecret !== expectedSecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing Supabase server environment variables");
    return Response.json({ error: "Server configuration error" }, { status: 500 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  let deletedRecords = 0;
  let deletedImages = 0;

  try {
    for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
      const { data: rows, error: readError } = await admin
        .from(TABLE)
        .select("id, created_at, id_card_path, car_image_path")
        .lt("created_at", cutoff)
        .order("created_at", { ascending: true })
        .limit(BATCH_SIZE);

      if (readError) throw readError;
      if (!rows || rows.length === 0) break;

      const paths = rows
        .flatMap((row) => [row.id_card_path, row.car_image_path])
        .filter((path): path is string => typeof path === "string" && path.length > 0);

      // Remove files first. If Storage fails, keep the database rows so the next
      // scheduled run can retry instead of leaving untracked image files.
      if (paths.length > 0) {
        const { error: storageError } = await admin.storage.from(BUCKET).remove(paths);
        if (storageError) throw storageError;
        deletedImages += paths.length;
      }

      const ids = rows.map((row) => row.id);
      const { error: deleteError } = await admin.from(TABLE).delete().in("id", ids);
      if (deleteError) throw deleteError;

      deletedRecords += rows.length;
    }

    return Response.json({
      success: true,
      cutoff,
      retention_days: RETENTION_DAYS,
      deleted_records: deletedRecords,
      deleted_image_files: deletedImages,
    });
  } catch (error) {
    console.error("Contractor retention cleanup failed:", error);
    return Response.json({
      success: false,
      deleted_records: deletedRecords,
      deleted_image_files: deletedImages,
      error: error instanceof Error ? error.message : "Unknown cleanup error",
    }, { status: 500 });
  }
});
