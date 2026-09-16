import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Point de retour pour linkIdentity('google') (et tout futur flow OAuth).
// Échange le code contre une session, marque le compte converti, puis
// renvoie vers /quiz?secured=1 pour reprendre exactement où le quiz en était
// (les réponses sont déjà en base, attachées au même user id).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      await supabase.from("profiles").update({ converted: true }).eq("id", data.user.id);
      return NextResponse.redirect(`${origin}/quiz?secured=google`);
    }
  }

  return NextResponse.redirect(`${origin}/quiz?secured=failed`);
}
