import { sql } from '@vercel/postgres'

const a = sql`status = 'submitted'`
const b = sql`x = 1`
const j = sql`${a} AND ${b}`
console.log('a', a, typeof a)
console.log('j', j, typeof j)
