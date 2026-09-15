import pg from 'pg';
import { config } from './config.js';
export const db=new pg.Pool({connectionString:config.DATABASE_URL,max:10});
export type Evidence={id:string;revision:string;path:string;lineStart:number;lineEnd:number;kind:string;title:string;content:string;metadata:Record<string,unknown>};
