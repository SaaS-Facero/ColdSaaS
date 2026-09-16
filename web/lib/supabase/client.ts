"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

// TODO: remplacer les valeurs par défaut par un vrai projet Supabase
// (voir .env.example) avant tout déploiement — ces placeholders ne
// pointent vers rien et échoueront silencieusement en local sans .env.local.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://REPLACE_WITH_PROJECT.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "REPLACE_WITH_ANON_KEY";

export const supabase = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
