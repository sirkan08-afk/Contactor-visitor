import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://sirkan08-afk.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
function bounds(day: string) {
  const start = new Date(day + "T00:00:00+07:00");
  return { start: start.toISOString(), end: new Date(start.getTime() + 86400000).toISOString() };
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    if ((req.headers.get("origin") || "") !== "https://sirkan08-afk.github.io") return new Response("Forbidden", { status: 403 });
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const origin = req.headers.get("origin") || "";
  if (origin && origin !== "https://sirkan08-afk.github.io") return json({ error: "Origin not allowed" }, 403);
  const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json({ error: "Server configuration incomplete" }, 503);
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Authentication required" }, 401);
  const auth = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await auth.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Invalid or expired session" }, 401);
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: role, error: roleError } = await admin.from("user_roles").select("role").eq("user_id", authData.user.id).maybeSingle();
  if (roleError) return json({ error: "Unable to verify staff permission" }, 403);
  if (!role || !["ADMIN", "SECURITY"].includes(String(role.role).toUpperCase())) return json({ error: "Security supervisor/staff permission required" }, 403);
  let body: { action?: string; date?: string; id?: string; status?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const day = String(body.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return json({ error: "Date must be YYYY-MM-DD" }, 400);
  const { start, end } = bounds(day);
  if (body.action === "list") {
    const { data, error } = await admin.from("line_security_messages")
      .select("id,message_text,line_timestamp,created_at,category,destination,status,reviewed_at,reviewed_by")
      .gte("line_timestamp", start).lt("line_timestamp", end)
      .in("destination", ["security_logbook", "manual_review"])
      .order("line_timestamp", { ascending: true }).limit(2000);
    if (error) return json({ error: "Unable to load LINE inbox: " + error.message }, 502);
    const messages = data || [];
    return json({ messages, counts: {
      total: messages.length,
      pending: messages.filter(x => x.status === "review_required").length,
      approved: messages.filter(x => x.status === "approved").length,
      rejected: messages.filter(x => x.status === "rejected").length,
    }});
  }
  if (body.action === "review") {
    if (!body.id || !["approved", "rejected"].includes(String(body.status))) return json({ error: "Invalid review request" }, 400);
    const { data, error } = await admin.from("line_security_messages").update({
      status: body.status, reviewed_at: new Date().toISOString(), reviewed_by: authData.user.id,
    }).eq("id", body.id).eq("status", "review_required")
      .in("destination", ["security_logbook", "manual_review"])
      .select("id,status").maybeSingle();
    if (error) return json({ error: "Unable to save review decision: " + error.message }, 502);
    if (!data) return json({ error: "Record not found or already reviewed" }, 409);
    return json({ ok: true, record: data });
  }
  return json({ error: "Unsupported action" }, 400);
});
