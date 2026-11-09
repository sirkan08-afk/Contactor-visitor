// Supabase Edge Function: work-permit-public
// Public QR submission + private tracking lookup. Deploy with SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY configured as Edge Function secrets.
// Never expose the service-role key in browser code.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const sha256 = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
};
const clean = (v: unknown, max = 500) => String(v ?? "").trim().slice(0, max);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "Server is not configured" }, 500);
  const admin = createClient(url, key, { auth: { persistSession: false } });

  try {
    const body = await req.json();
    if (body.action === "track") {
      const permitNo = clean(body.permit_no, 60);
      const trackingCode = clean(body.tracking_code, 120);
      if (!permitNo || trackingCode.length < 20) return json({ error: "ข้อมูลติดตามไม่ถูกต้อง" }, 400);
      const tokenHash = await sha256(trackingCode);
      const { data, error } = await admin.from("work_permits")
        .select("permit_no,status,work_title,company_name,start_date,work_location")
        .eq("permit_no", permitNo).eq("tracking_token_hash", tokenHash).maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "ไม่พบคำขอ หรือรหัสติดตามไม่ถูกต้อง" }, 404);
      const { data: approvals, error: approvalError } = await admin.from("work_permit_department_approvals")
        .select("department,status,comment,acted_at").eq("permit_id", (
          await admin.from("work_permits").select("id").eq("permit_no", permitNo).single()
        ).data?.id);
      if (approvalError) throw approvalError;
      return json({ permit: data, approvals: approvals ?? [] });
    }

    if (body.action !== "submit") return json({ error: "Unknown action" }, 400);
    const applicant = clean(body.applicant_name, 160);
    const supervisor = clean(body.supervisor_name, 160);
    const company = clean(body.company_name, 180);
    const phone = clean(body.contact_phone, 40);
    const title = clean(body.work_title, 180);
    const location = clean(body.work_location, 180);
    const startDate = clean(body.start_date, 10);
    const teamSize = Number(body.team_size);
    if (!applicant || !supervisor || !company || !phone || !title || !location || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !Number.isInteger(teamSize) || teamSize < 1 || teamSize > 200) {
      return json({ error: "กรุณากรอกข้อมูลที่จำเป็นให้ครบและตรวจสอบจำนวนคน" }, 400);
    }

    const trackingCode = crypto.randomUUID() + crypto.randomUUID();
    const trackingHash = await sha256(trackingCode);
    const permitNo = "WP-" + new Date().toISOString().slice(0,10).replaceAll("-","") + "-" + crypto.randomUUID().slice(0,8).toUpperCase();
    const type = clean(body.work_type, 100);
    const departments = new Set<string>(["SECURITY"]);
    if (/ไฟฟ้า|เชื่อม|hot|ที่สูง|อับ|confined|electrical/i.test(type)) departments.add("SAFETY");
    if (/ซ่อม|ไฟฟ้า|เชื่อม|เครื่อง|maintenance|electrical/i.test(type)) departments.add("ENGINEERING");
    if (clean(body.department,100)) departments.add("AREA_OWNER");

    const { data: permit, error } = await admin.from("work_permits").insert({
      permit_no: permitNo,
      company_name: company,
      work_title: title,
      work_description: clean(body.work_description, 4000),
      department: clean(body.department, 100),
      work_location: location,
      start_date: startDate,
      end_date: clean(body.end_date,10) || null,
      start_time: clean(body.start_time,5) || null,
      end_time: clean(body.end_time,5) || null,
      team_size: teamSize,
      status: "submitted",
      created_by: null,
      contact_name: applicant,
      contact_phone: phone,
      applicant_name: applicant,
      supervisor_name: supervisor,
      work_type: type,
      tools: clean(body.tools, 2000),
      tracking_token_hash: trackingHash,
    }).select("id,permit_no").single();
    if (error) throw error;

    const approvalRows = [...departments].map((department) => ({ permit_id: permit.id, department, status: "pending" }));
    const { error: routeError } = await admin.from("work_permit_department_approvals").insert(approvalRows);
    if (routeError) throw routeError;

    return json({ success: true, permit_no: permit.permit_no, tracking_code: trackingCode, status: "submitted" }, 201);
  } catch (error) {
    console.error("work-permit-public:", error);
    return json({ error: "ไม่สามารถดำเนินการได้ กรุณาลองใหม่หรือติดต่อเจ้าหน้าที่" }, 500);
  }
});
