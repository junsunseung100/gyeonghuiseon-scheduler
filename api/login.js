// Vercel 서버 함수: PIN을 서버에서 검사하고, 맞으면 공용 계정으로 로그인해 세션을 돌려준다.
// 비밀번호·PIN은 서버 환경변수에만 있고 클라이언트 번들에는 없다. 가입(signup)은 막아둔 상태로 동작.
export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method' }); return }
  let body = req.body
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = {} } }
  const pin = (body && body.pin) || ''

  const APP_PIN = process.env.APP_PIN || ''
  if (!APP_PIN || String(pin) !== String(APP_PIN)) {
    res.status(401).json({ error: 'pin' }); return
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const email = process.env.CLINIC_EMAIL
  const password = process.env.CLINIC_PASSWORD
  if (!url || !key || !email || !password) {
    res.status(500).json({ error: 'server_config' }); return
  }

  try {
    const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await r.json()
    if (!r.ok || !data.access_token) { res.status(500).json({ error: 'login_failed' }); return }
    res.status(200).json({ access_token: data.access_token, refresh_token: data.refresh_token })
  } catch {
    res.status(500).json({ error: 'fetch_failed' })
  }
}
