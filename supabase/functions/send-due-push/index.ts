import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT_RAW = Deno.env.get('VAPID_SUBJECT') || 'admin@example.com'
const VAPID_SUBJECT =
  VAPID_SUBJECT_RAW.startsWith('mailto:') || VAPID_SUBJECT_RAW.startsWith('https://')
    ? VAPID_SUBJECT_RAW
    : `mailto:${VAPID_SUBJECT_RAW}`
const CRON_SECRET = Deno.env.get('CRON_SECRET') || ''

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
})

function isoToday(timeZone = 'Europe/Brussels') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date())
}

function money(value: unknown) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(value || 0))
}

function balance(vale: any) {
  const total = Number(vale.total ?? vale.valorComTaxa ?? vale.valor ?? 0)
  const partial = Number(vale.parcialRecebido ?? vale.valorPago ?? 0)
  return Math.max(0, total - partial)
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  })
}

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return jsonResponse({ error: 'unauthorized' }, 401)
  }

  try {
    const today = isoToday()

    // Cada workspace representa uma sessão. Os vales pertencem à sessão,
    // não a um usuário de serviço individual.
    const { data: workspaces, error: workspaceError } = await supabase
      .from('session_workspaces')
      .select('session_user_id,data')

    if (workspaceError) throw workspaceError

    let sessionsWithDueVales = 0
    let dueVales = 0
    let recipientDevices = 0
    let sent = 0
    let skipped = 0
    let removed = 0
    let errors = 0

    for (const workspace of workspaces || []) {
      const sessionUserId = String(workspace.session_user_id || '')
      if (!sessionUserId) continue

      const vales = Array.isArray(workspace.data?.vales) ? workspace.data.vales : []

      // Somente vales não pagos que vencem exatamente hoje.
      const dueToday = vales.filter((vale: any) => {
        const status = String(vale.status || '').trim().toUpperCase()
        const dueDate = String(vale.dataFinal || '').slice(0, 10)
        return status !== 'PAGO' && dueDate === today
      })

      if (!dueToday.length) continue

      sessionsWithDueVales++
      dueVales += dueToday.length

      // Busca somente os usuários de SERVIÇO pertencentes a esta sessão.
      // O usuário de sessão é administrador e não recebe notificações dos vales.
      const { data: serviceUsers, error: serviceUsersError } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'service')
        .eq('session_user_id', sessionUserId)
        .eq('active', true)

      if (serviceUsersError) {
        console.error(`Erro ao buscar usuários de serviço da sessão ${sessionUserId}:`, serviceUsersError)
        errors++
        continue
      }

      const serviceUserIds = (serviceUsers || []).map((user: any) => user.id)
      if (!serviceUserIds.length) continue

      // Busca todos os aparelhos ativados desses usuários de serviço.
      // Inscrições do usuário de sessão são ignoradas, inclusive inscrições antigas.
      const { data: subscriptions, error: subscriptionError } = await supabase
        .from('push_subscriptions')
        .select('id,user_id,session_user_id,endpoint,p256dh,auth')
        .eq('session_user_id', sessionUserId)
        .eq('enabled', true)
        .in('user_id', serviceUserIds)

      if (subscriptionError) {
        console.error(`Erro ao buscar inscrições dos usuários de serviço da sessão ${sessionUserId}:`, subscriptionError)
        errors++
        continue
      }

      recipientDevices += subscriptions?.length || 0

      for (const subscription of subscriptions || []) {
        for (const vale of dueToday) {
          const valeId = String(
            vale.id ?? vale.numero ?? `${vale.cliente || 'cliente'}-${vale.dataFinal}`
          )
          const dueDate = String(vale.dataFinal).slice(0, 10)

          const { error: logError } = await supabase
            .from('push_delivery_log')
            .insert({
              subscription_id: subscription.id,
              vale_id: valeId,
              due_date: dueDate,
              notification_date: today,
              kind: 'DUE_TODAY'
            })

          if (logError) {
            // 23505 = notificação já enviada para este aparelho hoje.
            if (logError.code === '23505') {
              skipped++
            } else {
              console.error('Erro ao registrar entrega:', logError)
              errors++
            }
            continue
          }

          const payload = JSON.stringify({
            title: 'VALLE — vence hoje',
            body:
              `${vale.cliente || 'Cliente'} • ` +
              `${money(balance(vale))} • ` +
              `vencimento ${dueDate.split('-').reverse().join('/')}`,
            tag: `vale-${sessionUserId}-${valeId}-${dueDate}`,
            url: `./index.html?screen=notificacoes&vale=${encodeURIComponent(valeId)}#notificacoes`,
            data: {
              valeId,
              dueDate,
              sessionUserId
            }
          })

          try {
            await webpush.sendNotification(
              {
                endpoint: subscription.endpoint,
                keys: {
                  p256dh: subscription.p256dh,
                  auth: subscription.auth
                }
              },
              payload,
              {
                TTL: 86400,
                urgency: 'high'
              }
            )

            sent++
          } catch (error: any) {
            console.error('Erro ao enviar notificação:', error)
            errors++

            if (error?.statusCode === 404 || error?.statusCode === 410) {
              await supabase
                .from('push_subscriptions')
                .update({
                  enabled: false,
                  updated_at: new Date().toISOString()
                })
                .eq('id', subscription.id)

              removed++
            } else {
              // O envio falhou. Remove o log para permitir nova tentativa.
              await supabase
                .from('push_delivery_log')
                .delete()
                .eq('subscription_id', subscription.id)
                .eq('vale_id', valeId)
                .eq('due_date', dueDate)
                .eq('notification_date', today)
                .eq('kind', 'DUE_TODAY')
            }
          }
        }
      }
    }

    return jsonResponse({
      ok: true,
      date: today,
      sessionsWithDueVales,
      dueVales,
      recipientDevices,
      sent,
      skipped,
      removed,
      errors
    })
  } catch (error: any) {
    console.error('Erro geral da função:', error)
    return jsonResponse(
      {
        ok: false,
        error: error?.message || 'Erro interno ao enviar notificações'
      },
      500
    )
  }
})
