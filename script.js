// ============================================================================
// 1. CONFIGURACIÓN Y CONEXIÓN A SUPABASE
// ============================================================================
const SUPABASE_URL = 'https://tjflvdvnsxmrkouleoyn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_-1DlkWkPrU2UeogbcApIzQ_NUVR58_4'; // Ej: sb_publishable_...
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const URL_MICROSOFT_FORMS = "https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=CkbVXyW03kmb0PzSYnDTDHJyTl3EI1JImzWpf0AOFcFUQVRVUkRGUUlNNzhDUktCNjBSN0hQOVozWi4u";

// NUEVAS METAS OPERATIVAS ACTUALIZADAS
const METAS_DIARIAS = {
    'Full Time': { sots: 85, minutosHablados: 150 },
    'Part Time': { sots: 45, minutosHablados: 90 }
};

const SUBMOTIVOS_CONFIG = {
    'CONFIRMO': [
        'Confirma visita con titular en llamada',
        'Confirma visita con familiar autorizado',
        'Confirma adelanto de visita (AM0)'
    ],
    'NO CONTESTA': [
        'Ciclo 1 - No contesta / Buzón de voz',
        'Ciclo 2 - Corta llamada / Sin audio',
        'Ciclo 3 - Número equivocado / Fuera de servicio'
    ],
    'REPROGRAMADO': [
        'Reprogramación a solicitud del cliente',
        'Reprogramación por falta de cuota técnica',
        'Reprogramación por incidencia externa'
    ],
    'RECHAZADO': [
        '1. Cliente ya cuenta con servicio instalado',
        '2. Desiste del servicio por demora',
        '3. Dirección errada / Sin cobertura técnica',
        '4. Titular no reconoce solicitud de venta',
        '5. Duplicidad de SOT en sistema',
        '6. Cliente solicita baja / cancelación',
        '7. Falta de facilidades técnicas en domicilio',
        '8. Fuera de zona de atención asignada'
    ]
};

let usuarioActivo = null;
let usuarioTemporal = null;
let gestionesDelDiaLocal = [];
let horaInicioActividad = new Date().toISOString();
let chartHorasInstance = null;
let chartGestionesInstance = null;

// ============================================================================
// 2. INICIALIZACIÓN
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    const hoy = obtenerFechaLima();
    const mesActual = hoy.slice(0, 7);
    
    if (document.getElementById('fecha-visita')) document.getElementById('fecha-visita').value = hoy;
    if (document.getElementById('admin-filtro-fecha')) document.getElementById('admin-filtro-fecha').value = hoy;
    if (document.getElementById('admin-filtro-mes')) document.getElementById('admin-filtro-mes').value = mesActual;
    
    actualizarSubcategorias();

    const sesionGuardada = localStorage.getItem('sesion_hitss_v3');
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
// 3. CONTROL DE ACCESO INTELIGENTE
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
    localStorage.setItem('sesion_hitss_v3', JSON.stringify(user));
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
    localStorage.removeItem('sesion_hitss_v3');
    location.reload();
}

