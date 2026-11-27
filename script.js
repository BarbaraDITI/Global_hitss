// ============================================================================
// 1. CONFIGURACIÓN Y CONEXIÓN A SUPABASE
// ============================================================================
const SUPABASE_URL = 'https://tjflvdvnsxmrkouleoyn.supabase.co';
const SUPABASE_ANON_KEY = 'PEGA_AQUI_TU_CLAVE_PUBLISHABLE'; // Ej: sb_publishable_...
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const URL_MICROSOFT_FORMS = "https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=CkbVXyW03kmb0PzSYnDTDHJyTl3EI1JImzWpf0AOFcFUQVRVUkRGUUlNNzhDUktCNjBSN0hQOVozWi4u";

const METAS_TIEMPO_HABLADO = {
    'Full Time': 150,
    'Part Time': 90
};

// Variables de estado global
let usuarioActivo = null;
let usuarioTemporal = null;
let gestionesDelDiaLocal = [];
let horaInicioActividad = new Date().toISOString();
let fechaToaPorDefecto = "";
let franjaToaPorDefecto = "AM1";

// Variables extraídas de TOA (Tu extractor original)
let planoExtraido = "S/N";
let subTipoExtraido = "S/N";
let codClienteExtraido = "S/N";
let direccionExtraida = "S/N";
let distritoExtraido = "S/N";

let chartHorasInstance = null;
let chartGestionesInstance = null;

// ============================================================================
// CONFIGURACIÓN CORREGIDA DE RECHAZOS (8 CATEGORÍAS ORIGINALES)
// ============================================================================
const SUBMOTIVOS_RECHAZO = {
  RECH_NO_DESEA: [
    "Cliente indica tener problemas económicos",
    "Cuenta con servicio de otro operador",
    "Demora en atención, no desea esperar",
    "Incumplimiento de fecha pactada",
    "Motivos personales, no da razones",
    "Mudanza o viaje",
    "No desea recibir a personal técnico",
    "No está de acuerdo con pago",
    "No ha contratado ningún servicio",
    "Requiere cambio de titularidad",
    "Solicitó otra fecha de instalación en la venta",
    "Técnico indujo al rechazo por mala información",
    "Tiene propuesta de otro operador"
  ],
  RECH_DUPLICIDAD: [
    "Doble SOT de diferentes puntos de venta",
    "Doble SOT del mismo punto de venta",
    "Se atendió con otra SOT",
    "Se rechazó con otra SOT"
  ],
  RECH_FACILIDADES: [
    "Ductos obstruidos",
    "Dueño de casa o edificio no autoriza instalación",
    "Sin acceso al techo, montantes u otros ambientes"
  ],
  RECH_CONTACTO: [
    "Numero equivocado, no existe o no responde"
  ],
  RECH_DIRECCION: [
    "Direccion incorrecta"
  ],
  RECH_OFERTA: [
    "Cliente solicito PostVenta (Adicionales, traslado)",
    "Equipo no autorizado para venta",
    "Paquete no es lo solicitado por el Cliente",
    "Solicita instalación compartida para 2 direcciones",
    "Tecnología incorrecta",
    "Tecnología incorrecta, cliente no acepta FTTH",
    "Tecnología incorrecta, cliente no acepta HFC",
    "Tecnología incorrecta, se genera SOT de reemplazo",
    "Velocidad supera capacidad de plano"
  ],
  RECH_SISTEMA: [
    "Campaña mal configurada, etiquetas incorrectas Duplicidad de números o etiquetas",
    "Mal generada, no genera reservas",
    "Nombre del Cliente con errores NN NN NN",
    "Sin workflow, sin tareas generadas",
    "SOT sin customer, plano, Co_id"
  ],
  RECH_FRAUDE: [
    "Cliente ya tiene un servicio activo en la misma dirección"
  ]
};

const CATEGORIAS_CONFIG = {
  CONFIRMA: [
    { id: 'CONF_LLAMADA', nombre: 'Confirma visita en llamada' },
    { id: 'CONF_ADELANTO', nombre: 'Adelanto de visita' },
    { id: 'CONF_MANTIENE', nombre: 'Mantiene fecha programada' }
  ],
  CICLO: [
    { id: 'CICLO_CONTACTO', nombre: 'Ciclo de llamadas (Falta de contacto)' }
  ],
  REPROGRAMAR: [
    { id: 'REPRO_CLIENTE', nombre: 'Reprogramado por Cliente' },
    { id: 'REPRO_CLARO', nombre: 'Reprogramado por Claro' }
  ],
  RECHAZOS: [
    { id: 'RECH_NO_DESEA', nombre: 'Cliente no desea servicio' },
    { id: 'RECH_DUPLICIDAD', nombre: 'Por duplicidad - Mesa' },
    { id: 'RECH_FACILIDADES', nombre: 'Por facilidades técnicas del cliente - Mesa' },
    { id: 'RECH_CONTACTO', nombre: 'Por falta de contacto - Mesa' },
    { id: 'RECH_DIRECCION', nombre: 'Por mal ingreso de dirección - Mesa' },
    { id: 'RECH_OFERTA', nombre: 'Por mala oferta - Mesa' },
    { id: 'RECH_SISTEMA', nombre: 'Por SOT con errores de Sistema - Mesa' },
    { id: 'RECH_FRAUDE', nombre: 'Por posible fraude - Mesa' }
  ],
  FUERA_TOA: [
    { id: 'FTOA_GENERAL', nombre: 'Plantilla Fuera de TOA' }
  ]
};

// ============================================================================
// EVALUACIÓN DE RENDIMIENTO (<60 BAJO, >61 MEDIO, >=85 CUMPLE LA META)
// ============================================================================
function evaluarEstadoRendimiento(sots, diasActivos = 1) {
    const umbralMedio = 61 * diasActivos;
    const umbralMeta = 85 * diasActivos;

    if (sots >= umbralMeta) {
        return { texto: 'CUMPLE LA META', clase: 'badge-ok', color: '#15803d', metaReferencia: umbralMeta };
    } else if (sots >= umbralMedio) {
        return { texto: 'RENDIMIENTO MEDIO', clase: 'badge-mid', color: '#d97706', metaReferencia: umbralMeta };
    } else {
        return { texto: 'RENDIMIENTO BAJO', clase: 'badge-warn', color: '#b91c1c', metaReferencia: umbralMeta };
    }
}

// ============================================================================
// 2. INICIALIZACIÓN Y EVENTOS DOM
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    const hoy = obtenerFechaLima();
    const mesActual = hoy.slice(0, 7);
    fechaToaPorDefecto = hoy;

    if (document.getElementById('admin-filtro-fecha')) document.getElementById('admin-filtro-fecha').value = hoy;
    if (document.getElementById('admin-filtro-mes')) document.getElementById('admin-filtro-mes').value = mesActual;

    const inputE = document.getElementById('input-codigo-e');
    if (inputE) {
        inputE.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                verificarCodigoE();
            }
        });
    }

    actualizarSubcategorias();

    const sesionGuardada = localStorage.getItem('sesion_hitss_v4');
    if (sesionGuardada) {
        usuarioActivo = JSON.parse(sesionGuardada);
        mostrarInterfazPorRol(usuarioActivo);
    }
});

function obtenerFechaLima() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
}

