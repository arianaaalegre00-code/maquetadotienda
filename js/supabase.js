/**
 * supabase.js
 * -----------
 * Crea el cliente de Supabase usando config.js.
 * Expone window.TIENDA_SUPABASE (o null si todavía no se configuró).
 */
(function () {
  'use strict';

  const cfg = window.TIENDA_CONFIG || {};
  const sinConfigurar =
    !cfg.SUPABASE_URL ||
    !cfg.SUPABASE_ANON_KEY ||
    cfg.SUPABASE_URL.indexOf('TU-PROYECTO') !== -1 ||
    cfg.SUPABASE_ANON_KEY.indexOf('TU-ANON-KEY') !== -1;

  if (sinConfigurar) {
    window.TIENDA_SUPABASE = null;
    document.addEventListener('DOMContentLoaded', function () {
      const aviso = document.createElement('div');
      aviso.className = 'aviso-config';
      aviso.textContent = '⚠️ Falta configurar Supabase: abrí config.js y pegá la URL, la Anon Key y el WhatsApp.';
      document.body.prepend(aviso);
    });
    return;
  }

  if (!window.supabase || !window.supabase.createClient) {
    console.error('No se cargó la librería de Supabase desde el CDN.');
    window.TIENDA_SUPABASE = null;
    return;
  }

  window.TIENDA_SUPABASE = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
})();
