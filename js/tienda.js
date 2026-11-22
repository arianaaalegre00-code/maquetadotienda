/**
 * tienda.js
 * ---------
 * Vista de clientes:
 * - lee los productos desde Supabase
 * - se actualiza en tiempo real cuando la dueña cambia algo
 * - filtra, busca, arma el pedido y abre WhatsApp
 */
(function () {
  'use strict';

  const datos = window.TIENDA_DATOS;
  const cfg = window.TIENDA_CONFIG || {};
  const db = window.TIENDA_SUPABASE;
  const config = datos.config;
  const categorias = datos.categorias;
  const TABLA = cfg.TABLA || 'productos';

  const $ = function (selector, contexto) {
    return (contexto || document).querySelector(selector);
  };

  const formatearPrecio = new Intl.NumberFormat(config.locale, {
    style: 'currency',
    currency: config.moneda,
    maximumFractionDigits: 0
  }).format;

  let categoriaActiva = 'todas';
  let busqueda = '';
  let carrito = {};
  let productos = [];

  /* ---------- Utilidades ---------- */

  function escapar(valor) {
    return String(valor == null ? '' : valor)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizar(texto) {
    return String(texto || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function numeroWhatsapp() {
    return String(cfg.WHATSAPP || '').replace(/\D/g, '');
  }

  function enlaceWhatsapp(mensaje) {
    const texto = mensaje ? '?text=' + encodeURIComponent(mensaje) : '';
    return 'https://wa.me/' + numeroWhatsapp() + texto;
  }

  function abrirWhatsapp(mensaje) {
    if (!numeroWhatsapp()) {
      alert('Configurá el WhatsApp en config.js.');
      return;
    }
    window.open(enlaceWhatsapp(mensaje), '_blank', 'noopener,noreferrer');
  }

  function categoriaPorId(id) {
    return categorias.find(function (categoria) { return categoria.id === id; }) || null;
  }

  function normalizarProducto(fila) {
    return {
      id: fila.id,
      nombre: fila.nombre || '',
      categoria: fila.categoria || '',
      precio: Number(fila.precio) || 0,
      descripcion: fila.descripcion || '',
      imagen: fila.imagen_url || 'assets/productos/generico.svg',
      disponible: fila.disponible !== false
    };
  }

  /* ---------- Textos configurables ---------- */

  function aplicarTextos() {
    document.title = config.marca + ' · Artesanías';

    document.querySelectorAll('[data-marca]').forEach(function (nodo) {
      nodo.textContent = config.marca;
    });
    document.querySelectorAll('[data-lema]').forEach(function (nodo) {
      nodo.textContent = config.lema;
    });
    document.querySelectorAll('[data-descripcion]').forEach(function (nodo) {
      nodo.textContent = config.descripcion;
    });

    const telefono = $('[data-telefono]');
    if (telefono) telefono.textContent = config.telefono;

    const emailTexto = $('[data-email-texto]');
    if (emailTexto) emailTexto.textContent = config.email;
    const email = $('[data-email]');
    if (email) email.href = 'mailto:' + config.email;

    const localidad = $('[data-localidad]');
    if (localidad) localidad.textContent = config.localidad;
    const horarios = $('[data-horarios]');
    if (horarios) horarios.textContent = config.horarios;

    document.querySelectorAll('[data-whatsapp]').forEach(function (enlace) {
      enlace.href = enlaceWhatsapp('¡Hola! Quisiera consultar sus artesanías.');
    });

    document.querySelectorAll('[data-red]').forEach(function (enlace) {
      const url = config[enlace.dataset.red];
      if (url) enlace.href = url;
      else enlace.removeAttribute('href');
    });

    const anio = $('#anio-footer');
    if (anio) anio.textContent = String(new Date().getFullYear());
  }

  /* ---------- Supabase ---------- */

  async function cargarProductos(mostrarCargando) {
    const grilla = $('#grilla-productos');

    if (!db) {
      grilla.innerHTML = '<p class="resultados">No se pudo conectar con Supabase. Revisá config.js.</p>';
      $('#cantidad-resultados').textContent = '';
      return;
    }

    if (mostrarCargando) {
      grilla.innerHTML = '<p class="resultados">Cargando productos…</p>';
      $('#cantidad-resultados').textContent = '';
    }

    const { data, error } = await db
      .from(TABLA)
      .select('*')
      .order('nombre', { ascending: true });

    if (error) {
      console.error('Error al leer productos:', error);
      productos = [];
      grilla.innerHTML =
        '<div class="estado-vacio">' +
          '<h3>No se pudieron cargar los productos</h3>' +
          '<p>' + escapar(error.message || 'Error de conexión') + '</p>' +
          '<button class="btn btn--suave" type="button" data-accion="reintentar">Reintentar</button>' +
        '</div>';
      $('#cantidad-resultados').textContent = '';
      return;
    }

    productos = (data || []).map(normalizarProducto);
    limpiarCarritoInvalido();
    renderProductos();
    renderCarrito();
  }

  function escucharCambios() {
    if (!db) return;
    db.channel('tienda-cambios-productos')
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLA }, function () {
        cargarProductos(false);
      })
      .subscribe();
  }

  /* ---------- Categorías y grilla ---------- */

  function renderCategorias() {
    const contenedor = $('#lista-categorias');
    const opciones = [{ id: 'todas', nombre: 'Todo', icono: '✦' }].concat(categorias);

    contenedor.innerHTML = opciones.map(function (opcion) {
      const activa = opcion.id === categoriaActiva;
      return '<button type="button" class="chip' + (activa ? ' is-activo' : '') + '"' +
        ' data-categoria="' + escapar(opcion.id) + '" aria-pressed="' + activa + '">' +
        '<span aria-hidden="true">' + escapar(opcion.icono) + '</span> ' + escapar(opcion.nombre) +
        '</button>';
    }).join('');
  }

  function productosVisibles() {
    const texto = normalizar(busqueda);
    return productos.filter(function (producto) {
      const pasaCategoria = categoriaActiva === 'todas' || producto.categoria === categoriaActiva;
      const categoria = categoriaPorId(producto.categoria);
      const buscable = normalizar(
        producto.nombre + ' ' + producto.descripcion + ' ' + (categoria ? categoria.nombre : '')
      );
      return pasaCategoria && (!texto || buscable.indexOf(texto) !== -1);
    });
  }

  function tarjetaProducto(producto) {
    const categoria = categoriaPorId(producto.categoria);
    const agotado = !producto.disponible;

    return '<article class="producto' + (agotado ? ' is-agotado' : '') + '">' +
      '<div class="producto__media">' +
        '<img src="' + escapar(producto.imagen) + '" alt="' + escapar(producto.nombre) + '" loading="lazy" ' +
        'onerror="this.onerror=null;this.src=\'assets/productos/generico.svg\'">' +
        (agotado
          ? '<span class="etiqueta etiqueta--agotado">Sin stock</span>'
          : '<span class="etiqueta etiqueta--hecho">Hecho a mano</span>') +
      '</div>' +
      '<div class="producto__body">' +
        '<span class="producto__categoria">' +
          escapar(categoria ? categoria.icono + ' ' + categoria.nombre : 'Artesanía') +
        '</span>' +
        '<h3>' + escapar(producto.nombre) + '</h3>' +
        '<p class="producto__descripcion">' + escapar(producto.descripcion) + '</p>' +
        '<div class="producto__pie">' +
          '<span class="producto__precio">' + escapar(formatearPrecio(producto.precio)) + '</span>' +
        '</div>' +
        '<div class="producto__acciones">' +
          '<button class="btn ' + (agotado ? 'btn--suave' : 'btn--whatsapp') + '" type="button" ' +
            'data-accion="consultar" data-id="' + escapar(producto.id) + '">' +
            (agotado ? 'Consultar stock' : 'Consultar por WhatsApp') +
          '</button>' +
          '<button class="btn btn--primario" type="button" data-accion="agregar" ' +
            'data-id="' + escapar(producto.id) + '"' + (agotado ? ' disabled' : '') + '>' +
            (agotado ? 'Sin stock' : 'Agregar al pedido') +
          '</button>' +
        '</div>' +
      '</div>' +
    '</article>';
  }

  function renderProductos() {
    const visibles = productosVisibles();
    const grilla = $('#grilla-productos');
    const vacio = $('#estado-vacio');
    const contador = $('#cantidad-resultados');

    grilla.innerHTML = visibles.map(tarjetaProducto).join('');
    vacio.classList.toggle('oculto', visibles.length !== 0);
    grilla.classList.toggle('oculto', visibles.length === 0);

    contador.textContent = visibles.length === 1
      ? '1 producto encontrado'
      : visibles.length + ' productos encontrados';
  }

  /* ---------- WhatsApp ---------- */

  function mensajeProducto(producto) {
    const precio = formatearPrecio(producto.precio);
    if (!producto.disponible) {
      return '¡Hola! 👋 ¿Volverán a tener disponible "' + producto.nombre + '"? ' +
        'La vi en el catálogo con un precio de ' + precio + '. ¡Gracias!';
    }
    return '¡Hola! 👋 Me interesa "' + producto.nombre + '" (' + precio + '). ' +
      '¿Está disponible? ¿Cómo hacemos para pedirla? ¡Gracias!';
  }

  function consultarProducto(id) {
    const producto = productos.find(function (item) { return String(item.id) === String(id); });
    if (producto) abrirWhatsapp(mensajeProducto(producto));
  }

  /* ---------- Carrito ---------- */

  function limpiarCarritoInvalido() {
    Object.keys(carrito).forEach(function (id) {
      const producto = productos.find(function (item) { return String(item.id) === String(id); });
      if (!producto || !producto.disponible) delete carrito[id];
    });
  }

  function itemsDelCarrito() {
    return Object.keys(carrito).map(function (id) {
      const producto = productos.find(function (item) { return String(item.id) === String(id); });
      if (!producto) return null;
      return {
        producto: producto,
        cantidad: carrito[id],
        subtotal: producto.precio * carrito[id]
      };
    }).filter(Boolean);
  }

  function agregarAlCarrito(id) {
    const producto = productos.find(function (item) { return String(item.id) === String(id); });
    if (!producto || !producto.disponible) return;
    carrito[id] = (carrito[id] || 0) + 1;
    renderCarrito();
  }

  function cambiarCantidad(id, delta) {
    if (!carrito[id]) return;
    carrito[id] += delta;
    if (carrito[id] <= 0) delete carrito[id];
    renderCarrito();
  }

  function renderCarrito() {
    const items = itemsDelCarrito();
    const contenedor = $('#carrito-items');
    const total = items.reduce(function (suma, item) { return suma + item.subtotal; }, 0);
    const cantidad = items.reduce(function (suma, item) { return suma + item.cantidad; }, 0);

    if (items.length === 0) {
      contenedor.innerHTML = '<p class="texto-muted" style="padding:18px 0">' +
        'Todavía no agregaste productos. Elegí tus favoritos en el catálogo. 🧺</p>';
    } else {
      contenedor.innerHTML = items.map(function (item) {
        return '<div class="carrito-item">' +
          '<img src="' + escapar(item.producto.imagen) + '" alt="" ' +
          'onerror="this.onerror=null;this.src=\'assets/productos/generico.svg\'">' +
          '<div>' +
            '<h3>' + escapar(item.producto.nombre) + '</h3>' +
            '<p class="carrito-item__precio">' + escapar(formatearPrecio(item.producto.precio)) + ' c/u</p>' +
            '<div class="controles">' +
              '<button type="button" data-accion="menos" data-id="' + escapar(item.producto.id) + '" aria-label="Quitar una unidad">−</button>' +
              '<span>' + item.cantidad + '</span>' +
              '<button type="button" data-accion="mas" data-id="' + escapar(item.producto.id) + '" aria-label="Agregar una unidad">+</button>' +
              '<button type="button" class="btn btn--chip btn--peligro" data-accion="quitar" ' +
                'data-id="' + escapar(item.producto.id) + '" aria-label="Quitar producto">Quitar</button>' +
            '</div>' +
            '<p class="carrito-item__precio"><strong>' + escapar(formatearPrecio(item.subtotal)) + '</strong></p>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    $('#carrito-total').textContent = formatearPrecio(total);
    $('#carrito-contador').textContent = String(cantidad);
    $('#btn-carrito-flotante').classList.toggle('is-visible', cantidad > 0);
    $('#btn-enviar-pedido').disabled = items.length === 0;
    $('#btn-carrito-flotante').setAttribute('aria-label', 'Ver pedido, ' + cantidad + ' productos');
  }

  function abrirCarrito() {
    $('#carrito-panel').classList.add('is-abierto');
    $('#overlay-carrito').classList.add('is-abierto');
    $('#carrito-panel').setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    $('#btn-cerrar-carrito').focus();
  }

  function cerrarCarrito() {
    $('#carrito-panel').classList.remove('is-abierto');
    $('#overlay-carrito').classList.remove('is-abierto');
    $('#carrito-panel').setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function enviarPedido() {
    const items = itemsDelCarrito();
    if (items.length === 0) return;

    const lineas = items.map(function (item, indice) {
      return (indice + 1) + '. ' + item.cantidad + ' × ' + item.producto.nombre +
        ' — ' + formatearPrecio(item.producto.precio) + ' c/u = ' + formatearPrecio(item.subtotal);
    });

    const total = items.reduce(function (suma, item) { return suma + item.subtotal; }, 0);
    const mensaje = '¡Hola! 👋 Quisiera consultar este pedido:\n\n' +
      lineas.join('\n') +
      '\n\nTotal estimado: ' + formatearPrecio(total) +
      '\n\n¿Me confirman disponibilidad y cómo coordinamos la entrega? ¡Gracias!';

    abrirWhatsapp(mensaje);
  }

  /* ---------- Eventos ---------- */

  function inicializarEventos() {
    $('#buscador').addEventListener('input', function (evento) {
      busqueda = evento.target.value;
      renderProductos();
    });

    $('#lista-categorias').addEventListener('click', function (evento) {
      const boton = evento.target.closest('[data-categoria]');
      if (!boton) return;
      categoriaActiva = boton.dataset.categoria;
      renderCategorias();
      renderProductos();
    });

    $('#grilla-productos').addEventListener('click', function (evento) {
      const boton = evento.target.closest('[data-accion]');
      if (!boton) return;
      if (boton.dataset.accion === 'consultar') consultarProducto(boton.dataset.id);
      if (boton.dataset.accion === 'agregar') agregarAlCarrito(boton.dataset.id);
      if (boton.dataset.accion === 'reintentar') cargarProductos(true);
    });

    $('#btn-ver-todo').addEventListener('click', function () {
      busqueda = '';
      categoriaActiva = 'todas';
      $('#buscador').value = '';
      renderCategorias();
      renderProductos();
    });

    $('#carrito-items').addEventListener('click', function (evento) {
      const boton = evento.target.closest('[data-accion]');
      if (!boton) return;
      const id = boton.dataset.id;
      if (boton.dataset.accion === 'mas') cambiarCantidad(id, 1);
      if (boton.dataset.accion === 'menos') cambiarCantidad(id, -1);
      if (boton.dataset.accion === 'quitar') {
        delete carrito[id];
        renderCarrito();
      }
    });

    $('#btn-carrito-flotante').addEventListener('click', abrirCarrito);
    $('#btn-cerrar-carrito').addEventListener('click', cerrarCarrito);
    $('#overlay-carrito').addEventListener('click', cerrarCarrito);
    $('#btn-enviar-pedido').addEventListener('click', enviarPedido);

    document.addEventListener('keydown', function (evento) {
      if (evento.key === 'Escape') cerrarCarrito();
    });
  }

  function inicializar() {
    aplicarTextos();
    renderCategorias();
    renderCarrito();
    inicializarEventos();
    cargarProductos(true);
    escucharCambios();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
  } else {
    inicializar();
  }
})();
