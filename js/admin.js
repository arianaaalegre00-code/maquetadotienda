/**
 * admin.js
 * --------
 * Panel de la dueña con Supabase:
 * - login con email y contraseña (Supabase Auth)
 * - alta, edición, stock y borrado en la tabla `productos`
 * - subida de fotos al Storage con vista previa
 * - carteles claros de éxito / error
 */
(function () {
  'use strict';

  const datos = window.TIENDA_DATOS;
  const cfg = window.TIENDA_CONFIG || {};
  const db = window.TIENDA_SUPABASE;
  const config = datos.config;
  const categorias = datos.categorias;
  const TABLA = cfg.TABLA || 'productos';
  const BUCKET = cfg.BUCKET || 'productos';
  const IMAGEN_POR_DEFECTO = 'assets/productos/generico.svg';

  const $ = function (selector, contexto) {
    return (contexto || document).querySelector(selector);
  };

  const formatearPrecio = new Intl.NumberFormat(config.locale, {
    style: 'currency',
    currency: config.moneda,
    maximumFractionDigits: 0
  }).format;

  let editandoId = null;
  let imagenActual = IMAGEN_POR_DEFECTO;
  let archivoElegido = null;
  let productos = [];
  let adminVisible = false;
  let escuchandoCambios = false;
  let temporizadorToast = null;

  /* ---------- Utilidades ---------- */

  function escapar(valor) {
    return String(valor == null ? '' : valor)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toast(mensaje) {
    const nodo = $('#toast');
    if (!nodo) return;
    nodo.textContent = mensaje;
    nodo.classList.add('is-visible');
    clearTimeout(temporizadorToast);
    temporizadorToast = setTimeout(function () {
      nodo.classList.remove('is-visible');
    }, 3000);
  }

  function mensajeFormulario(texto, tipo) {
    const nodo = $('#mensaje-formulario');
    if (!nodo) return;
    if (!texto) {
      nodo.className = 'mensaje oculto';
      nodo.textContent = '';
      return;
    }
    nodo.className = 'mensaje ' + (tipo === 'ok' ? 'mensaje--ok' : 'mensaje--error');
    nodo.textContent = texto;
  }

  function mensajeLogin(texto) {
    const nodo = $('#login-error');
    if (!nodo) return;
    if (!texto) {
      nodo.className = 'mensaje mensaje--error oculto';
      nodo.textContent = '';
      return;
    }
    nodo.className = 'mensaje mensaje--error';
    nodo.textContent = texto;
  }

  function traducirError(error) {
    const texto = String((error && error.message) || error || 'Error desconocido');
    if (texto.indexOf('Invalid login credentials') !== -1) return 'Email o contraseña incorrectos.';
    if (texto.indexOf('Email not confirmed') !== -1) return 'Confirmá el email en Supabase antes de ingresar.';
    if (texto.indexOf('Failed to fetch') !== -1) return 'No se pudo conectar. Revisá la configuración e internet.';
    return texto;
  }

  function categoriaPorId(id) {
    return categorias.find(function (categoria) { return categoria.id === id; }) || null;
  }

  function aplicarTextos() {
    document.title = 'Panel administrador · ' + config.marca;
    document.querySelectorAll('[data-marca]').forEach(function (nodo) {
      nodo.textContent = config.marca;
    });
  }

  /* ---------- Acceso ---------- */

  function mostrarLogin() {
    adminVisible = false;
    $('#admin-app').classList.add('oculto');
    $('#login-panel').classList.remove('oculto');
  }

  function mostrarAdmin(email) {
    $('#login-panel').classList.add('oculto');
    $('#admin-app').classList.remove('oculto');

    const usuario = $('#usuario-actual');
    if (usuario && email) usuario.textContent = email;

    if (adminVisible) return;
    adminVisible = true;
    listarProductos();
    escucharCambios();
  }

  async function inicializarAuth() {
    if (!db) {
      mostrarLogin();
      mensajeLogin('Falta configurar Supabase en config.js.');
      $('#formulario-login').querySelector('button[type="submit"]').disabled = true;
      return;
    }

    const { data } = await db.auth.getSession();
    if (data && data.session) mostrarAdmin(data.session.user.email);
    else mostrarLogin();

    db.auth.onAuthStateChange(function (_evento, session) {
      if (session) mostrarAdmin(session.user.email);
      else {
        limpiarFormulario();
        mostrarLogin();
      }
    });
  }

  async function iniciarSesion(evento) {
    evento.preventDefault();
    mensajeLogin('');

    const email = $('#login-email').value.trim();
    const password = $('#login-password').value;
    if (!email || !password) {
      mensajeLogin('Completá el email y la contraseña.');
      return;
    }

    const boton = $('#formulario-login button[type="submit"]');
    boton.disabled = true;
    boton.textContent = 'Ingresando…';

    const { error } = await db.auth.signInWithPassword({ email: email, password: password });

    boton.disabled = false;
    boton.textContent = 'Ingresar';

    if (error) mensajeLogin(traducirError(error));
    else $('#login-password').value = '';
  }

  async function cerrarSesion() {
    if (!db) return;
    const { error } = await db.auth.signOut();
    if (error) toast('No se pudo cerrar sesión.');
  }

  /* ---------- Formulario ---------- */

  function llenarCategorias() {
    $('#campo-categoria').innerHTML = categorias.map(function (categoria) {
      return '<option value="' + escapar(categoria.id) + '">' +
        escapar(categoria.icono + ' ' + categoria.nombre) +
        '</option>';
    }).join('');
  }

  function limpiarFormulario() {
    const formulario = $('#formulario-producto');
    if (!formulario) return;

    formulario.reset();
    $('#producto-id').value = '';
    $('#campo-imagen-url').value = '';
    $('#vista-previa').src = IMAGEN_POR_DEFECTO;
    $('#form-titulo').textContent = 'Agregar producto';
    $('#form-subtitulo').textContent = 'Completá los datos y tocá “Publicar producto”.';
    $('#btn-guardar').textContent = 'Publicar producto';
    $('#btn-cancelar-editar').classList.add('oculto');
    mensajeFormulario('');

    editandoId = null;
    imagenActual = IMAGEN_POR_DEFECTO;
    archivoElegido = null;
  }

  function llenarFormulario(producto) {
    editandoId = producto.id;
    imagenActual = producto.imagen_url || IMAGEN_POR_DEFECTO;
    archivoElegido = null;

    $('#producto-id').value = producto.id;
    $('#campo-nombre').value = producto.nombre || '';
    $('#campo-categoria').value = producto.categoria || categorias[0].id;
    $('#campo-precio').value = producto.precio;
    $('#campo-descripcion').value = producto.descripcion || '';
    $('#campo-estado').value = producto.disponible === false ? 'sin-stock' : 'disponible';
    $('#campo-imagen-url').value = imagenActual.indexOf('data:') === 0 ? '' : imagenActual;
    $('#campo-imagen-archivo').value = '';
    $('#vista-previa').src = imagenActual;

    $('#form-titulo').textContent = 'Editar producto';
    $('#form-subtitulo').textContent = 'Modificá los datos y guardá los cambios.';
    $('#btn-guardar').textContent = 'Guardar cambios';
    $('#btn-cancelar-editar').classList.remove('oculto');
    mensajeFormulario('');

    if (window.innerWidth < 960) {
      $('#formulario-producto').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    $('#campo-nombre').focus({ preventScroll: true });
  }

  function validarFormulario() {
    const nombre = $('#campo-nombre').value.trim();
    const categoria = $('#campo-categoria').value;
    const precioTexto = $('#campo-precio').value.trim();
    const descripcion = $('#campo-descripcion').value.trim();
    const estado = $('#campo-estado').value;

    if (!nombre) return { ok: false, mensaje: 'El nombre del producto es obligatorio.' };
    if (!categoria) return { ok: false, mensaje: 'Elegí una categoría.' };
    if (precioTexto === '') return { ok: false, mensaje: 'El precio es obligatorio.' };

    const precio = Number(precioTexto);
    if (!Number.isFinite(precio) || precio < 0) {
      return { ok: false, mensaje: 'El precio debe ser un número mayor o igual a 0.' };
    }

    return {
      ok: true,
      valores: {
        nombre: nombre,
        categoria: categoria,
        precio: precio,
        descripcion: descripcion,
        imagen_url: $('#campo-imagen-url').value.trim() || (editandoId ? imagenActual : IMAGEN_POR_DEFECTO),
        disponible: estado !== 'sin-stock'
      }
    };
  }

  /* ---------- Imágenes ---------- */

  function vistaPreviaArchivo(evento) {
    const archivo = evento.target.files[0] || null;
    archivoElegido = archivo;

    if (!archivo) {
      $('#vista-previa').src = imagenActual || IMAGEN_POR_DEFECTO;
      return;
    }

    if (!archivo.type || archivo.type.indexOf('image/') !== 0) {
      mensajeFormulario('Elegí un archivo de imagen (JPG, PNG o WebP).', 'error');
      evento.target.value = '';
      archivoElegido = null;
      return;
    }

    if (archivo.size > 8 * 1024 * 1024) {
      mensajeFormulario('La imagen es muy grande. Elegí una de menos de 8 MB.', 'error');
      evento.target.value = '';
      archivoElegido = null;
      return;
    }

    mensajeFormulario('');
    const lector = new FileReader();
    lector.onload = function () { $('#vista-previa').src = lector.result; };
    lector.readAsDataURL(archivo);
  }

  async function subirImagen(archivo) {
    const nombreLimpio = archivo.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const ruta = Date.now() + '-' + nombreLimpio;

    const { error } = await db.storage
      .from(BUCKET)
      .upload(ruta, archivo, { contentType: archivo.type, upsert: false });

    if (error) throw new Error('No se pudo subir la foto: ' + error.message);

    const { data } = db.storage.from(BUCKET).getPublicUrl(ruta);
    return data.publicUrl;
  }

  function rutaDeImagen(url) {
    const marcador = '/storage/v1/object/public/' + BUCKET + '/';
    const indice = String(url || '').indexOf(marcador);
    if (indice === -1) return null;
    return decodeURIComponent(url.slice(indice + marcador.length).split('?')[0]);
  }

  async function borrarImagenVieja(url) {
    const ruta = rutaDeImagen(url);
    if (!ruta) return;
    await db.storage.from(BUCKET).remove([ruta]);
  }

  /* ---------- Base de datos ---------- */

  async function listarProductos() {
    if (!db || !adminVisible) return;

    const { data, error } = await db
      .from(TABLA)
      .select('*')
      .order('nombre', { ascending: true });

    if (error) {
      toast('No se pudo cargar la lista: ' + error.message);
      return;
    }

    productos = data || [];
    renderStats();
    renderLista();
  }

  function escucharCambios() {
    if (!db || escuchandoCambios) return;
    escuchandoCambios = true;

    db.channel('admin-cambios-productos')
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLA }, function () {
        listarProductos();
      })
      .subscribe();
  }

  function renderStats() {
    const disponibles = productos.filter(function (producto) {
      return producto.disponible !== false;
    }).length;

    $('#stat-total').textContent = String(productos.length);
    $('#stat-disponibles').textContent = String(disponibles);
    $('#stat-sin-stock').textContent = String(productos.length - disponibles);
  }

  function tarjetaAdmin(producto) {
    const categoria = categoriaPorId(producto.categoria);
    const agotado = producto.disponible === false;
    const imagen = producto.imagen_url || IMAGEN_POR_DEFECTO;

    return '<article class="producto-admin' + (agotado ? ' is-sin-stock' : '') + '">' +
      '<img class="producto-admin__img" src="' + escapar(imagen) + '" alt="" loading="lazy" ' +
      'onerror="this.onerror=null;this.src=\'' + IMAGEN_POR_DEFECTO + '\'">' +
      '<div class="producto-admin__info">' +
        '<div class="producto-admin__nombre">' + escapar(producto.nombre) + '</div>' +
        '<div class="producto-admin__meta">' +
          escapar(categoria ? categoria.nombre : 'Sin categoría') + ' · ' +
          escapar(formatearPrecio(producto.precio)) +
        '</div>' +
        '<p class="producto-admin__desc">' + escapar(producto.descripcion || '') + '</p>' +
        '<span class="badge-estado' + (agotado ? ' is-agotado' : '') + '">' +
          (agotado ? 'Sin stock' : 'Disponible') +
        '</span>' +
      '</div>' +
      '<div class="producto-admin__acciones">' +
        '<button class="btn btn--suave btn--chip" type="button" data-accion="editar" ' +
          'data-id="' + escapar(producto.id) + '">✎ Editar precio/datos</button>' +
        '<button class="btn ' + (agotado ? 'btn--primario' : 'btn--peligro') + ' btn--chip" type="button" ' +
          'data-accion="estado" data-id="' + escapar(producto.id) + '">' +
          (agotado ? '✓ Marcar disponible' : '○ Marcar sin stock') +
        '</button>' +
        '<button class="btn btn--peligro btn--chip" type="button" data-accion="eliminar" ' +
          'data-id="' + escapar(producto.id) + '">🗑 Eliminar</button>' +
      '</div>' +
    '</article>';
  }

  function renderLista() {
    const contenedor = $('#lista-productos-admin');
    if (productos.length === 0) {
      contenedor.innerHTML = '<div class="lista-vacia">Todavía no hay productos. Cargá el primero con el formulario.</div>';
      return;
    }
    contenedor.innerHTML = productos.map(tarjetaAdmin).join('');
  }

  async function guardarProducto(evento) {
    evento.preventDefault();
    mensajeFormulario('');

    const validacion = validarFormulario();
    if (!validacion.ok) {
      mensajeFormulario('❌ ' + validacion.mensaje, 'error');
      return;
    }

    const boton = $('#btn-guardar');
    const textoOriginal = archivoElegido ? 'Subiendo foto y guardando…' : 'Guardando…';
    boton.disabled = true;
    boton.textContent = textoOriginal;

    try {
      let imagenUrl = validacion.valores.imagen_url;
      let subioFotoNueva = false;
      const imagenAnterior = imagenActual;

      if (archivoElegido) {
        imagenUrl = await subirImagen(archivoElegido);
        subioFotoNueva = true;
      }

      const registro = Object.assign({}, validacion.valores, { imagen_url: imagenUrl });
      const eraEdicion = Boolean(editandoId);

      let respuesta;
      if (eraEdicion) {
        respuesta = await db.from(TABLA).update(registro).eq('id', editandoId).select();
      } else {
        respuesta = await db.from(TABLA).insert(registro).select();
      }

      if (respuesta.error) throw new Error(respuesta.error.message);

      if (subioFotoNueva && eraEdicion && imagenAnterior !== imagenUrl) {
        await borrarImagenVieja(imagenAnterior);
      }

      limpiarFormulario();
      await listarProductos();

      const texto = eraEdicion
        ? '✅ Producto actualizado correctamente.'
        : '✅ Producto agregado correctamente.';
      mensajeFormulario(texto, 'ok');
      toast(texto);
    } catch (error) {
      const texto = '❌ No se pudo guardar. ' + traducirError(error);
      mensajeFormulario(texto, 'error');
      toast('No se pudo guardar el producto.');
    } finally {
      boton.disabled = false;
      boton.textContent = editandoId ? 'Guardar cambios' : 'Publicar producto';
    }
  }

  async function manejarLista(evento) {
    const boton = evento.target.closest('[data-accion]');
    if (!boton) return;

    const id = boton.dataset.id;
    const producto = productos.find(function (item) { return String(item.id) === String(id); });
    if (!producto) return;

    if (boton.dataset.accion === 'editar') {
      llenarFormulario(producto);
      return;
    }

    if (boton.dataset.accion === 'estado') {
      const nuevoEstado = producto.disponible === false;
      const { error } = await db.from(TABLA).update({ disponible: nuevoEstado }).eq('id', id);
      if (error) {
        toast('Error: ' + error.message);
        return;
      }
      await listarProductos();
      toast(nuevoEstado ? 'Ahora está disponible.' : 'Marcado como sin stock.');
      return;
    }

    if (boton.dataset.accion === 'eliminar') {
      if (!window.confirm('¿Eliminar "' + producto.nombre + '" del catálogo?')) return;
      const { error } = await db.from(TABLA).delete().eq('id', id);
      if (error) {
        toast('No se pudo eliminar: ' + error.message);
        return;
      }
      await borrarImagenVieja(producto.imagen_url);
      if (String(editandoId) === String(id)) limpiarFormulario();
      await listarProductos();
      toast('Producto eliminado.');
    }
  }

  /* ---------- Arranque ---------- */

  function inicializar() {
    aplicarTextos();
    llenarCategorias();
    limpiarFormulario();

    $('#formulario-login').addEventListener('submit', iniciarSesion);
    $('#btn-cerrar-sesion').addEventListener('click', cerrarSesion);
    $('#formulario-producto').addEventListener('submit', guardarProducto);
    $('#btn-cancelar-editar').addEventListener('click', limpiarFormulario);
    $('#campo-imagen-archivo').addEventListener('change', vistaPreviaArchivo);
    $('#lista-productos-admin').addEventListener('click', manejarLista);
    $('#btn-recargar').addEventListener('click', listarProductos);

    inicializarAuth();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
  } else {
    inicializar();
  }
})();
