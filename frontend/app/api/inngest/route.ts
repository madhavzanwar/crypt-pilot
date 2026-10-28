import { serve } from "inngest/next";
import { inngest, backendPing, evidenceCouncil } from "@/lib/inngest";

export const { GET, POST, PUT } = serve({ client: inngest, functions: [backendPing, evidenceCouncil] });
