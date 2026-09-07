import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

const sql = neon(process.env.DATABASE_URL);

await sql`
  CREATE TABLE IF NOT EXISTS ideal_answer_audio (
    station_id text PRIMARY KEY,
    pq_number integer NOT NULL,
    text_hash text NOT NULL,
    mime_type text NOT NULL DEFAULT 'audio/mpeg',
    data text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )
`;

console.log("ideal_answer_audio table ready.");
