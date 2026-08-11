/**
 * REAL end-to-end test for the Microsoft Graph (OneDrive/SharePoint) Excel
 * connection. Three stages, each printed in plain language:
 *   1. verify the 3 MSGRAPH_* credentials by fetching an app-only token,
 *   2. locate a workbook and print its ready-to-paste `msgraph:` fileLocation,
 *   3. actually download + parse that workbook (proves read access).
 *
 * Reads MSGRAPH_* from .env or .env.docker automatically (tsx doesn't).
 *
 * Usage:
 *   npx tsx scripts/graph-connect.ts
 *       -> just check the credentials (health check)
 *   npx tsx scripts/graph-connect.ts someone@company.com
 *       -> list that user's OneDrive .xlsx files + their msgraph: paths
 *   npx tsx scripts/graph-connect.ts "https://contoso.sharepoint.com/.../Plan.xlsx"
 *       -> resolve a file's share/web link to its msgraph: path
 *   npx tsx scripts/graph-connect.ts "msgraph:/drives/<id>/items/<id>"
 *       -> download + parse that workbook end-to-end
 */
import fs from "node:fs";
import path from "node:path";

// Minimal .env loader (no dependency) so `npx tsx` sees the credentials.
function loadEnv(file: string) {
  const p = path.join(process.cwd(), file);
  if (!fs.existsSync(p)) return;
  for (const raw of fs.readFileSync(p, "utf8").split("\n")) {
    const m = raw.match(/^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2].replace(/^["']|["']$/g, "");
    if (val && !(key in process.env)) process.env[key] = val;
  }
}
loadEnv(".env");
loadEnv(".env.docker");

const GRAPH = "https://graph.microsoft.com/v1.0";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

async function fetchToken(): Promise<{ ok: boolean; token?: string; error?: string }> {
  const TENANT = process.env.MSGRAPH_TENANT_ID;
  const CLIENT_ID = process.env.MSGRAPH_CLIENT_ID;
  const CLIENT_SECRET = process.env.MSGRAPH_CLIENT_SECRET;
  if (!TENANT || !CLIENT_ID || !CLIENT_SECRET) {
    return { ok: false, error: "MSGRAPH_TENANT_ID / MSGRAPH_CLIENT_ID / MSGRAPH_CLIENT_SECRET tapılmadı (.env və ya .env.docker)." };
  }
  const res = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    let desc = body;
    try { desc = (JSON.parse(body) as Json).error_description ?? body; } catch { /* keep raw */ }
    return { ok: false, error: `${res.status} — ${String(desc).split("\n")[0]}` };
  }
  return { ok: true, token: (JSON.parse(body) as Json).access_token };
}

async function graphGet(token: string, urlOrPath: string): Promise<Json> {
  const url = urlOrPath.startsWith("http") ? urlOrPath : GRAPH + urlOrPath;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} — ${text.slice(0, 300)}`);
  return JSON.parse(text) as Json;
}

// Microsoft's share-link -> shareId encoding.
function shareId(url: string): string {
  const b64 = Buffer.from(url).toString("base64")
    .replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");
  return "u!" + b64;
}

async function main() {
  const arg = process.argv[2];

  console.log("① Kredensiallar yoxlanılır (token alınır)…");
  const tok = await fetchToken();
  if (!tok.ok) {
    console.log("   ❌ Alınmadı:", tok.error);
    console.log("   → 3 koddan biri səhvdir, ya da admin consent / Files.ReadWrite.All verilməyib.");
    process.exit(1);
  }
  console.log("   ✅ Token alındı — 3 Microsoft kodu düzgündür.\n");
  const token = tok.token!;

  if (!arg) {
    console.log("Növbəti addım — faylın ünvanını tap:");
    console.log('   npx tsx scripts/graph-connect.ts --users               (tenant istifadəçilərinə bax)');
    console.log('   npx tsx scripts/graph-connect.ts sən@şirkət.onmicrosoft.com');
    console.log('   npx tsx scripts/graph-connect.ts "https://...paylaşım-linki.../Plan.xlsx"');
    return;
  }

  // List the real users in the tenant (helps pick a valid, licensed account).
  if (arg === "--users") {
    console.log("② Tenant-dakı istifadəçilər sadalanır…");
    try {
      const data = await graphGet(token, "/users?$select=displayName,userPrincipalName,mail&$top=50");
      const users: Json[] = data.value ?? [];
      if (users.length === 0) {
        console.log("   ⚠️ Tenant-da heç bir istifadəçi yoxdur.");
        return;
      }
      console.log(`   ✅ ${users.length} istifadəçi tapıldı:\n`);
      for (const u of users) console.log(`   • ${u.displayName ?? "—"}  —  ${u.userPrincipalName}`);
      console.log("\n👉 M365 lisenziyası (OneDrive-ı) olan birini seç və email ilə yoxla:");
      console.log("   npx tsx scripts/graph-connect.ts <o-email>");
    } catch (e) {
      console.log("   ❌", e instanceof Error ? e.message : e);
      console.log("   → İstifadəçi siyahısı üçün 'User.Read.All' (və ya 'Directory.Read.All') application icazəsi + admin consent lazımdır.");
    }
    return;
  }

  // (3) Download + parse an already-known msgraph path.
  if (arg.startsWith("msgraph:")) {
    const itemPath = arg.slice("msgraph:".length);
    console.log(`② Fayl endirilir və oxunur: ${itemPath}`);
    const res = await fetch(`${GRAPH}${itemPath}/content`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      console.log("   ❌ Endirmə alınmadı:", res.status, (await res.text()).slice(0, 200));
      process.exit(1);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const { default: ExcelJS } = await import("exceljs");
    const { parseWorkbook } = await import("../src/lib/excel/read");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]);
    const model = parseWorkbook(wb);
    console.log(`   ✅ Fayl oxundu. Vərəqlər: ${model.sheets.map((s) => s.name).join(", ")}`);
    console.log(`   Tapılan tapşırıq sayı: ${model.tasks.length}`);
    model.tasks.slice(0, 6).forEach((t) =>
      console.log(`     • ${t.title} | ${t.assignee || "—"} | ${t.status || "—"} | bitmə: ${t.end ?? "—"}`),
    );
    console.log("\n   👉 Bu `msgraph:` yolunu tətbiqdə Onboarding → Excel addımında layihəyə yapışdır.");
    return;
  }

  // (2b) Resolve a share/web link to its msgraph path.
  if (arg.startsWith("http")) {
    console.log("② Paylaşım linki həll edilir…");
    const item = await graphGet(token, `/shares/${shareId(arg)}/driveItem?$select=id,name,parentReference`);
    const driveId = item.parentReference?.driveId;
    console.log(`   ✅ Tapıldı: ${item.name}`);
    console.log(`   👉 msgraph:/drives/${driveId}/items/${item.id}`);
    console.log(`\n   İndi oxuma testi: npx tsx scripts/graph-connect.ts "msgraph:/drives/${driveId}/items/${item.id}"`);
    return;
  }

  // (2a) Treat the arg as a user email -> list their OneDrive .xlsx files.
  const email = encodeURIComponent(arg);
  console.log(`② ${arg} adlı istifadəçinin OneDrive-ında .xlsx faylları axtarılır…`);
  let drive: Json;
  try {
    drive = await graphGet(token, `/users/${email}/drive?$select=id`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("User not found") || msg.startsWith("404")) {
      console.log(`   ❌ Bu email tenant-də tapılmadı: ${arg}`);
      console.log("   → Şəxsi Gmail/Outlook İŞLƏMİR — yalnız təşkilatının (M365) istifadəçisi olmalıdır.");
      console.log("   → Mövcud istifadəçilərə bax: npx tsx scripts/graph-connect.ts --users");
    } else if (msg.includes("mysite") || msg.includes("BadRequest") || msg.includes("400")) {
      console.log(`   ❌ ${arg} tenant-dədir, amma OneDrive yoxdur (M365 lisenziyası verilməyib).`);
      console.log("   → Bu istifadəçiyə M365 lisenziyası ver, ya da SharePoint sənəd kitabxanası işlət.");
    } else {
      console.log("   ❌", msg);
    }
    process.exit(1);
  }
  const driveId: string = drive.id;
  let items: Json[] = [];
  try {
    const search = await graphGet(token, `/users/${email}/drive/root/search(q='.xlsx')?$select=id,name`);
    items = (search.value ?? []).filter((x: Json) => String(x.name).toLowerCase().endsWith(".xlsx"));
  } catch {
    const kids = await graphGet(token, `/users/${email}/drive/root/children?$select=id,name`);
    items = (kids.value ?? []).filter((x: Json) => String(x.name).toLowerCase().endsWith(".xlsx"));
  }
  if (items.length === 0) {
    console.log("   ⚠️ .xlsx tapılmadı. Test faylını bu istifadəçinin OneDrive-ına yüklə və yenidən işlət.");
    return;
  }
  console.log(`   ✅ ${items.length} fayl tapıldı:\n`);
  for (const x of items) {
    console.log(`   ${x.name}`);
    console.log(`     → msgraph:/drives/${driveId}/items/${x.id}\n`);
  }
  console.log("👉 İstədiyin faylın yolunu götür, sonra oxuma testini işlət:");
  console.log(`   npx tsx scripts/graph-connect.ts "msgraph:/drives/${driveId}/items/<FAYL_ID>"`);
}

main().catch((e) => {
  console.error("Xəta:", e instanceof Error ? e.message : e);
  process.exit(1);
});
