import { createServerSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

// PATCH — Update profile (first name, last name)
export async function PATCH(request: Request) {
  try {
    const supabase = createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { firstName, lastName } = await request.json();
    const fullName = [firstName, lastName].filter(Boolean).join(" ");

    await supabase.from("profiles").update({ full_name: fullName }).eq("id", user.id);
    await supabase.auth.updateUser({ data: { full_name: fullName } });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("Failed to update profile", { error: errMsg(err) });
    return NextResponse.json({ error: errMsg(err) }, { status: 500 });
  }
}

// PUT — Change password
export async function PUT(request: Request) {
  try {
    const supabase = createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { password } = await request.json();
    if (!password || password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("Failed to change password", { error: errMsg(err) });
    return NextResponse.json({ error: errMsg(err) }, { status: 500 });
  }
}
