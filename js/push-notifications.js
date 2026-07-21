(function () {
  'use strict';

  const cfg = window.VALLE_SUPABASE_CONFIG || {};
  const vapidPublicKey = String(cfg.vapidPublicKey || '').trim();
  const $ = (id) => document.getElementById(id);

  function supported() {
    return window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  function base64UrlToUint8Array(value) {
    const padding = '='.repeat((4 - value.length % 4) % 4);
    const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  }

  function setStatus(message, type) {
    const el = $('pushNotificationStatus');
    if (!el) return;
    el.className = `alert py-2 px-3 mb-3 alert-${type || 'secondary'}`;
    el.textContent = message;
  }

  async function getRegistration() {
    const registration = await navigator.serviceWorker.ready;
    if (!registration.active) throw new Error('O serviço de notificações ainda não está ativo.');
    return registration;
  }

  async function saveSubscription(subscription) {
    const cloud = window.ValleCloud;
    if (!cloud?.profile?.id) throw new Error('Entre no sistema antes de ativar as notificações.');
    const client = cloud.getClient();
    if (!client) throw new Error('Supabase não configurado.');

    // Somente usuários de serviço recebem notificações de vencimento.
    // O usuário de sessão administra a equipe, mas não recebe os avisos dos vales.
    if (cloud.profile.role !== 'service') {
      throw new Error('As notificações de vales estão disponíveis somente para usuários de serviço.');
    }

    const sessionUserId = cloud.profile.session_user_id;

    if (!sessionUserId) {
      throw new Error('Este usuário de serviço não está vinculado a uma sessão válida.');
    }

    const json = subscription.toJSON();
    const payload = {
      user_id: cloud.profile.id,
      // Usuários de sessão e todos os usuários de serviço subordinados
      // compartilham o mesmo session_user_id para receber os mesmos avisos.
      session_user_id: sessionUserId,
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      user_agent: navigator.userAgent.slice(0, 500),
      enabled: true,
      updated_at: new Date().toISOString()
    };

    const { error } = await client.from('push_subscriptions').upsert(payload, { onConflict: 'endpoint' });
    if (error) throw error;
  }

  async function activate() {
    try {
      if (!supported()) throw new Error('Este navegador não oferece notificações push. Use HTTPS e instale o VALLE na tela inicial.');
      if (!vapidPublicKey) throw new Error('A chave pública VAPID ainda não foi configurada.');

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('A permissão de notificações não foi concedida.');

      setStatus('Ativando notificações neste aparelho…', 'info');
      const registration = await getRegistration();
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(vapidPublicKey)
        });
      }
      await saveSubscription(subscription);
      setStatus('Notificações ativadas neste aparelho. Você receberá avisos mesmo com o VALLE fechado.', 'success');
      await refresh();
    } catch (error) {
      console.error(error);
      setStatus(error.message || 'Não foi possível ativar as notificações.', 'danger');
    }
  }

  async function deactivate() {
    try {
      const registration = await getRegistration();
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const client = window.ValleCloud?.getClient?.();
        if (client) await client.from('push_subscriptions').update({ enabled: false, updated_at: new Date().toISOString() }).eq('endpoint', subscription.endpoint);
        await subscription.unsubscribe();
      }
      setStatus('Notificações desativadas neste aparelho.', 'secondary');
      await refresh();
    } catch (error) {
      setStatus(error.message || 'Não foi possível desativar as notificações.', 'danger');
    }
  }

  async function testNotification() {
    try {
      if (Notification.permission !== 'granted') throw new Error('Ative as notificações primeiro.');
      const registration = await getRegistration();
      await registration.showNotification('VALLE — teste de notificação', {
        body: 'As notificações estão funcionando neste celular.',
        icon: './icons/android-chrome-192x192.png',
        badge: './icons/favicon-48x48.png',
        tag: 'valle-test',
        data: { url: './index.html#notificacoes' }
      });
    } catch (error) {
      setStatus(error.message || 'Não foi possível testar a notificação.', 'danger');
    }
  }

  async function refresh() {
    const activateBtn = $('activatePushNotifications');
    const testBtn = $('testPushNotifications');
    if (!activateBtn) return;

    if (!supported()) {
      activateBtn.disabled = true;
      testBtn.disabled = true;
      testBtn.setAttribute('aria-disabled', 'true');
      testBtn.classList.add('is-disabled');
      setStatus('Este aparelho ou navegador não oferece notificações push. No iPhone, instale o VALLE pela opção “Adicionar à Tela de Início”.', 'warning');
      return;
    }

    const profile = window.ValleCloud?.profile;
    if (profile?.role && profile.role !== 'service') {
      activateBtn.classList.add('d-none');
      testBtn.disabled = true;
      testBtn.setAttribute('aria-disabled', 'true');
      testBtn.classList.add('is-disabled');
      setStatus('O usuário de sessão não recebe notificações dos vales. Os avisos são enviados somente aos usuários de serviço desta sessão.', 'secondary');
      return;
    }

    const registration = await getRegistration().catch(() => null);
    const subscription = registration ? await registration.pushManager.getSubscription() : null;
    const active = Notification.permission === 'granted' && !!subscription;
    activateBtn.classList.remove('d-none');
    activateBtn.disabled = false;
    activateBtn.classList.toggle('is-active', active);
    activateBtn.classList.toggle('btn-success', !active);
    activateBtn.classList.toggle('btn-outline-danger', active);
    activateBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
    activateBtn.dataset.notificationActive = active ? 'true' : 'false';
    activateBtn.innerHTML = active
      ? '<i class="bi bi-bell-slash me-1"></i><span>DESATIVAR NOTIFICAÇÕES</span>'
      : '<i class="bi bi-bell-fill me-1"></i><span>ATIVAR NOTIFICAÇÕES</span>';
    testBtn.disabled = !active;
    testBtn.setAttribute('aria-disabled', active ? 'false' : 'true');
    testBtn.classList.toggle('is-disabled', !active);

    if (active) setStatus('Notificações ativadas neste aparelho.', 'success');
    else if (Notification.permission === 'denied') setStatus('As notificações estão bloqueadas nas configurações do navegador.', 'danger');
    else setStatus('Ative para receber avisos de vales vencidos mesmo com o aplicativo fechado.', 'secondary');
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('activatePushNotifications')?.addEventListener('click', async function () {
      const active = this.dataset.notificationActive === 'true';
      this.disabled = true;
      try {
        if (active) await deactivate();
        else await activate();
      } finally {
        if (document.body.contains(this)) this.disabled = false;
      }
    });
    $('testPushNotifications')?.addEventListener('click', testNotification);
    const noticesModal = $('avisosCelularModal');
    noticesModal?.addEventListener('show.bs.modal', function () {
      const testBtn = $('testPushNotifications');
      if (testBtn) {
        testBtn.disabled = true;
        testBtn.setAttribute('aria-disabled', 'true');
        testBtn.classList.add('is-disabled');
      }
    });
    noticesModal?.addEventListener('shown.bs.modal', refresh);
    setTimeout(refresh, 1200);
  });

  window.VallePush = { activate, deactivate, refresh, testNotification };
})();
