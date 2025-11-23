import { Pool, types } from "pg"; // "types" importieren
import { config } from "./config";

types.setTypeParser(1700, (val) => parseFloat(val));
types.setTypeParser(20, (val) => parseInt(val, 10));


export const pool = new Pool({
  connectionString: config.databaseUrl
});

// kleine Helper
export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}