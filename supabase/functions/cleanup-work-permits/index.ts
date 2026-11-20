import { createClient } from "npm:@supabase/supabase-js@2";

const RETENTION_DAYS = 7;
const BATCH_SIZE = 100;
const MAX_BATCHES_PER_RUN = 50;
const INSPECTION_BUCKET = "work-permit-inspections";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });

  const expectedSecret = Deno.env.get("CRON_SECRET");
  const suppliedSecret = req.headers.get("x-cron-secret");
  if (!expectedSecret || !suppliedSecret || suppliedSecret !== expectedSecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    ?? Deno.env.get("SUPABASE_SECRET_KEY")
    ?? secretKeys.default;
  if (!url || !serviceKey) {
    console.error("Missing Supabase server environment variables");
    return Response.json({ error: "Server configuration error" }, { status: 500 });
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  let deletedPermits = 0;
  let deletedChildren = 0;
  let deletedPhotos = 0;
  let deletedFiles = 0;

  try {
    for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
      const { data: permits, error: readError } = await admin
        .from("work_permits")
        .select("id, created_at")
        .lt("created_at", cutoff)
        .order("created_at", { ascending: true })
        .limit(BATCH_SIZE);
      if (readError) throw readError;
      if (!permits?.length) break;

      const ids = permits.map((p) => p.id);

      // Delete stored inspection images first so expired permits leave no orphan files.
      const { data: photos, error: photoReadError } = await admin
        .from("work_permit_inspection_photos")
        .select("id, storage_path")
        .in("permit_id", ids);
      if (photoReadError) throw photoReadError;
      const paths = (photos ?? []).map((p) => p.storage_path).filter((p): p is string => typeof p === "string" && p.length > 0);
      if (paths.length) {
        const { error: storageError } = await admin.storage.from(INSPECTION_BUCKET).remove(paths);
        if (storageError) throw new Error(`Remove inspection files failed: ${storageError.message}`);
        deletedFiles += paths.length;
      }

      // Explicit child cleanup also supports schemas without ON DELETE CASCADE.
      for (const table of ["work_permit_checklists", "work_permit_workers", "work_permit_department_approvals", "work_permit_inspection_photos"] as const) {
        const { data, error } = await admin.from(table).delete().in("permit_id", ids).select("id");
        if (error) throw new Error(`Delete ${table} failed: ${error.message}`);
        if (table === "work_permit_inspection_photos") deletedPhotos += data?.length ?? 0;
        else deletedChildren += data?.length ?? 0;
      }

      const { data: removed, error: deleteError } = await admin
        .from("work_permits").delete().in("id", ids).select("id");
      if (deleteError) throw deleteError;
      deletedPermits += removed?.length ?? 0;
    }

    return Response.json({
      success: true,
      cutoff,
      retention_days: RETENTION_DAYS,
      deleted_work_permits: deletedPermits,
      deleted_related_records: deletedChildren,
      deleted_inspection_photo_records: deletedPhotos,
      deleted_inspection_files: deletedFiles,
    });
  } catch (error) {
    console.error("Work Permit retention cleanup failed:", error);
    return Response.json({
      success: false,
      deleted_work_permits: deletedPermits,
      deleted_related_records: deletedChildren,
      deleted_inspection_photo_records: deletedPhotos,
      deleted_inspection_files: deletedFiles,
      error: error instanceof Error ? error.message : "Unknown cleanup error",
    }, { status: 500 });
  }
});
