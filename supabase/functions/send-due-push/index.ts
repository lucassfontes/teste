import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const SITE = ('teste')

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

function isoToday(timeZone = 'America/Sao_Paulo') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date())
}

function dateDiffDays(fromIso: string, toIso: string) {
  const [fy, fm, fd] = fromIso.split('-').map(Number)
  const [ty, tm, td] = toIso.split('-').map(Number)
  if (![fy, fm, fd, ty, tm, td].every(Number.isFinite)) return Number.NaN
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000)
}

function formatDateBR(isoDate: string) {
  return isoDate.split('-').reverse().join('/')
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

async function registerDelivery(
  subscriptionId: string,
  itemId: string,
  dueDate: string,
  notificationDate: string,
  kind: string
) {
  const { error } = await supabase.from('push_delivery_log').insert({
    subscription_id: subscriptionId,
    vale_id: itemId,
    due_date: dueDate,
    notification_date: notificationDate,
    kind
  })

  return error
}

async function removeDelivery(
  subscriptionId: string,
  itemId: string,
  dueDate: string,
  notificationDate: string,
  kind: string
) {
  await supabase
    .from('push_delivery_log')
    .delete()
    .eq('subscription_id', subscriptionId)
    .eq('vale_id', itemId)
    .eq('due_date', dueDate)
    .eq('notification_date', notificationDate)
    .eq('kind', kind)
}

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return jsonResponse({ error: 'unauthorized' }, 401)
  }

  try {
    const today = isoToday()

    const { data: workspaces, error: workspaceError } = await supabase
      .from('session_workspaces')
      .select('session_user_id,data')

    if (workspaceError) throw workspaceError

    let sessionsProcessed = 0
    let sessionsWithDueVales = 0
    let dueVales = 0
    let sessionsNearExpiration = 0
    let recipientDevices = 0
    let sent = 0
    let valeNotificationsSent = 0
    let sessionExpirationNotificationsSent = 0
    let skipped = 0
    let removed = 0
    let errors = 0

    for (const workspace of workspaces || []) {
      const sessionUserId = String(workspace.session_user_id || '')
      if (!sessionUserId) continue

      sessionsProcessed++

      // Busca o usuário de sessão para verificar a validade da assinatura/acesso.
      const { data: sessionProfile, error: sessionProfileError } = await supabase
        .from('profiles')
        .select('id,name,active,valid_until')
        .eq('id', sessionUserId)
        .eq('role', 'session')
        .maybeSingle()

      if (sessionProfileError) {
        console.error(`Erro ao buscar usuário de sessão ${sessionUserId}:`, sessionProfileError)
        errors++
        continue
      }

      // Somente usuários de serviço ATIVOS da sessão recebem notificações.
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

      const { data: subscriptions, error: subscriptionError } = await supabase
        .from('push_subscriptions')
        .select('id,user_id,session_user_id,endpoint,p256dh,auth')
        .eq('session_user_id', sessionUserId)
        .eq('enabled', true)
        .in('user_id', serviceUserIds)

      if (subscriptionError) {
        console.error(`Erro ao buscar inscrições da sessão ${sessionUserId}:`, subscriptionError)
        errors++
        continue
      }

      const recipientSubscriptions = subscriptions || []
      recipientDevices += recipientSubscriptions.length
      if (!recipientSubscriptions.length) continue

      // ------------------------------------------------------------
      // 1) VALES: somente os que vencem exatamente hoje.
      // ------------------------------------------------------------
      const vales = Array.isArray(workspace.data?.vales) ? workspace.data.vales : []
      const dueToday = vales.filter((vale: any) => {
        const status = String(vale.status || '').trim().toUpperCase()
        const dueDate = String(vale.dataFinal || '').slice(0, 10)
        return status !== 'PAGO' && dueDate === today
      })

      if (dueToday.length) {
        sessionsWithDueVales++
        dueVales += dueToday.length
      }

      for (const subscription of recipientSubscriptions) {
        for (const vale of dueToday) {
          const valeId = String(
            vale.id ?? vale.numero ?? `${vale.cliente || 'cliente'}-${vale.dataFinal}`
          )
          const dueDate = String(vale.dataFinal).slice(0, 10)
          const kind = 'DUE_TODAY'

          const logError = await registerDelivery(
            subscription.id,
            valeId,
            dueDate,
            today,
            kind
          )

          if (logError) {
            if (logError.code === '23505') skipped++
            else {
              console.error('Erro ao registrar aviso do vale:', logError)
              errors++
            }
            continue
          }

          const payload = JSON.stringify({
            title: 'Vence hoje',
            body:
              `${vale.cliente || 'Cliente'} • ` +
              `${money(balance(vale))} • ` +
              `vencimento ${formatDateBR(dueDate)}`,
            tag: `vale-${sessionUserId}-${valeId}-${dueDate}`,
            url: `./${SITE}/index.html?screen=notificacoes&vale=${encodeURIComponent(valeId)}#notificacoes`,
            data: { type: 'DUE_TODAY', valeId, dueDate, sessionUserId }
          })

          try {
            await webpush.sendNotification(
              {
                endpoint: subscription.endpoint,
                keys: { p256dh: subscription.p256dh, auth: subscription.auth }
              },
              payload,
              { TTL: 86400, urgency: 'high' }
            )
            sent++
            valeNotificationsSent++
          } catch (error: any) {
            console.error('Erro ao enviar aviso do vale:', error)
            errors++

            if (error?.statusCode === 404 || error?.statusCode === 410) {
              await supabase
                .from('push_subscriptions')
                .update({ enabled: false, updated_at: new Date().toISOString() })
                .eq('id', subscription.id)
              removed++
            } else {
              await removeDelivery(subscription.id, valeId, dueDate, today, kind)
            }
          }
        }
      }

      // ------------------------------------------------------------
      // 2) VALIDADE DA SESSÃO: avisa diariamente de 7 dias até o dia.
      // O próprio usuário de sessão NÃO recebe; somente seus serviços.
      // ------------------------------------------------------------
      const validUntil = String(sessionProfile?.valid_until || '').slice(0, 10)
      const daysRemaining = validUntil ? dateDiffDays(today, validUntil) : Number.NaN
      const shouldNotifyExpiration =
        Boolean(sessionProfile?.active) &&
        Boolean(validUntil) &&
        Number.isFinite(daysRemaining) &&
        daysRemaining >= 0 &&
        daysRemaining <= 7

      if (shouldNotifyExpiration) {
        sessionsNearExpiration++
        const itemId = `SESSION_EXPIRY:${sessionUserId}`
        const kind = 'SESSION_EXPIRY'
        const sessionName = String(sessionProfile?.name || 'Sessão')

        let title = 'VALLE'
        let body = `A sessão ${sessionName} vence em ${daysRemaining} dias, em ${formatDateBR(validUntil)}.`

        if (daysRemaining === 1) {
          body = `A sessão ${sessionName} vence amanhã, em ${formatDateBR(validUntil)}.`
        } else if (daysRemaining === 0) {
          title = 'VALLE — sessão vence hoje'
          body = `A sessão ${sessionName} vence hoje, ${formatDateBR(validUntil)}.`
        }

        for (const subscription of recipientSubscriptions) {
          const logError = await registerDelivery(
            subscription.id,
            itemId,
            validUntil,
            today,
            kind
          )

          if (logError) {
            if (logError.code === '23505') skipped++
            else {
              console.error('Erro ao registrar aviso da validade:', logError)
              errors++
            }
            continue
          }

          const payload = JSON.stringify({
            title,
            body,
            tag: `session-expiry-${sessionUserId}-${validUntil}-${today}`,
            url: `./${SITE}/index.html?screen=dashboard#dashboard`,
            data: {
              type: 'SESSION_EXPIRY',
              sessionUserId,
              validUntil,
              daysRemaining
            }
          })

          try {
            await webpush.sendNotification(
              {
                endpoint: subscription.endpoint,
                keys: { p256dh: subscription.p256dh, auth: subscription.auth }
              },
              payload,
              { TTL: 86400, urgency: 'high' }
            )
            sent++
            sessionExpirationNotificationsSent++
          } catch (error: any) {
            console.error('Erro ao enviar aviso da validade da sessão:', error)
            errors++

            if (error?.statusCode === 404 || error?.statusCode === 410) {
              await supabase
                .from('push_subscriptions')
                .update({ enabled: false, updated_at: new Date().toISOString() })
                .eq('id', subscription.id)
              removed++
            } else {
              await removeDelivery(subscription.id, itemId, validUntil, today, kind)
            }
          }
        }
      }
    }

    return jsonResponse({
      ok: true,
      date: today,
      timeZone: 'America/Sao_Paulo',
      sessionsProcessed,
      sessionsWithDueVales,
      dueVales,
      sessionsNearExpiration,
      recipientDevices,
      valeNotificationsSent,
      sessionExpirationNotificationsSent,
      sent,
      skipped,
      removed,
      errors
    })
  } catch (error: any) {
    console.error('Erro geral da função:', error)
    return jsonResponse(
      { ok: false, error: error?.message || 'Erro interno ao enviar notificações' },
      500
    )
  }
})
