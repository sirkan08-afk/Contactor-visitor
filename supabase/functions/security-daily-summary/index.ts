import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://sirkan08-afk.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });

function bangkokDayBounds(day: string) {
  // Thailand has no daylight-saving time: UTC+07:00 year-round.
  return {
    start: new Date(`${day}T00:00:00+07:00`).toISOString(),
    end: new Date(new Date(`${day}T00:00:00+07:00`).getTime() + 86400000).toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    const origin = req.headers.get("origin") || "";
    if (origin !== "https://sirkan08-afk.github.io") return new Response("Forbidden", { status: 403 });
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const origin = req.headers.get("origin") || "";
  if (origin && origin !== "https://sirkan08-afk.github.io") return json({ error: "Origin not allowed" }, 403);

  const sharedUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const contractorUrl = Deno.env.get("CONTRACTOR_SUPABASE_URL");
  const contractorServiceKey = Deno.env.get("CONTRACTOR_SUPABASE_SERVICE_ROLE_KEY");
  if (!sharedUrl || !anonKey || !serviceKey || !contractorUrl || !contractorServiceKey) {
    return json({ error: "Server configuration incomplete", code: "CONFIG_MISSING" }, 503);
  }

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Authentication required" }, 401);

  const authClient = createClient(sharedUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Invalid or expired session" }, 401);

  const admin = createClient(sharedUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: roleRow, error: roleError } = await admin
    .from("user_roles").select("role").eq("user_id", authData.user.id).maybeSingle();
  if (roleError) return json({ error: "Unable to verify staff permission" }, 403);
  if (!roleRow || !["ADMIN", "SECURITY"].includes(String(roleRow.role).toUpperCase())) {
    return json({ error: "Security staff permission required" }, 403);
  }

  let body: { date?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const day = String(body.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return json({ error: "Date must be YYYY-MM-DD" }, 400);
  const { start, end } = bangkokDayBounds(day);

  const contractorHeaders = {
    apikey: contractorServiceKey,
    Authorization: `Bearer ${contractorServiceKey}`,
  };
  const contractorQuery = new URLSearchParams({
    select: "id,full_name,company_name,department,work_location,car_plate,team_size,time_in,time_out",
    work_date: `eq.${day}`,
    limit: "5000",
  });
  const contractorResponse = await fetch(
    `${contractorUrl.replace(/\/$/, "")}/rest/v1/contractor_entries?${contractorQuery}`,
    { headers: contractorHeaders },
  );
  if (!contractorResponse.ok) {
    return json({ error: "Contractor data unavailable", code: "CONTRACTOR_QUERY_FAILED" }, 502);
  }
  const contractorRows = await contractorResponse.json();
  const contractor = {
    entries: contractorRows.length,
    teamMembers: contractorRows.reduce((sum: number, row: { team_size?: number | string }) => sum + (Number(row.team_size) || 0), 0),
    checkedOut: contractorRows.filter((row: { time_out?: string | null }) => Boolean(row.time_out)).length,
    stillOnSite: contractorRows.filter((row: { time_out?: string | null }) => !row.time_out).length,
    entriesList: contractorRows.map((row: Record<string, unknown>) => ({ fullName: row.full_name || "", companyName: row.company_name || "", department: row.department || "", workLocation: row.work_location || "", carPlate: row.car_plate || "", teamSize: Number(row.team_size) || 0, timeIn: row.time_in || null, timeOut: row.time_out || null })),
  };

  const [permitResult, pointResult, logResult] = await Promise.all([
    admin.from("work_permits").select("id,permit_no,work_title,status,created_at").gte("created_at", start).lt("created_at", end).limit(5000),
    admin.from("patrol_points").select("id").eq("active", true),
    admin.from("patrol_logs").select("id,point_id,status,round_time,created_at,notes,patrol_points(point_code,area_name,point_name),patrol_profiles(full_name,employee_code)").gte("created_at", start).lt("created_at", end).order("round_time",{ascending:true}).order("created_at",{ascending:true}).limit(10000),
  ]);
  if (permitResult.error || pointResult.error || logResult.error) {
    return json({ error: "Security database query failed", code: "SECURITY_QUERY_FAILED" }, 502);
  }

  const permits = permitResult.data || [];
  const statusCounts: Record<string, number> = {};
  for (const permit of permits) {
    const status = String(permit.status || "unknown");
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  }

  const logs = logResult.data || [];
  const patrolRounds = [...new Set(logs.map((row) => row.round_time).filter(Boolean))].sort();
  const patrol = {
    activePoints: (pointResult.data || []).length,
    recordedChecks: logs.length,
    normal: logs.filter((row) => row.status === "normal").length,
    abnormal: logs.filter((row) => row.status === "abnormal").length,
    inaccessible: logs.filter((row) => row.status === "inaccessible").length,
    roundsRecorded: patrolRounds,
    rounds: patrolRounds.map((round) => {
      const roundLogs = logs.filter((row) => row.round_time === round);
      return {
        roundTime: round,
        normal: roundLogs.filter((row) => row.status === "normal").length,
        abnormal: roundLogs.filter((row) => row.status === "abnormal").length,
        inaccessible: roundLogs.filter((row) => row.status === "inaccessible").length,
        entries: roundLogs.map((row) => ({
          pointCode: row.patrol_points?.point_code || "",
          areaName: row.patrol_points?.area_name || "",
          pointName: row.patrol_points?.point_name || "",
          status: row.status,
          notes: row.notes || "",
          reporterName: row.patrol_profiles?.full_name || "",
          reporterId: row.patrol_profiles?.employee_code || "",
          recordedAt: row.created_at,
        })),
      };
    }),
  };

  return json({
    date: day,
    timezone: "Asia/Bangkok",
    generatedAt: new Date().toISOString(),
    generatedFor: { userId: authData.user.id, role: roleRow.role },
    contractor,
    workPermit: { total: permits.length, statuses: statusCounts, entries: permits.map((row) => ({ permitNo: row.permit_no || "", workTitle: row.work_title || "", status: row.status || "unknown" })) },
    patrol,
    notes: [
      "Contractor totals are based on work_date.",
      "Work Permit totals are based on created_at in Asia/Bangkok.",
      "Patrol recorded checks count saved logs; pending checkpoints are not inferred without applying the day's patrol schedule.",
    ],
  });
});
