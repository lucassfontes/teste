import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT_RAW = Deno.env.get('VAPID_SUBJECT') || 'admin@example.com'
const VAPID_SUBJECT = VAPID_SUBJECT_RAW.startsWith('mailto:') || VAPID_SUBJECT_RAW.startsWith('https://')
  ? VAPID_SUBJECT_RAW
  : `mailto:${VAPID_SUBJECT_RAW}`
const CRON_SECRET = Deno.env.get('CRON_SECRET') || ''

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

function isoToday(timeZone = 'Europe/Brussels') {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
function money(value: unknown) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0))
}
function balance(v: any) {
  const total = Number(v.total ?? v.valorComTaxa ?? v.valor ?? 0)
  const partial = Number(v.parcialRecebido ?? v.valorPago ?? 0)
  return Math.max(0, total - partial)
}

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } })
  }

  const today = isoToday()
  const { data: workspaces, error: workspaceError } = await supabase.from('session_workspaces').select('session_user_id,data')
  if (workspaceError) throw workspaceError

  let sent = 0, skipped = 0, removed = 0, errors = 0
  for (const workspace of workspaces || []) {
    const vales = Array.isArray(workspace.data?.vales) ? workspace.data.vales : []
    const due = vales.filter((v: any) => String(v.status || '').toUpperCase() !== 'PAGO' && String(v.dataFinal || '').slice(0, 10) === today)
    if (!due.length) continue

    const { data: subscriptions, error } = await supabase.from('push_subscriptions').select('*').eq('session_user_id', workspace.session_user_id).eq('enabled', true)
    if (error) { errors++; continue }

    for (const sub of subscriptions || []) {
      for (const vale of due) {
        const valeId = String(vale.id ?? vale.numero ?? `${vale.cliente}-${vale.dataFinal}`)
        const dueDate = String(vale.dataFinal).slice(0, 10)
        const { error: logError } = await supabase.from('push_delivery_log').insert({
          subscription_id: sub.id, vale_id: valeId, due_date: dueDate, notification_date: today, kind: 'DUE_TODAY'
        })
        if (logError) { skipped++; continue }

        const title = 'VALLE — vence hoje'
        const payload = JSON.stringify({
          title,
          body: `${vale.cliente || 'Cliente'} • ${money(balance(vale))} • vencimento ${dueDate.split('-').reverse().join('/')}`,
          tag: `vale-${valeId}-${dueDate}`,
          url: `./index.html?screen=notificacoes&vale=${encodeURIComponent(valeId)}#notificacoes`,
          data: { valeId, dueDate }
        })
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 86400, urgency: 'high' })
          sent++
        } catch (e: any) {
          errors++
          if (e?.statusCode === 404 || e?.statusCode === 410) {
            await supabase.from('push_subscriptions').update({ enabled: false, updated_at: new Date().toISOString() }).eq('id', sub.id)
            removed++
          } else {
            await supabase.from('push_delivery_log').delete().eq('subscription_id', sub.id).eq('vale_id', valeId).eq('due_date', dueDate).eq('notification_date', today)
          }
        }
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, date: today, sent, skipped, removed, errors }), { headers: { 'content-type': 'application/json' } })
})