function obtenerHoraLima() {
    return parseInt(new Date().toLocaleTimeString('en-GB', { timeZone: 'America/Lima', hour: '2-digit' }), 10);
}

// ============================================================================
// 3. CONTROL DE ACCESO INTELIGENTE (SUPABASE)
// ============================================================================
async function verificarCodigoE() {
    const codigo = document.getElementById('input-codigo-e').value.toUpperCase().trim();
    if (!codigo) return mostrarToast("⚠️ Ingresa tu Usuario E");

    if (SUPABASE_ANON_KEY.includes('PEGA_AQUI')) {
        alert("❌ Falta pegar tu clave 'sb_publishable_...' en la línea 5 de script.js");
        return;
    }

    try {
        const { data: user, error } = await supabaseClient
            .from('usuarios')
            .select('*')
            .eq('codigo_e', codigo)
            .maybeSingle();

        if (error) {
            alert("Error de Supabase: " + error.message);
            return;
        }

        document.getElementById('paso-codigo').style.display = 'none';

        if (user) {
            if (!user.activo) {
                alert("Este usuario se encuentra inactivo.");
                return reiniciarLogin();
            }
            usuarioTemporal = user;
            if (user.password_pin) {
                document.getElementById('saludo-reconocido').innerText = `Hola, ${user.nombre_completo}`;
                document.getElementById('detalle-reconocido').innerText = `${user.codigo_e} • ${user.modalidad} • ${user.area}`;
                document.getElementById('paso-login').style.display = 'block';
            } else {
                document.getElementById('saludo-activar').innerText = `¡Bienvenido, ${user.nombre_completo}!`;
                document.getElementById('detalle-activar').innerText = `${user.codigo_e} • ${user.modalidad} • Área: ${user.area}`;
                document.getElementById('paso-activar').style.display = 'block';
            }
        } else {
            usuarioTemporal = { codigo_e: codigo };
            document.getElementById('paso-registro-nuevo').style.display = 'block';
        }
    } catch (err) {
        alert("Error de conexión con la base de datos: " + err.message);
    }
}

function validarPassword() {
    const pass = document.getElementById('login-pass').value.trim();
    if (pass === usuarioTemporal.password_pin) {
        completarLogin(usuarioTemporal);
    } else {
        mostrarToast("❌ Contraseña incorrecta");
    }
}

async function activarCuenta() {
    const nuevaPass = document.getElementById('nueva-pass').value.trim();
    if (nuevaPass.length < 4) return mostrarToast("⚠️ La clave debe tener al menos 4 caracteres");

    const { data, error } = await supabaseClient
        .from('usuarios')
        .update({ password_pin: nuevaPass })
        .eq('codigo_e', usuarioTemporal.codigo_e)
        .select()
        .single();

    if (error) return mostrarToast("❌ Error al activar cuenta: " + error.message);
    mostrarToast("✅ Cuenta activada correctamente");
    completarLogin(data);
}

async function registrarDesdeCero() {
    const nombre = document.getElementById('reg-nombre').value.toUpperCase().trim();
    const modalidad = document.getElementById('reg-modalidad').value;
    const area = document.getElementById('reg-area').value;
    const pass = document.getElementById('reg-pass').value.trim();

    if (!nombre || pass.length < 4) return mostrarToast("⚠️ Completa tu nombre y una clave de mínimo 4 caracteres");

    const { data, error } = await supabaseClient
        .from('usuarios')
        .insert([{
            codigo_e: usuarioTemporal.codigo_e,
            nombre_completo: nombre,
            modalidad: modalidad,
            area: area,
            password_pin: pass,
            fecha_ingreso: obtenerFechaLima(),
            rol: 'ADP',
            activo: true
        }])
        .select()
        .single();

    if (error) return mostrarToast("❌ Error al registrar: " + error.message);
    mostrarToast("✅ Registro completado");
    completarLogin(data);
}

function completarLogin(user) {
    usuarioActivo = user;
    localStorage.setItem('sesion_hitss_v4', JSON.stringify(user));
    mostrarInterfazPorRol(user);
}

function mostrarInterfazPorRol(user) {
    document.getElementById('pantalla-auth').style.display = 'none';
    document.getElementById('app-principal').style.display = 'block';
    document.getElementById('badge-rol-activo').innerText = `${user.rol} • ${user.area}`;
    document.getElementById('info-usuario-topbar').innerText = `${user.nombre_completo} (${user.codigo_e})`;

    if (user.area === 'Migraciónes' && document.getElementById('cola-manual')) {
        document.getElementById('cola-manual').value = 'MIGRACIONES';
    }

    if (user.rol === 'ADMIN') {
        document.getElementById('vista-admin').style.display = 'block';
        document.getElementById('vista-adp').style.display = 'none';
        cargarDashboardSupervisor();
    } else {
        document.getElementById('vista-adp').style.display = 'block';
        document.getElementById('vista-admin').style.display = 'none';
        cargarDatosPersonalesADP();
    }
}

function reiniciarLogin() {
    usuarioTemporal = null;
    document.getElementById('paso-codigo').style.display = 'block';
    document.getElementById('paso-login').style.display = 'none';
    document.getElementById('paso-activar').style.display = 'none';
    document.getElementById('paso-registro-nuevo').style.display = 'none';
}

function cerrarSesion() {
    localStorage.removeItem('sesion_hitss_v4');
    location.reload();
}

