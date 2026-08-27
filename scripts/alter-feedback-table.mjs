import { config } from "dotenv";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
const sql = neon(process.env.DATABASE_URL);

await sql`ALTER TABLE feedback ADD COLUMN IF NOT EXISTS usefulness_rating integer`;
await sql`ALTER TABLE feedback ADD COLUMN IF NOT EXISTS realism_rating integer`;
await sql`ALTER TABLE feedback DROP COLUMN IF EXISTS rating`;

console.log("feedback table updated: usefulness_rating, realism_rating.");
