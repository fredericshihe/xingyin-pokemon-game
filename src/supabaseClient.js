import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export const sendSupabaseRpcKeepalive = (rpcName, args = {}) => {
  if (typeof fetch !== 'function' || !rpcName) return Promise.resolve(null)

  return fetch(`${supabaseUrl}/rest/v1/rpc/${encodeURIComponent(rpcName)}`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(args),
    keepalive: true
  })
}