// ============================================================================
// 4. OPERACIÓN DEL ASESOR
// ============================================================================
async function procesarCSVHistorico() {
    const fileInput = document.getElementById('archivo-csv-historico');
    const status = document.getElementById('estado-importacion');
    if (!fileInput.files.length) return alert("Selecciona primero el archivo .csv exportado de tu Excel.");

    status.innerText = "⏳ Leyendo archivo y analizando columnas...";
    const text = await fileInput.files[0].text();
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) {
        status.innerText = "❌ El archivo está vacío.";
        return;
    }

    // Buscar automáticamente la fila de encabezados (contiene SOT y USUARIO)
    let headerIdx = lines.findIndex(l => l.toUpperCase().includes('SOT') && l.toUpperCase().includes('USUARIO'));
    if (headerIdx === -1) headerIdx = 0;

    const headerLine = lines[headerIdx];
    const sep = (headerLine.match(/;/g) || []).length >= (headerLine.match(/,/g) || []).length ? ';' : ',';
    const headers = headerLine.split(sep).map(h => h.trim().toUpperCase().replace(/^"|"$/g, '').replace(/\s+/g, ' '));

    // Buscar columnas de usuario y SOT de forma flexible
    const colUsuario = headers.find(h => h === 'USUARIO' || h === 'USUARIO E' || h === 'USUARIO_E' || h.includes('CODIGO') || h.includes('ASESOR'));
    const colSot = headers.find(h => h === 'SOT' || h.includes('SOT'));

    if (!colUsuario || !colSot) {
        status.innerText = `❌ No se detectaron columnas USUARIO y SOT. Encabezados leídos: ${headers.slice(0, 8).join(' | ')}`;
        return;
    }

    const { data: usuariosValidos, error: errUsers } = await supabaseClient.from('usuarios').select('codigo_e');
    if (errUsers) {
        status.innerText = "❌ Error consultando usuarios en Supabase: " + errUsers.message;
        return;
    }

    // Normalizar códigos E (sin guiones ni espacios) para cruzar sin fallos
    const mapaUsuarios = new Map();
    (usuariosValidos || []).forEach(u => {
        const norm = u.codigo_e.toUpperCase().replace(/[^A-Z0-9]/g, '');
        mapaUsuarios.set(norm, u.codigo_e);
    });

    const registros = [];
    let ejemploNoEncontrado = '';

    for (let i = headerIdx + 1; i < lines.length; i++) {
        const cols = lines[i].split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
        const row = {};
        headers.forEach((h, idx) => row[h] = cols[idx] || '');

        const rawUser = (row[colUsuario] || '').toUpperCase().trim();
        const userNorm = rawUser.replace(/[^A-Z0-9]/g, '');
        const sot = (row[colSot] || '').trim();

        if (!userNorm || !sot) continue;

        if (!mapaUsuarios.has(userNorm)) {
            if (!ejemploNoEncontrado) ejemploNoEncontrado = rawUser;
            continue;
        }

        const codigoExactoBD = mapaUsuarios.get(userNorm);

        let gestion = (row['GESTION'] || row['GESTIÓN'] || 'CONFIRMO').toUpperCase().trim();
        if (!['CONFIRMO', 'NO CONTESTA', 'RECHAZADO', 'REPROGRAMADO'].includes(gestion)) {
            if (gestion.includes('NO CONT')) gestion = 'NO CONTESTA';
            else if (gestion.includes('RECH')) gestion = 'RECHAZADO';
            else if (gestion.includes('REPRO')) gestion = 'REPROGRAMADO';
            else gestion = 'CONFIRMO';
        }

        let franja = (row['FRANJA'] || 'AM1').toUpperCase().trim();
        if (!['AM0', 'AM1', 'AM2', 'PM1', 'PM2'].includes(franja)) franja = 'AM1';

        const fechaRaw = (row['FECHA DE GESTION'] || row['FECHA_GESTION'] || row['FECHA'] || obtenerFechaLima()).split(' ')[0];
        let fechaNorm = obtenerFechaLima();
        if (fechaRaw.includes('/')) {
            const p = fechaRaw.split('/');
            if (p.length === 3) fechaNorm = `${p[2].padStart(4, '20')}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
        } else if (fechaRaw.includes('-')) {
            fechaNorm = fechaRaw;
        }

        const intervalo = parseInt(row['INTERVALO'] || '10', 10) || 10;

        registros.push({
            usuario_e: codigoExactoBD,
            sot: sot,
            fecha_desea_cliente: fechaNorm,
            franja: franja,
            fecha_gestion: fechaNorm,
            intervalo: Math.min(23, Math.max(0, intervalo)),
            gestion: gestion,
            submotivo: row['SUBMOTIVO'] || 'Importado de Excel histórico',
            departamento: (row['DEPARTAMENTO'] || 'LIMA').toUpperCase(),
            ya_tiene_gestion: (row['¿YA TIENE GESTION?'] || row['YA TIENE GESTION'] || 'NO').toUpperCase() === 'SI' ? 'SI' : 'NO',
            sot_gestionada_manual: row['SOT GESTIONADA MANUAL'] || 'PROGRAMACIONES D+1',
            id_llamada: row['ID DE LLAMADA'] || row['ID LLAMADA'] || 'HISTORICO'
        });
    }

    if (registros.length === 0) {
        status.innerText = `⚠️ 0 filas válidas. Total usuarios en BD: ${mapaUsuarios.size}. Ejemplo de usuario leído en CSV no hallado en BD: "${ejemploNoEncontrado || 'vacío'}"`;
        return;
    }

    status.innerText = `⏳ Subiendo ${registros.length} gestiones históricas a Supabase...`;
    for (let i = 0; i < registros.length; i += 200) {
        const lote = registros.slice(i, i + 200);
        const { error } = await supabaseClient.from('gestiones_sot').insert(lote);
        if (error) {
            status.innerText = "❌ Error al subir lote: " + error.message;
            return;
        }
    }

    status.innerText = `✅ ¡Éxito! Se cargaron ${registros.length} registros históricos.`;
    cargarDashboardSupervisor();
}

async function generarYGuardarPlantilla() {
    const sot = document.getElementById('campo-sot').value.trim();
    const telefono = document.getElementById('campo-telefono').value.trim() || 'S/N';
    const departamento = document.getElementById('campo-departamento').value;
    const cliente = document.getElementById('campo-cliente').value.trim().toUpperCase() || 'TITULAR';
    const contrata = document.getElementById('campo-contrata').value.trim().toUpperCase() || 'CONTRATA';
    const gestion = document.getElementById('cat-principal').value;
    const colaManual = document.getElementById('cola-manual').value;
    const submotivo = document.getElementById('sub-motivo').value;
    const fechaCliente = document.getElementById('fecha-visita').value;
    const franja = document.getElementById('franja-horaria').value;
    const idLlamada = document.getElementById('id-llamada').value.trim() || 'S/N';

    if (!sot) return mostrarToast("⚠️ Ingresa o extrae el número de SOT");

    const partesFecha = fechaCliente.split('-');
    const fechaCorta = partesFecha.length === 3 ? `${partesFecha[2]}/${partesFecha[1]}` : fechaCliente;

    const plantillaTexto = 
`MESA MULTISKILL HITSS - ${gestion} (${colaManual})
SOT: ${sot}
DÍA Y FRANJA: ${fechaCorta} ${franja}
DEPARTAMENTO: ${departamento}
CLIENTE: ${cliente}
NÚMERO: ${telefono}
CONTRATA: ${contrata}
MOTIVO: ${submotivo}
ID DE LLAMADA: ${idLlamada}
ASESOR: ${usuarioActivo.nombre_completo} (${usuarioActivo.codigo_e})`;

    document.getElementById('plantilla-resultado').value = plantillaTexto;

    try { await navigator.clipboard.writeText(plantillaTexto); } catch (e) {}

    const yaTieneGestionHoy = gestionesDelDiaLocal.some(g => g.sot === sot) ? 'SI' : 'NO';
    if (yaTieneGestionHoy === 'SI') {
        if (!confirm(`⚠️ La SOT ${sot} ya registra una gestión previa hoy (se marcará ¿YA TIENE GESTION? = SI). ¿Continuar?`)) return;
    }

    const abrirForms = document.getElementById('check-abrir-forms').checked;
    const ahora = new Date();
    const { error } = await supabaseClient.from('gestiones_sot').insert([{
        usuario_e: usuarioActivo.codigo_e,
        sot: sot,
        fecha_desea_cliente: fechaCliente,
        franja: franja,
        hora_inicio: horaInicioActividad,
        hora_finalizacion: ahora.toISOString(),
        fecha_gestion: obtenerFechaLima(),
        intervalo: obtenerHoraLima(),
        gestion: gestion,
        submotivo: submotivo,
        departamento: departamento,
        ya_tiene_gestion: yaTieneGestionHoy,
        sot_gestionada_manual: colaManual,
        id_llamada: idLlamada,
        cliente_nombre: cliente,
        telefono_cliente: telefono,
        contrata: contrata,
        enviado_forms: abrirForms
    }]);

    horaInicioActividad = new Date().toISOString();

    if (error) {
        mostrarToast("⚠️ Copiada, pero falló guardado en nube: " + error.message);
    } else {
        mostrarToast("🎄 Plantilla copiada y SOT registrada");
        cargarDatosPersonalesADP();
    }

    if (abrirForms) abrirMicrosoftForms();
}

function abrirMicrosoftForms() {
    window.open(URL_MICROSOFT_FORMS, '_blank');
}

function generarFormatoFranja() {
    const sup = document.getElementById('sup-franja').value.toUpperCase().trim() || 'SUPERVISOR EN TURNO';
    const sot = document.getElementById('campo-sot').value.trim() || 'S/N';
    const franja = document.getElementById('franja-horaria').value;
    const fecha = document.getElementById('fecha-visita').value;

    document.getElementById('resultado-franja').value = 
`SOLICITUD DE HABILITACIÓN DE FRANJA
PARA: ${sup}
SOT: ${sot}
FECHA / FRANJA REQUERIDA: ${fecha} - ${franja}
SOLICITADO POR: ${usuarioActivo.nombre_completo} (${usuarioActivo.codigo_e})`;
}

// ============================================================================
// 5. PANEL DE AVANCE PERSONAL Y RANKING DEL ADP (METAS 85 / 45 Y 150 / 90 MIN)
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
    const confirmadosMios = gestionesDelDiaLocal.filter(g => g.gestion === 'CONFIRMO').length;
    
    const configMeta = METAS_DIARIAS[usuarioActivo.modalidad] || METAS_DIARIAS['Full Time'];
    const porcentaje = Math.round((totalMio / configMeta.sots) * 100);
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

    document.getElementById('adp-avance-hoy').innerText = `${totalMio} / ${configMeta.sots} SOTs`;
    document.getElementById('adp-tiempo-hablado').innerText = `${minHablados} / ${configMeta.minutosHablados} min`;
    document.getElementById('adp-porcentaje').innerText = `${porcentaje}% (${confirmadosMios} Confirm.)`;
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
        return `<div class="bloc-item"><strong>${index + 1}. SOT: ${g.sot}</strong> [${hora}] • ${g.franja}\nEstado: <strong>${g.gestion}</strong> (${g.sot_gestionada_manual})\nDepto: ${g.departamento} | ID: ${g.id_llamada}\n************************************</div>`;
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
// 6. DASHBOARD GERENCIAL DEL ADMINISTRADOR + GRÁFICAS + IMPORTADOR HISTÓRICO
// ============================================================================
function cambiarModoFiltroAdmin() {
    const modo = document.getElementById('admin-modo-filtro').value;
    document.getElementById('admin-filtro-fecha').style.display = modo === 'dia' ? 'inline-block' : 'none';
    document.getElementById('admin-filtro-mes').style.display = modo === 'mes' ? 'inline-block' : 'none';
    cargarDashboardSupervisor();
}

function calcularMesesAntiguedad(fechaIngresoStr) {
    if (!fechaIngresoStr) return '0 meses';
    const ingreso = new Date(fechaIngresoStr);
    const hoy = new Date();
    const meses = (hoy.getFullYear() - ingreso.getFullYear()) * 12 + (hoy.getMonth() - ingreso.getMonth());
    return `${Math.max(0, meses)} m`;
}

async function cargarDashboardSupervisor() {
    const modo = document.getElementById('admin-modo-filtro').value;
    const filtroArea = document.getElementById('admin-filtro-area').value;

    let queryAsesores = supabaseClient.from('usuarios').select('*').eq('rol', 'ADP').eq('activo', true);
    if (filtroArea !== 'TODAS') queryAsesores = queryAsesores.eq('area', filtroArea);
    const { data: asesores } = await queryAsesores;

    let queryGestiones = supabaseClient.from('gestiones_sot').select('*');
    let diasActivos = 1;

    if (modo === 'dia') {
        const fecha = document.getElementById('admin-filtro-fecha').value;
        queryGestiones = queryGestiones.eq('fecha_gestion', fecha);
    } else if (modo === 'mes') {
        const mes = document.getElementById('admin-filtro-mes').value;
        queryGestiones = queryGestiones.gte('fecha_gestion', `${mes}-01`).lte('fecha_gestion', `${mes}-31`);
    }

    const { data: gestiones, error } = await queryGestiones;
    if (error) return console.error(error);

    if (modo !== 'dia' && gestiones && gestiones.length > 0) {
        const fechasUnicas = new Set(gestiones.map(g => g.fecha_gestion));
        diasActivos = Math.max(1, fechasUnicas.size);
    }

    const filasProcesadas = (asesores || []).map(adp => {
        const susGestiones = (gestiones || [])
            .filter(g => g.usuario_e === adp.codigo_e)
            .sort((a, b) => new Date(a.hora_finalizacion) - new Date(b.hora_finalizacion));

        const total = susGestiones.length;
        const configMeta = METAS_DIARIAS[adp.modalidad] || METAS_DIARIAS['Full Time'];
        const metaSots = configMeta.sots * diasActivos;
        const metaMin = configMeta.minutosHablados * diasActivos;
        const minHablados = Math.round(calcularMinutosHablados(susGestiones));
        const cumple = total >= metaSots && minHablados >= metaMin;

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

        return { adp, total, metaSots, minHablados, metaMin, cumple, cadenciaMin, horas, conf, noCont, rech, repro };
    }).sort((a, b) => b.total - a.total);

    const totalMesa = filasProcesadas.reduce((acc, f) => acc + f.total, 0);
    const totalConf = filasProcesadas.reduce((acc, f) => acc + f.conf, 0);
    const totalNoCont = filasProcesadas.reduce((acc, f) => acc + f.noCont, 0);
    const totalRech = filasProcesadas.reduce((acc, f) => acc + f.rech, 0);
    const totalRepro = filasProcesadas.reduce((acc, f) => acc + f.repro, 0);
    const totalContactados = totalConf + totalRech + totalRepro;

    const pctConf = totalMesa > 0 ? Math.round((totalConf / totalMesa) * 100) : 0;
    const pctContactabilidad = totalMesa > 0 ? Math.round((totalContactados / totalMesa) * 100) : 0;
    const totalCumplen = filasProcesadas.filter(f => f.cumple).length;

    const promMinHablados = filasProcesadas.length > 0
        ? Math.round(filasProcesadas.reduce((a, f) => a + f.minHablados, 0) / filasProcesadas.length)
        : 0;

    document.getElementById('kpi-global-sots').innerText = totalMesa;
    document.getElementById('kpi-global-efectividad').innerText = `${pctConf}% / ${pctContactabilidad}%`;
    document.getElementById('kpi-global-cumplen').innerText = `${totalCumplen} / ${filasProcesadas.length}`;
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
            <td><strong>${f.total}</strong> / ${f.metaSots}</td>
            <td><strong>${f.minHablados}</strong> / ${f.metaMin}m</td>
            <td><span class="${f.cumple ? 'badge-ok' : 'badge-warn'}">${f.cumple ? 'CUMPLE' : 'BAJO META'}</span></td>
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

// IMPORTADOR MASIVO DESDE CSV DE EXCEL
function abrirModalImportar() { document.getElementById('modal-importar').style.display = 'flex'; }
function cerrarModalImportar() { document.getElementById('modal-importar').style.display = 'none'; }

async function procesarCSVHistorico() {
    const fileInput = document.getElementById('archivo-csv-historico');
    const status = document.getElementById('estado-importacion');
    if (!fileInput.files.length) return alert("Selecciona primero el archivo .csv exportado de tu Excel.");

    status.innerText = "⏳ Leyendo archivo y validando usuarios...";
    const text = await fileInput.files[0].text();
    const sep = text.includes(';') ? ';' : ',';
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return status.innerText = "❌ El archivo está vacío.";

    const headers = lines[0].split(sep).map(h => h.trim().toUpperCase().replace(/"/g, ''));
    const { data: usuariosValidos } = await supabaseClient.from('usuarios').select('codigo_e');
    const setUsuarios = new Set((usuariosValidos || []).map(u => u.codigo_e));

    const registros = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(sep).map(c => c.trim().replace(/"/g, ''));
        const row = {};
        headers.forEach((h, idx) => row[h] = cols[idx] || '');

        const usuarioE = (row['USUARIO'] || row['USUARIO_E'] || '').toUpperCase().trim();
        const sot = row['SOT'] || '';
        if (!usuarioE || !sot || !setUsuarios.has(usuarioE)) continue;

        let gestion = (row['GESTION'] || 'CONFIRMO').toUpperCase().trim();
        if (!['CONFIRMO', 'NO CONTESTA', 'RECHAZADO', 'REPROGRAMADO'].includes(gestion)) gestion = 'CONFIRMO';

        let franja = (row['FRANJA'] || 'AM1').toUpperCase().trim();
        if (!['AM0', 'AM1', 'AM2', 'PM1', 'PM2'].includes(franja)) franja = 'AM1';

        const fechaRaw = row['FECHA DE GESTION'] || row['FECHA_GESTION'] || obtenerFechaLima();
        const fechaNorm = fechaRaw.includes('/') ? fechaRaw.split('/').reverse().join('-') : fechaRaw;
        const intervalo = parseInt(row['INTERVALO'] || '10', 10) || 10;

        registros.push({
            usuario_e: usuarioE,
            sot: sot,
            fecha_desea_cliente: fechaNorm,
            franja: franja,
            fecha_gestion: fechaNorm,
            intervalo: intervalo,
            gestion: gestion,
            submotivo: row['SUBMOTIVO'] || 'Importado de Excel histórico',
            departamento: (row['DEPARTAMENTO'] || 'LIMA').toUpperCase(),
            ya_tiene_gestion: (row['¿YA TIENE GESTION?'] || 'NO').toUpperCase() === 'SI' ? 'SI' : 'NO',
            sot_gestionada_manual: row['SOT GESTIONADA MANUAL'] || 'PROGRAMACIONES D+1',
            id_llamada: row['ID DE LLAMADA'] || 'HISTORICO'
        });
    }

    if (registros.length === 0) {
        status.innerText = "⚠️ No se encontraron filas con Usuarios E válidos en el padrón.";
        return;
    }

    status.innerText = `⏳ Subiendo ${registros.length} gestiones históricas a Supabase...`;
    for (let i = 0; i < registros.length; i += 200) {
        const lote = registros.slice(i, i + 200);
        const { error } = await supabaseClient.from('gestiones_sot').insert(lote);
        if (error) {
            status.innerText = "❌ Error al subir lote: " + error.message;
            return;
        }
    }

    status.innerText = `✅ ¡Éxito! Se cargaron ${registros.length} registros históricos.`;
    cargarDashboardSupervisor();
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
// 7. UTILIDADES
// ============================================================================
function limpiarCampos() {
    ['texto-toa', 'campo-sot', 'campo-telefono', 'campo-cliente', 'campo-contrata', 'plantilla-resultado'].forEach(id => {
        document.getElementById(id).value = '';
    });
    mostrarToast("🧹 Campos limpiados");
}

function copiarTextoElemento(id) {
    const el = document.getElementById(id);
    if (!el.value) return mostrarToast("⚠️ No hay texto para copiar");
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