// ============================================================================
// 4. PROCESADOR DE TEXTO TOA (TU EXTRACTOR ORIGINAL COMPLETO)
// ============================================================================
function procesarTextoTOA() {
    const text = document.getElementById('rawInput').value;

    if (!text.trim()) {
        mostrarToast("⚠️ Pega el texto extraído de TOA");
        return;
    }

    horaInicioActividad = new Date().toISOString();

    const sotMatch = text.match(/(?:SOT|sot|Nro SOT|N° SOT|Orden)\s*[:\t\r\n]*\s*(\d+)/i) || text.match(/\b\d{8,9}\b/);
    const telMatch = text.match(/(?:Telefono|Telefono\s*Cliente|Contacto|Movil|Celular|Telefonos)\s*[:\t\r\n]*\s*(\d{7,9})/i) || text.match(/\b9\d{8}\b/);

    let cliente = "S/N";
    const clienteMatch = text.match(/Nombre\s*[:\t\r\n]+\s*([\s\S]*?)(?=\s*Tipo\s*de\s*Documento)/i);
    if (clienteMatch && clienteMatch[1]) {
        cliente = clienteMatch[1].replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
    } else {
        const clienteFallback = text.match(/(?:CLIENTE|Abonado|Cliente)\s*[:\t\r\n]*\s*([A-ZÁÉÍÓÚÑa-zñáéíóú\s.,]+)(?=\r|\n|$)/i);
        if (clienteFallback && clienteFallback[1]) {
            cliente = clienteFallback[1].trim();
        }
    }

    if (/^(CLIENTE|NOMBRE|ABONADO|S\/N)$/i.test(cliente)) cliente = "S/N";

    let contrata = "SAVAL";
    const contrataDirectaMatch = text.match(/\b(?:INST|MANT|REVI|MANTENIMIENTO)\s+([A-Z0-9]+)/i);
    if (contrataDirectaMatch && contrataDirectaMatch[1]) {
        contrata = contrataDirectaMatch[1].toUpperCase().trim();
    } else {
        const detallesMatch = text.match(/Detalles?\s+de\s+actividad[\s\S]*?\n\s*([A-Z0-9]+)/i);
        if (detallesMatch && detallesMatch[1] && !/^(DETALLES|DATOS|VELASQUEZ|ORACLE)$/i.test(detallesMatch[1])) {
            contrata = detallesMatch[1].toUpperCase().trim();
        }
    }

    // Fecha y Franja
    const fechaMatch = text.match(/(?:Fecha\s*de\s*Programacion|Fecha)\s*[:\t\r\n]*\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i) || text.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/);
    if (fechaMatch && fechaMatch[1]) {
        const partes = fechaMatch[1].split('/');
        if (partes.length === 3) {
            let dia = partes[0].padStart(2, '0');
            let mes = partes[1].padStart(2, '0');
            let anio = partes[2].length === 2 ? `20${partes[2]}` : partes[2];
            fechaToaPorDefecto = `${anio}-${mes}-${dia}`;
        }
    } else {
        fechaToaPorDefecto = obtenerFechaLima();
    }

    const franjaMatch = text.match(/\b(AM0|AM1|AM2|PM1|PM2|PM3)\b/i);
    franjaToaPorDefecto = franjaMatch ? franjaMatch[1].toUpperCase() : "AM1";

    // Variables secundarias
    const planoMatch = text.match(/(?:Plano)\s*[:\t\r\n]*\s*([A-Z0-9-]+)/i);
    if (planoMatch) planoExtraido = planoMatch[1].trim();

    const subTipoMatch = text.match(/(?:Sub\s*Tipo\s*de\s*Orden|Subtipo)\s*[:\t\r\n]*\s*([^\r\n]+)/i);
    if (subTipoMatch) subTipoExtraido = subTipoMatch[1].trim();

    const codClienteMatch = text.match(/(?:Código\s*de\s*Cliente|Cod\s*Cliente)\s*[:\t\r\n]*\s*(\d+)/i);
    if (codClienteMatch) codClienteExtraido = codClienteMatch[1].trim();

    const dirMatch = text.match(/(?:Direccion|Dirección)\s*[:\t\r\n]*\s*([^\r\n]+)/i);
    if (dirMatch) direccionExtraida = dirMatch[1].trim();

    const distMatch = text.match(/(?:Distrito)\s*[:\t\r\n]*\s*([^\r\n]+)/i);
    if (distMatch) distritoExtraido = distMatch[1].trim();

    // Detectar Departamento en el texto
    const selectDepto = document.getElementById('pvDepartamento');
    if (selectDepto) {
        const textoUpper = text.toUpperCase();
        for (let opt of selectDepto.options) {
            if (textoUpper.includes(opt.value)) {
                selectDepto.value = opt.value;
                break;
            }
        }
    }

    const sot = sotMatch ? (sotMatch[1] || sotMatch[0]) : "";
    const telefono = telMatch ? (telMatch[1] || telMatch[0]) : "";

    document.getElementById('pvSOT').value = sot;
    document.getElementById('pvTel').value = telefono;
    document.getElementById('pvCliente').value = cliente;
    document.getElementById('pvContrata').value = contrata;

    renderizarCamposDinamicos();
    actualizarFormatoHabilitarFranja();
    mostrarToast("✅ Datos de TOA procesados correctamente");
}

function obtenerClienteData() {
    return {
        sot: document.getElementById('pvSOT').value.trim() || "S/N",
        telefono: document.getElementById('pvTel').value.trim() || "S/N",
        cliente: document.getElementById('pvCliente').value.trim() || "S/N",
        contrata: document.getElementById('pvContrata').value.trim() || "SAVAL",
        departamento: document.getElementById('pvDepartamento').value || "LIMA"
    };
}

// ============================================================================
// 5. CONTROLES DINÁMICOS Y GENERACIÓN DE PLANTILLAS ORIGINALES
// ============================================================================
function actualizarSubcategorias() {
    const cat = document.getElementById('selectCategoria').value;
    const subSelect = document.getElementById('selectSubcategoria');
    if (!subSelect) return;
    subSelect.innerHTML = '';

    if (CATEGORIAS_CONFIG[cat]) {
        CATEGORIAS_CONFIG[cat].forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.id;
            opt.textContent = item.nombre;
            subSelect.appendChild(opt);
        });
    }

    renderizarCamposDinamicos();
}

