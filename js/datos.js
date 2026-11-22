/**
 * datos.js
 * --------
 * Textos fijos de la marca y categorías.
 * Los productos YA NO están acá: ahora viven en Supabase.
 * El WhatsApp tampoco: está en config.js.
 */
(function (global) {
  'use strict';

  const config = {
    marca: 'Manos de Tierra',
    lema: 'Piezas hechas a mano, con calma y cariño.',
    descripcion:
      'Cerámica, madera, tejidos y pequeños detalles para tu casa. Un emprendimiento familiar de artesanías.',
    email: 'hola@manosdetierra.com.ar',
    telefono: '+54 9 11 0000 0000',
    localidad: 'Buenos Aires, Argentina',
    horarios: 'Lunes a viernes · 10 a 18 h',
    instagram: 'https://instagram.com/tu_cuenta',
    facebook: 'https://facebook.com/tu_pagina',
    tiktok: 'https://tiktok.com/@tu_cuenta',
    moneda: 'ARS',
    locale: 'es-AR',
    aviso: 'Catálogo en vivo · los cambios del panel se ven al instante.'
  };

  const categorias = [
    { id: 'ceramica', nombre: 'Cerámica', icono: '🏺', descripcion: 'Modeladas a mano' },
    { id: 'madera', nombre: 'Madera', icono: '🪵', descripcion: 'Calidez natural' },
    { id: 'tejidos', nombre: 'Tejidos', icono: '🧶', descripcion: 'Texturas que abrigan' },
    { id: 'decoracion', nombre: 'Decoración', icono: '✨', descripcion: 'Detalles con alma' }
  ];

  global.TIENDA_DATOS = { config, categorias };
})(window);
