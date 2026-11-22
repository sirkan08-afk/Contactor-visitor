import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const headers={"Access-Control-Allow-Origin":"https://sirkan08-afk.github.io","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...headers,"Content-Type":"application/json; charset=utf-8"}});
Deno.serve(async req=>{
 if(req.method==="OPTIONS"){if((req.headers.get("origin")||"")!=="https://sirkan08-afk.github.io")return new Response("Forbidden",{status:403});return new Response("ok",{headers})}
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 const origin=req.headers.get("origin")||"";if(origin&&origin!=="https://sirkan08-afk.github.io")return json({error:"Origin not allowed"},403);
 const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!url||!anon||!service)return json({error:"Server configuration incomplete"},503);
 const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");if(!token)return json({error:"Authentication required"},401);
 const auth=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});const {data:userData,error:authError}=await auth.auth.getUser(token);if(authError||!userData.user)return json({error:"Invalid or expired session"},401);
 const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:profile,error:profileError}=await admin.from("patrol_profiles").select("id,role,employee_code").eq("id",userData.user.id).maybeSingle();if(profileError||!profile)return json({error:"ไม่พบโปรไฟล์เจ้าหน้าที่ใน patrol_profiles กรุณาตรวจสอบบัญชี Security Patrol"},403);
 let body:{action?:string;date?:string};try{body=await req.json()}catch{return json({error:"Invalid JSON"},400)}
 const day=String(body.date||"");if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return json({error:"Date must be YYYY-MM-DD"},400);
 const start=new Date(day+"T00:00:00+07:00"),end=new Date(start.getTime()+86400000);
 if(body.action!=="list")return json({error:"Unsupported action"},400);
 const {data,error}=await admin.from("line_security_messages").select("id,message_text,line_timestamp,created_at,category,destination,status,classification_reason").gte("line_timestamp",start.toISOString()).lt("line_timestamp",end.toISOString()).in("destination",["security_logbook","manual_review"]).order("line_timestamp",{ascending:true}).limit(3000);
 if(error)return json({error:"Unable to load LINE Logbook: "+error.message},502);
 return json({messages:data||[],date:day,timezone:"Asia/Bangkok"});
});