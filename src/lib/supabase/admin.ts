import "server-only";
import { createAdminClient } from "./create-admin-client";

export const supabaseAdmin = createAdminClient();