function renderizarCamposDinamicos() {
    const subcat = document.getElementById('selectSubcategoria').value;
    const contenedor = document.getElementById('contenedorDinamico');
    if (!contenedor) return;
    contenedor.innerHTML = '';

    let html = '<div class="form-grid-2">';

    if (subcat.startsWith('CONF_') || subcat === 'FTOA_GENERAL') {
        html += `
            <div class="form-group">
                <label>Fecha de Visita</label>
                <input type="date" id="inputFecha">
            </div>
            <div class="form-group">
                <label>Franja Horaria</label>
                <select id="selectFranja">
                    <option value="AM0">AM0</option>
                    <option value="AM1">AM1</option>
                    <option value="AM2">AM2</option>
                    <option value="PM1">PM1</option>
                    <option value="PM2">PM2</option>
                </select>
            </div>
            <div class="form-group" style="grid-column: span 2;">
                <label>ID Llamada</label>
                <input type="text" id="inputIDLlamada" placeholder="Ej: 17909701296">
            </div>
        `;
    } else if (subcat === 'CICLO_CONTACTO') {
        html += `
            <div class="form-group">
                <label>Ciclo Nro</label>
                <input type="text" id="inputCiclo" value="1">
            </div>
            <div class="form-group">
                <label>Cant. Llamadas</label>
                <input type="text" id="inputCantLlamadas" value="4">
            </div>
            <div class="form-group">
                <label>Sub-Motivo</label>
                <select id="selectSubmotivo">
                    <option value="No contesta">No contesta</option>
                    <option value="Buzón de voz">Buzón de voz</option>
                    <option value="Número no existe">Número no existe</option>
                    <option value="Apagado">Apagado</option>
                    <option value="Corta llamada">Corta llamada</option>
                </select>
            </div>
            <div class="form-group">
                <label>ID Llamada</label>
                <input type="text" id="inputIDLlamada" placeholder="Ej: 17909701296">
            </div>
        `;
    } else if (subcat.startsWith('REPRO_')) {
        const esClaro = subcat === 'REPRO_CLARO';
        html += `
            <div class="form-group" style="grid-column: span 2;">
                <label>Motivo Reprogramación</label>
                <select id="inputMotivoDetalle">
                    ${esClaro ? `
                        <option value="# Pérdida de fecha de agendamiento"># Pérdida de fecha de agendamiento</option>
                        <option value="Errores en la generación de la SOT">Errores en la generación de la SOT</option>
                        <option value="Inconvenientes con la contratista">Inconvenientes con la contratista</option>
                        <option value="Configuraciones de TOA (OFSC)">Configuraciones de TOA (OFSC)</option>
                    ` : `
                        <option value="# Cambios en las fechas y franjas solicitadas"># Cambios en fechas/franjas solicitadas</option>
                        <option value="Facilidades del cliente">Facilidades del cliente</option>
                        <option value="Falta de contacto">Falta de contacto</option>
                        <option value="Ausente">Ausente</option>
                    `}
                </select>
            </div>
            <div class="form-group">
                <label>Nueva Fecha</label>
                <input type="date" id="inputFecha">
            </div>
            <div class="form-group">
                <label>Nueva Franja</label>
                <select id="selectFranja">
                    <option value="AM0">AM0</option>
                    <option value="AM1">AM1</option>
                    <option value="AM2">AM2</option>
                    <option value="PM1">PM1</option>
                    <option value="PM2">PM2</option>
                </select>
            </div>
            <div class="form-group">
                <label>ID Llamada</label>
                <input type="text" id="inputIDLlamada" placeholder="Ej: 17909701296">
            </div>
            <div class="form-group">
                <label>Observación</label>
                <input type="text" id="inputObs" placeholder="Observaciones adicionales...">
            </div>
        `;
    } else if (subcat.startsWith('RECH_')) {
        const clienteData = obtenerClienteData();
        const opciones = SUBMOTIVOS_RECHAZO[subcat] || [];

        if (subcat === 'RECH_DUPLICIDAD') {
            html += `
                <div class="form-group">
                    <label>Nro. SOT Duplicada Atendida</label>
                    <input type="text" id="inputSotDuplicada" placeholder="Ej: 91501234">
                </div>
                <div class="form-group">
                    <label>ID Llamada</label>
                    <input type="text" id="inputIDLlamada" placeholder="Ej: 17909701296">
                </div>
                <div class="form-group" style="grid-column: span 2;">
                    <label>Submotivo de Rechazo</label>
                    <select id="selectSubmotivoRechazo">
                        ${opciones.map(s => `<option value="${s}">${s}</option>`).join('')}
                    </select>
                </div>
            `;
        } else if (subcat === 'RECH_DIRECCION') {
            html += `
                <div class="form-group">
                    <label>Persona que Contesta</label>
                    <input type="text" id="inputPersonaContesta" value="${clienteData.cliente}">
                </div>
                <div class="form-group">
                    <label>ID Llamada</label>
                    <input type="text" id="inputIDLlamada" placeholder="Ej: 17909701296">
                </div>
                <div class="form-group" style="grid-column: span 2;">
                    <label>Dirección Correcta</label>
                    <input type="text" id="inputDireccionCorrecta" placeholder="Escribe la dirección correcta completa...">
                </div>
                <div class="form-group" style="grid-column: span 2;">
                    <label>Submotivo de Rechazo</label>
                    <select id="selectSubmotivoRechazo">
                        ${opciones.map(s => `<option value="${s}">${s}</option>`).join('')}
                    </select>
                </div>
            `;
        } else if (subcat === 'RECH_SISTEMA') {
            html += `
                <div class="form-group" style="grid-column: span 2;">
                    <label>Submotivo de Rechazo</label>
                    <select id="selectSubmotivoRechazo">
                        ${opciones.map(s => `<option value="${s}">${s}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Detalle Error de Sistema</label>
                    <input type="text" id="inputDetalleSistema" placeholder="Ej: Sin Co_id / Sin workflow">
                </div>
                <div class="form-group">
                    <label>ID Llamada</label>
                    <input type="text" id="inputIDLlamada" placeholder="Ej: 17909701296">
                </div>
            `;
        } else if (subcat === 'RECH_FRAUDE') {
            html += `
                <div class="form-group">
                    <label>Persona que Contesta</label>
                    <input type="text" id="inputPersonaContesta" value="${clienteData.cliente}">
                </div>
                <div class="form-group">
                    <label>ID Llamada</label>
                    <input type="text" id="inputIDLlamada" placeholder="Ej: 17909701296">
                </div>
                <div class="form-group">
                    <label>Customer ID / DNI</label>
                    <input type="text" id="inputCustomerID" placeholder="Ej: 44868042">
                </div>
                <div class="form-group">
                    <label>Autorizado Por</label>
                    <input type="text" id="inputAutorizadoPor" placeholder="Ej: SUPERVISOR JUAN PEREZ">
                </div>
            `;
        } else {
            html += `
                <div class="form-group">
                    <label>Persona que Contesta</label>
                    <input type="text" id="inputPersonaContesta" value="${subcat === 'RECH_CONTACTO' ? 'NO RESPONDE / SIN CONTACTO' : clienteData.cliente}">
                </div>
                <div class="form-group">
                    <label>ID Llamada</label>
                    <input type="text" id="inputIDLlamada" placeholder="Ej: 17909701296">
                </div>
                <div class="form-group" style="grid-column: span 2;">
                    <label>Submotivo de Rechazo</label>
                    <select id="selectSubmotivoRechazo">
                        ${opciones.map(s => `<option value="${s}">${s}</option>`).join('')}
                    </select>
                </div>
            `;
        }
    }

    html += '</div>';
    contenedor.innerHTML = html;

    const inputFecha = document.getElementById('inputFecha');
    if (inputFecha) {
        inputFecha.value = fechaToaPorDefecto || obtenerFechaLima();
        inputFecha.addEventListener('change', actualizarFormatoHabilitarFranja);
    }

    const selectFranja = document.getElementById('selectFranja');
    if (selectFranja) {
        const validFranja = ['AM0', 'AM1', 'AM2', 'PM1', 'PM2'].includes(franjaToaPorDefecto) ? franjaToaPorDefecto : 'AM1';
        selectFranja.value = validFranja;
        selectFranja.addEventListener('change', actualizarFormatoHabilitarFranja);
    }
}

function v(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : "";
}

function obtenerFechaYFranjaFormateada() {
    const rawFecha = v('inputFecha') || fechaToaPorDefecto || obtenerFechaLima();
    const franja = v('selectFranja') || franjaToaPorDefecto || 'AM1';

    const partes = rawFecha.split('-');
    if (partes.length === 3) {
        return `${partes[2]}/${partes[1]} ${franja}`;
    }
    return `${rawFecha} ${franja}`;
}

async function generarYGuardarPlantilla() {
    const clienteData = obtenerClienteData();
    if (!clienteData.sot || clienteData.sot === 'S/N') {
        return mostrarToast("⚠️ Ingresa o extrae el número de SOT primero");
    }

    const cat = document.getElementById('selectCategoria').value;
    const subcat = document.getElementById('selectSubcategoria').value;
    const colaManual = document.getElementById('cola-manual').value;
    const idLlamada = v('inputIDLlamada') || "S/N";
    const fechaVisita = obtenerFechaYFranjaFormateada();
    const obs = v('inputObs') || "SIN OBSERVACIONES";
    const motivoDetalle = v('inputMotivoDetalle') || "# Cambios en las fechas y franjas solicitadas";
    const personaContesta = v('inputPersonaContesta') || clienteData.cliente;
    const submotivo = v('selectSubmotivoRechazo') || v('selectSubmotivo') || motivoDetalle;
    const realizadorCompleto = `${usuarioActivo.nombre_completo.toUpperCase()} - ADP MULTISKILL HITSS`;

    let p = "";
    let gestionBD = "CONFIRMO";

    switch (subcat) {
        case 'FTOA_GENERAL':
            gestionBD = "REPROGRAMADO";
            const ftoa = `*FUERA DE TOA*\n📌 SOT: ${clienteData.sot}\n⚙️ SUB TIPO: ${subTipoExtraido}\n🏡 DIRECCIÓN: ${direccionExtraida}\n📍 DISTRITO: ${distritoExtraido}\n🛠️ SERVICIO: FTTH\n🔑 PLANO: ${planoExtraido}\n👤 CLIENTE: ${clienteData.cliente}\n🔢 COD CLIENTE: ${codClienteExtraido}\n📱 CELULAR DEL CLIENTE: ${clienteData.telefono}\n📅 FECHA Y FRANJA: ${fechaVisita}\n✍️ REALIZADO POR: ${realizadorCompleto}`;
            const repro = `MESA MULTISKILL HITSS\nREPROGRAMADO EN CAMPO / REAGENDADO POR CLIENTE\nMOTIVO DE REPROGRAMACIÓN: CLIENTE ${motivoDetalle}\nCLIENTE: ${clienteData.cliente}\nTELÉFONO: ${clienteData.telefono}\nNUEVA FECHA Y FRANJA DE VISITA: ${fechaVisita}\nOBSERVACIÓN: ${obs}\nCONTRATA: ${clienteData.contrata}\nREALIZADO POR: ${usuarioActivo.nombre_completo.toUpperCase()}\nCÓD LLAMADA: ${idLlamada}`;
            p = `${ftoa}\n\n===================================\n\n${repro}`;
            break;

        case 'CONF_LLAMADA':
            gestionBD = "CONFIRMO";
            p = `MESA MULTISKILL HITSS - CONFIRMA VISITA\nSOT: ${clienteData.sot}\nDÍA Y FRANJA: ${fechaVisita}\nCLIENTE: ${clienteData.cliente}\nNUMERO: ${clienteData.telefono}\nCONTRATA: ${clienteData.contrata}\nID DE LLAMADA: ${idLlamada}\nREALIZADO POR: ${usuarioActivo.nombre_completo.toUpperCase()}`;
            break;
        case 'CONF_ADELANTO':
            gestionBD = "CONFIRMO";
            p = `MESA MULTISKILL HITSS - ADELANTA VISITA\nSOT: ${clienteData.sot}\nDÍA Y FRANJA: ${fechaVisita}\nCLIENTE: ${clienteData.cliente}\nNUMERO: ${clienteData.telefono}\nCONTRATA: ${clienteData.contrata}\nID DE LLAMADA: ${idLlamada}\nREALIZADO POR: ${realizadorCompleto}`;
            break;
        case 'CONF_MANTIENE':
            gestionBD = "CONFIRMO";
            p = `MESA MULTISKILL HITSS - MANTIENE FECHA DE VISITA\nSOT: ${clienteData.sot}\nDÍA Y FRANJA: ${fechaVisita}\nCLIENTE: ${clienteData.cliente}\nNUMERO: ${clienteData.telefono}\nCONTRATA: ${clienteData.contrata}\nID DE LLAMADA: ${idLlamada}\nREALIZADO POR: ${usuarioActivo.nombre_completo.toUpperCase()}`;
            break;
        case 'CICLO_CONTACTO':
            gestionBD = "NO CONTESTA";
            p = `MESA MULTISKILL HITSS - CICLO DE LLAMADAS\nCICLO DE LLAMADA NRO: ${v('inputCiclo') || '1'}\nCANTIDAD DE LLAMADAS: ${v('inputCantLlamadas') || '4'}\nNUMERO: ${clienteData.telefono}\nMOTIVO: FALTA DE CONTACTO\nSUB-MOTIVO: ${v('selectSubmotivo')}\nID DE LLAMADA: ${idLlamada}\nREALIZADO POR: ${realizadorCompleto}`;
            break;
        case 'REPRO_CLIENTE':
            gestionBD = "REPROGRAMADO";
            p = `MESA MULTISKILL HITSS\nREPROGRAMADO EN MESA / REAGENDADO POR CLIENTE\nMOTIVO DE REPROGRAMACIÓN: CLIENTE ${motivoDetalle}\nCLIENTE: ${clienteData.cliente}\nTELÉFONO: ${clienteData.telefono}\nNUEVA FECHA Y FRANJA DE VISITA: ${fechaVisita}\nOBSERVACIÓN: ${obs}\nCONTRATA: ${clienteData.contrata}\nREALIZADO POR: ${realizadorCompleto}\nCÓD LLAMADA: ${idLlamada}`;
            break;
        case 'REPRO_CLARO':
            gestionBD = "REPROGRAMADO";
            p = `MESA MULTISKILL HITSS\nREPROGRAMADO EN MESA / REAGENDADO POR CLARO\nMOTIVO DE REPROGRAMACIÓN: CLARO ${motivoDetalle}\nCLIENTE: ${clienteData.cliente}\nTELÉFONO: ${clienteData.telefono}\nNUEVA FECHA Y FRANJA DE VISITA: ${fechaVisita}\nOBSERVACIÓN: ${obs}\nCONTRATA: ${clienteData.contrata}\nREALIZADO POR: ${realizadorCompleto}\nCÓD LLAMADA: ${idLlamada}`;
            break;
        case 'RECH_NO_DESEA':
            gestionBD = "RECHAZADO";
            p = `MESA MULTISKILL HITSS\nRECHAZO EN MESA / CAMPO: RECHAZO EN MESA\nPERSONA QUE CONTESTA: ${personaContesta}\nNUMERO DE CONTACTO: ${clienteData.telefono}\nMOTIVO DEL RECHAZO: CLIENTE NO DESEA EL SERVICIO - MESA\nSUBMOTIVO DE RECHAZO: ${submotivo}\nID DE LLAMADA: ${idLlamada}\nREALIZADO POR: ${realizadorCompleto}`;
            break;
        case 'RECH_DUPLICIDAD':
            gestionBD = "RECHAZADO";
            p = `MESA MULTISKILL HITSS\nRECHAZO EN MESA / CAMPO: RECHAZADO EN MESA\nNUMERO DE CONTACTO: ${clienteData.telefono}\nMOTIVO DEL RECHAZO: RECHAZADO POR DUPLICIDAD\nSUBMOTIVO DE RECHAZO: ${submotivo}\nSE PROCEDE AL RECHAZO DE LA SOLICITUD POR DUPLICIDAD DE SOT, SE ATENDIÓ CON LA SOT: ${v('inputSotDuplicada') || 'S/N'}\nID DE LLAMADA: ${idLlamada}\nREALIZADO POR: ${realizadorCompleto}`;
            break;
        case 'RECH_FACILIDADES':
            gestionBD = "RECHAZADO";
            p = `MESA MULTISKILL HITSS\nRECHAZO EN MESA / CAMPO: RECHAZADO EN MESA\nPERSONA QUE CONTESTA: ${personaContesta}\nNUMERO DE CONTACTO: ${clienteData.telefono}\nMOTIVO DEL RECHAZO: FACILIDADES TÉCNICAS DEL CLIENTE\nSUBMOTIVO DE RECHAZO: ${submotivo}\nID DE LLAMADA: ${idLlamada}\nREALIZADO POR: ${realizadorCompleto}`;
            break;
        case 'RECH_CONTACTO':
            gestionBD = "RECHAZADO";
            p = `MESA MULTISKILL HITSS\nRECHAZO EN MESA / CAMPO: RECHAZO EN MESA\nPERSONA QUE CONTESTA: ${personaContesta}\nNUMERO DE CONTACTO: ${clienteData.telefono}\nMOTIVO DEL RECHAZO: FALTA DE CONTACTO\nSUBMOTIVO DE RECHAZO: ${submotivo}\nID DE LLAMADA: ${idLlamada}\nREALIZADO POR: ${realizadorCompleto}`;
            break;
        case 'RECH_DIRECCION':
            gestionBD = "RECHAZADO";
            p = `MESA MULTISKILL HITSS\nRECHAZO EN MESA / CAMPO: RECHAZADO EN MESA\nPERSONA QUE CONTESTA: ${personaContesta}\nNUMERO DE CONTACTO: ${clienteData.telefono}\nMOTIVO DEL RECHAZO: MAL INGRESO DE DIRECCIÓN\nDIRECCIÓN CORRECTA: ${v('inputDireccionCorrecta') || 'S/N'}\nSUBMOTIVO DE RECHAZO: ${submotivo}\nID DE LLAMADA: ${idLlamada}\nREALIZADO POR: ${realizadorCompleto}`;
            break;
        case 'RECH_OFERTA':
            gestionBD = "RECHAZADO";
            p = `MESA MULTISKILL HITSS\nRECHAZO EN MESA / CAMPO: RECHAZADO EN MESA\nPERSONA QUE CONTESTA: ${personaContesta}\nNUMERO DE CONTACTO: ${clienteData.telefono}\nMOTIVO DEL RECHAZO: MALA OFERTA\nSUBMOTIVO DE RECHAZO: ${submotivo}\nID DE LLAMADA: ${idLlamada}\nREALIZADO POR: ${realizadorCompleto}`;
            break;
        case 'RECH_SISTEMA':
            gestionBD = "RECHAZADO";
            p = `MESA MULTISKILL HITSS\nRECHAZO EN MESA / CAMPO: RECHAZADO EN MESA\nMOTIVO DEL RECHAZO: SOT CON ERRORES EN EL SISTEMA\nSUBMOTIVO DE RECHAZO: ${submotivo}\nSE PROCEDE AL RECHAZO DE LA SOLICITUD POR TENER ERRORES DE SISTEMAS\nID DE LLAMADA: ${idLlamada}\nREALIZADO POR: ${realizadorCompleto}`;
            break;
        case 'RECH_FRAUDE':
            gestionBD = "RECHAZADO";
            p = `MESA MULTISKILL HITSS\nRECHAZO EN MESA / CAMPO: RECHAZADO EN MESA\nPERSONA QUE CONTESTA: ${personaContesta}\nNUMERO DE CONTACTO: ${clienteData.telefono}\nMOTIVO DEL RECHAZO: POSIBLE FRAUDE\nSUBMOTIVO DE RECHAZO: Cliente ya tiene un servicio activo en la misma dirección\nCUSTOMER ID: ${v('inputCustomerID') || 'S/N'}\nAUTORIZADO POR: ${v('inputAutorizadoPor') || 'S/N'}\nID DE LLAMADA: ${idLlamada}\nREALIZADO POR: ${realizadorCompleto}`;
            break;
    }

    document.getElementById('outputPlantilla').value = p;
    actualizarFormatoHabilitarFranja();

    try { await navigator.clipboard.writeText(p); } catch (e) {}

    const yaTieneGestionHoy = gestionesDelDiaLocal.some(g => g.sot === clienteData.sot) ? 'SI' : 'NO';
    if (yaTieneGestionHoy === 'SI') {
        if (!confirm(`⚠️ La SOT ${clienteData.sot} ya registra una gestión previa hoy (se marcará ¿YA TIENE GESTION? = SI). ¿Continuar?`)) return;
    }

    const fechaDeseaCliente = v('inputFecha') || fechaToaPorDefecto || obtenerFechaLima();
    const franjaRaw = v('selectFranja') || franjaToaPorDefecto || 'AM1';
    const franjaBD = ['AM0', 'AM1', 'AM2', 'PM1', 'PM2'].includes(franjaRaw) ? franjaRaw : 'AM1';
    const abrirForms = document.getElementById('check-abrir-forms').checked;
    const ahora = new Date();

    const { error } = await supabaseClient.from('gestiones_sot').insert([{
        usuario_e: usuarioActivo.codigo_e,
        sot: clienteData.sot,
        fecha_desea_cliente: fechaDeseaCliente,
        franja: franjaBD,
        hora_inicio: horaInicioActividad,
        hora_finalizacion: ahora.toISOString(),
        fecha_gestion: obtenerFechaLima(),
        intervalo: obtenerHoraLima(),
        gestion: gestionBD,
        submotivo: submotivo || cat,
        departamento: clienteData.departamento,
        ya_tiene_gestion: yaTieneGestionHoy,
        sot_gestionada_manual: colaManual,
        id_llamada: idLlamada,
        cliente_nombre: clienteData.cliente,
        telefono_cliente: clienteData.telefono,
        contrata: clienteData.contrata,
        enviado_forms: abrirForms
    }]);

    horaInicioActividad = new Date().toISOString();

    if (error) {
        mostrarToast("⚠️ Plantilla copiada, pero falló guardado en nube: " + error.message);
    } else {
        mostrarToast("✅ Plantilla copiada y SOT registrada en BD");
        cargarDatosPersonalesADP();
    }

    if (abrirForms) abrirMicrosoftForms();
}

function actualizarFormatoHabilitarFranja() {
    const clienteData = obtenerClienteData();
    const fechaVisita = obtenerFechaYFranjaFormateada();
    const supCargo = v('inputSupCargo') || "SIN ASIGNAR";

    const formato = `MESA MULTISKILL HITSS - FORMATO PARA HABILITAR FRANJA\n📥 SOT: ${clienteData.sot}\n🪚 PLANO: ${planoExtraido}\n📅 FECHA Y FRANJA: ${fechaVisita}\n📧 Motivo: SIN FRANJAS DISPONIBLES\n🚨 Sup acargo: ${supCargo}`;
    const elHabilitar = document.getElementById('outputHabilitarFranja');
    if (elHabilitar) elHabilitar.value = formato;
}

function limpiarColumnas1y2() {
    const rawInput = document.getElementById('rawInput');
    if (rawInput) rawInput.value = '';
    ['pvSOT', 'pvTel', 'pvCliente', 'pvContrata', 'outputPlantilla', 'outputHabilitarFranja'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    planoExtraido = "S/N";
    subTipoExtraido = "S/N";
    codClienteExtraido = "S/N";
    direccionExtraida = "S/N";
    distritoExtraido = "S/N";
    mostrarToast("🧹 Campos limpiados");
}

function abrirMicrosoftForms() {
    window.open(URL_MICROSOFT_FORMS, '_blank');
}

// ============================================================================
// 6. PANEL PERSONAL DEL ADP (CON NUEVAS REGLAS <60, >61, >=85)
// ============================================================================
function calcularMinutosHablados(listaGestiones) {
    return listaGestiones.reduce((total, g) => {
        if (g.hora_inicio && g.hora_finalizacion) {
            const diff = (new Date(g.hora_finalizacion) - new Date(g.hora_inicio)) / 60000;
            if (diff > 0.2 && diff <= 25) return total + diff;
        }
        return total + (g.gestion === 'NO CONTESTA' ? 0.8 : 2.3);
    }, 0);
}

async function cargarDatosPersonalesADP() {
    const hoy = obtenerFechaLima();

    const { data: todasHoy, error } = await supabaseClient
        .from('gestiones_sot')
        .select('*')
        .eq('fecha_gestion', hoy)
        .order('hora_finalizacion', { ascending: true });

    if (error) return console.error(error);

    gestionesDelDiaLocal = todasHoy.filter(g => g.usuario_e === usuarioActivo.codigo_e);
    const totalMio = gestionesDelDiaLocal.length;
    const estadoRend = evaluarEstadoRendimiento(totalMio, 1);
    const metaTiempo = METAS_TIEMPO_HABLADO[usuarioActivo.modalidad] || 150;
    const minHablados = Math.round(calcularMinutosHablados(gestionesDelDiaLocal));

    let cadenciaTxt = "Sin registros";
    if (totalMio > 1) {
        const t1 = new Date(gestionesDelDiaLocal[0].hora_finalizacion);
        const t2 = new Date(gestionesDelDiaLocal[totalMio - 1].hora_finalizacion);
        const promMin = (((t2 - t1) / 60000) / (totalMio - 1)).toFixed(1);
        cadenciaTxt = `1 SOT cada ${promMin} min`;
    } else if (totalMio === 1) {
        cadenciaTxt = "1er registro del turno";
    }

    const conteoPorAsesor = {};
    todasHoy.forEach(g => {
        conteoPorAsesor[g.usuario_e] = (conteoPorAsesor[g.usuario_e] || 0) + 1;
    });
    const rankingOrdenado = Object.entries(conteoPorAsesor).sort((a, b) => b[1] - a[1]);
    const miPosicion = rankingOrdenado.findIndex(item => item[0] === usuarioActivo.codigo_e) + 1;

    document.getElementById('adp-avance-hoy').innerText = `${totalMio} / 85 SOTs`;
    const elEstado = document.getElementById('adp-estado-rendimiento');
    if (elEstado) {
        elEstado.innerText = estadoRend.texto;
        elEstado.style.color = estadoRend.color;
    }
    document.getElementById('adp-tiempo-hablado').innerText = `${minHablados} / ${metaTiempo} min`;
    document.getElementById('adp-cadencia').innerText = cadenciaTxt;
    document.getElementById('adp-ranking').innerText = miPosicion > 0 ? `Puesto #${miPosicion} de ${rankingOrdenado.length}` : 'Sin ranking aún';

    const contenedorBloc = document.getElementById('lista-bloc');
    document.getElementById('contador-bloc').innerText = `Total: ${totalMio}`;

    if (totalMio === 0) {
        contenedorBloc.innerHTML = `<p class="empty-msg">Aún no hay gestiones registradas hoy.</p>`;
        return;
    }

    contenedorBloc.innerHTML = gestionesDelDiaLocal.map((g, index) => {
        const hora = new Date(g.hora_finalizacion).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
        return `<div class="bloc-item"><strong>${index + 1}. SOT: ${g.sot}</strong> [${hora}] • ${g.franja}\nEstado: <strong>${g.gestion}</strong> (${g.sot_gestionada_manual})\nMotivo: ${g.submotivo}\n************************************</div>`;
    }).join('');
}

function exportarBlocTXT() {
    if (gestionesDelDiaLocal.length === 0) return mostrarToast("⚠️ No hay registros para exportar");
    const hoy = obtenerFechaLima();
    let contenido = `REPORTE DIARIO MESA MULTISKILL HITSS\nASESOR: ${usuarioActivo.nombre_completo} (${usuarioActivo.codigo_e})\nFECHA: ${hoy}\n====================================\n\n`;

    gestionesDelDiaLocal.forEach((g, idx) => {
        contenido += `${idx + 1}.\nSOT: ${g.sot}\nGestion: ${g.gestion}\nFranja: ${g.franja}\nDepartamento: ${g.departamento}\nCola: ${g.sot_gestionada_manual}\nMotivo: ${g.submotivo}\nID Llamada: ${g.id_llamada}\n************************************\n`;
    });

    const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Registro_Gestiones_${usuarioActivo.codigo_e}_${hoy}.txt`;
    link.click();
}

// ============================================================================
// 7. DASHBOARD GERENCIAL DEL ADMINISTRADOR (PAGINACIÓN + NUEVAS REGLAS KPI)
// ============================================================================
function cambiarModoFiltroAdmin() {
    const modo = document.getElementById('admin-modo-filtro').value;
    document.getElementById('admin-filtro-fecha').style.display = modo === 'dia' ? 'inline-block' : 'none';
    document.getElementById('admin-filtro-mes').style.display = modo === 'mes' ? 'inline-block' : 'none';
    cargarDashboardSupervisor();
}

function calcularMesesAntiguedad(fechaIngresoStr) {
    if (!fechaIngresoStr) return '0 m';
    const ingreso = new Date(fechaIngresoStr);
    const hoy = new Date();
    const meses = (hoy.getFullYear() - ingreso.getFullYear()) * 12 + (hoy.getMonth() - ingreso.getMonth());
    return `${Math.max(0, meses)} m`;
}

// Obtener TODAS las filas paginando de 1,000 en 1,000 para leer las 37,549 filas
async function obtenerTodasLasGestionesFiltradas(modo) {
    let todas = [];
    let desde = 0;
    const paso = 1000;

    while (true) {
        let q = supabaseClient.from('gestiones_sot').select('*').range(desde, desde + paso - 1);
        if (modo === 'dia') {
            const fecha = document.getElementById('admin-filtro-fecha').value;
            q = q.eq('fecha_gestion', fecha);
        } else if (modo === 'mes') {
            const mes = document.getElementById('admin-filtro-mes').value;
            q = q.gte('fecha_gestion', `${mes}-01`).lte('fecha_gestion', `${mes}-31`);
        }

        const { data, error } = await q;
        if (error) {
            console.error(error);
            break;
        }
        if (!data || data.length === 0) break;
        todas = todas.concat(data);
        if (data.length < paso) break;
        desde += paso;
    }
    return todas;
}

async function cargarDashboardSupervisor() {
    const modo = document.getElementById('admin-modo-filtro').value;
    const filtroArea = document.getElementById('admin-filtro-area').value;

    let queryAsesores = supabaseClient.from('usuarios').select('*').eq('rol', 'ADP').eq('activo', true);
    if (filtroArea !== 'TODAS') queryAsesores = queryAsesores.eq('area', filtroArea);
    const { data: asesores } = await queryAsesores;

    const gestiones = await obtenerTodasLasGestionesFiltradas(modo);

    let diasActivos = 1;
    if (modo !== 'dia' && gestiones.length > 0) {
        const fechasUnicas = new Set(gestiones.map(g => g.fecha_gestion));
        diasActivos = Math.max(1, fechasUnicas.size);
    }

    const filasProcesadas = (asesores || []).map(adp => {
        const susGestiones = gestiones
            .filter(g => g.usuario_e === adp.codigo_e)
            .sort((a, b) => new Date(a.hora_finalizacion) - new Date(b.hora_finalizacion));

        const total = susGestiones.length;
        // Calcular días trabajados por ese asesor en el rango para evaluar su promedio diario
        const diasDelAsesor = modo === 'dia' ? 1 : Math.max(1, new Set(susGestiones.map(g => g.fecha_gestion)).size);
        const estadoRend = evaluarEstadoRendimiento(total, diasDelAsesor);

        const metaMin = (METAS_TIEMPO_HABLADO[adp.modalidad] || 150) * diasDelAsesor;
        const minHablados = Math.round(calcularMinutosHablados(susGestiones));

        let cadenciaMin = null;
        if (total > 1) {
            const diffMin = (new Date(susGestiones[total - 1].hora_finalizacion) - new Date(susGestiones[0].hora_finalizacion)) / 60000;
            if (diffMin > 0) cadenciaMin = (diffMin / (total - 1)).toFixed(1);
        }

        const horas = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map(h => susGestiones.filter(g => g.intervalo === h).length);
        horas.push(susGestiones.filter(g => g.intervalo >= 20).length);

        const conf = susGestiones.filter(g => g.gestion === 'CONFIRMO').length;
        const noCont = susGestiones.filter(g => g.gestion === 'NO CONTESTA').length;
        const rech = susGestiones.filter(g => g.gestion === 'RECHAZADO').length;
        const repro = susGestiones.filter(g => g.gestion === 'REPROGRAMADO').length;

        return { adp, total, estadoRend, minHablados, metaMin, cadenciaMin, horas, conf, noCont, rech, repro };
    }).sort((a, b) => b.total - a.total);

    const totalMesa = filasProcesadas.reduce((acc, f) => acc + f.total, 0);
    const totalConf = filasProcesadas.reduce((acc, f) => acc + f.conf, 0);
    const totalNoCont = filasProcesadas.reduce((acc, f) => acc + f.noCont, 0);
    const totalRech = filasProcesadas.reduce((acc, f) => acc + f.rech, 0);
    const totalRepro = filasProcesadas.reduce((acc, f) => acc + f.repro, 0);
    const totalContactados = totalConf + totalRech + totalRepro;

    const pctConf = totalMesa > 0 ? Math.round((totalConf / totalMesa) * 100) : 0;
    const pctContactabilidad = totalMesa > 0 ? Math.round((totalContactados / totalMesa) * 100) : 0;

    const totalCumplenMeta = filasProcesadas.filter(f => f.estadoRend.texto === 'CUMPLE LA META').length;
    const totalMedio = filasProcesadas.filter(f => f.estadoRend.texto === 'RENDIMIENTO MEDIO').length;

    const promMinHablados = filasProcesadas.length > 0
        ? Math.round(filasProcesadas.reduce((a, f) => a + f.minHablados, 0) / filasProcesadas.length)
        : 0;

    document.getElementById('kpi-global-sots').innerText = totalMesa.toLocaleString('es-PE');
    document.getElementById('kpi-global-efectividad').innerText = `${pctConf}% / ${pctContactabilidad}%`;
    document.getElementById('kpi-global-cumplen').innerText = `${totalCumplenMeta} Meta / ${totalMedio} Medio`;
    document.getElementById('kpi-global-cadencia').innerText = `${promMinHablados} min prom.`;

    renderizarGraficasAdmin(filasProcesadas, { totalConf, totalNoCont, totalRech, totalRepro });

    const tbody = document.getElementById('tabla-admin-body');
    tbody.innerHTML = filasProcesadas.map((f, idx) => `
        <tr>
            <td><strong>#${idx + 1}</strong></td>
            <td>${f.adp.nombre_completo}</td>
            <td>${calcularMesesAntiguedad(f.adp.fecha_ingreso)}</td>
            <td>${f.adp.modalidad === 'Full Time' ? 'FT' : 'PT'}</td>
            <td>${f.adp.area}</td>
            ${f.horas.map(c => `<td>${c > 0 ? c : ''}</td>`).join('')}
            <td><strong>${f.conf}</strong></td>
            <td>${f.noCont}</td>
            <td>${f.rech}</td>
            <td>${f.repro}</td>
            <td><strong>${f.total}</strong> / ${f.estadoRend.metaReferencia}</td>
            <td><strong>${f.minHablados}</strong> / ${f.metaMin}m</td>
            <td><span class="${f.estadoRend.clase}" style="background:${f.estadoRend.color}20; color:${f.estadoRend.color}; padding:3px 7px; border-radius:5px; font-weight:700;">${f.estadoRend.texto}</span></td>
            <td>${f.cadenciaMin ? `${f.cadenciaMin}m` : '-'}</td>
        </tr>
    `).join('');
}

function renderizarGraficasAdmin(filas, totalesGestion) {
    if (typeof Chart === 'undefined') return;

    const etiquetasHoras = ['07h','08h','09h','10h','11h','12h','13h','14h','15h','16h','17h','18h','19h','20h+'];
    const sumaPorHora = etiquetasHoras.map((_, i) => filas.reduce((acc, f) => acc + f.horas[i], 0));

    const ctxHoras = document.getElementById('grafico-horas').getContext('2d');
    if (chartHorasInstance) chartHorasInstance.destroy();
    chartHorasInstance = new Chart(ctxHoras, {
        type: 'bar',
        data: {
            labels: etiquetasHoras,
            datasets: [{
                label: 'SOTs Gestionadas por Hora',
                data: sumaPorHora,
                backgroundColor: '#14532d',
                borderColor: '#d97706',
                borderWidth: 1,
                borderRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { title: { display: true, text: '🎄 Producción por Franja Horaria (07:00 - 20:00+)' } }
        }
    });

    const ctxGest = document.getElementById('grafico-gestiones').getContext('2d');
    if (chartGestionesInstance) chartGestionesInstance.destroy();
    chartGestionesInstance = new Chart(ctxGest, {
        type: 'doughnut',
        data: {
            labels: ['CONFIRMO', 'NO CONTESTA', 'RECHAZADO', 'REPROGRAMADO'],
            datasets: [{
                data: [totalesGestion.totalConf, totalesGestion.totalNoCont, totalesGestion.totalRech, totalesGestion.totalRepro],
                backgroundColor: ['#15803d', '#d97706', '#b91c1c', '#2563eb']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { title: { display: true, text: '📊 Distribución de Resultados' } }
        }
    });
}

function exportarReporteAdminCSV() {
    const tabla = document.getElementById('tabla-reporte-admin');
    let csv = [];
    for (let row of tabla.rows) {
        let cols = Array.from(row.cells).map(c => `"${c.innerText.replace(/\n/g, ' ')}"`);
        csv.push(cols.join(','));
    }
    const blob = new Blob(["\uFEFF" + csv.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Reporte_Productividad_HITSS_${obtenerFechaLima()}.csv`;
    link.click();
}

// ============================================================================
// 8. UTILIDADES
// ============================================================================
function copiarTextoElemento(id) {
    const el = document.getElementById(id);
    if (!el || !el.value) return mostrarToast("⚠️ No hay texto para copiar");
    navigator.clipboard.writeText(el.value);
    mostrarToast("📋 Texto copiado al portapapeles");
}

function alternarTema() {
    document.body.classList.toggle('dark-mode');
    const esOscuro = document.body.classList.contains('dark-mode');
    document.getElementById('btn-tema').innerText = esOscuro ? '☀️ Claro' : '🌙 Oscuro';
}

function mostrarToast(msg) {
    const t = document.getElementById('toast');
    t.innerText = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}
