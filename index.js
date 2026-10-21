require("dotenv").config();

const express = require("express");
const OpenAI = require("openai");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ==========================================================
// INFORMACIÓN OFICIAL
// ==========================================================

const MARCA = "MASTER NAILS PRO";
const PRECIO_MALETA = "Bs. 5.950 o 6.5 USDT";
const PRECIO_CUADERNOS = "Bs. 3.550 o 3.5 USDT";
const DATOS_PAGO = {
  pagoMovil: {
    banco: "Banco de Venezuela",
    codigo: "0102",
    titular: "KENNY BARICO",
    cedula: "20.110.298",
    telefono: "0412-8319767",
    monto: "Bs. 5.950"
  },
  binance: {
    payId: "1125063516",
    destinatario: "PROGRESODIGITALOFICIAL",
    monto: "6.5 USDT"
  }
};

const PRINCIPALES = [
  "Guía 00 - Comienza con Claridad",
  "Manual 01 - Base Segura y Mesa Pro",
  "Manual 02 - Esmaltado Semipermanente",
  "Manual 03 - Rubber Base y Nivelación Profesional",
  "Manual 04 - Soft Gel"
];

const BONOS = [
  "Polygel / Acrygel",
  "Retiradas y Mantenimiento",
  "Activación de Práctica a Servicio",
  "Cat Eye / Ojo de Gato"
];

// ==========================================================
// PROMPT DEL AGENTE
// ==========================================================

const SYSTEM_PROMPT = `
Eres Anthonella Rossi, asesora virtual de MASTER NAILS PRO para Venezuela en WhatsApp.
Eres cálida, femenina, cercana, profesional y clara. Responde en español con párrafos cortos,
espacios entre ideas y emojis moderados. No repitas saludos ni finjas ser humana si te preguntan.
Resuelve primero la duda y orienta a la compra solo cuando sea una consulta de preventa.

INFORMACIÓN OFICIAL:
La Maleta MASTER NAILS PRO es una formación digital de manicura, paso a paso, desde cero.
Incluye exactamente cinco materiales principales: Guía 00 - Comienza con Claridad;
Manual 01 - Base Segura y Mesa Pro; Manual 02 - Esmaltado Semipermanente;
Manual 03 - Rubber Base y Nivelación Profesional; Manual 04 - Soft Gel.
Incluye cuatro bonos: Polygel / Acrygel; Retiradas y Mantenimiento;
Activación de Práctica a Servicio; Cat Eye / Ojo de Gato.
Son nueve PDF en total. La maleta cuesta Bs. 5.950 por Pago Móvil o 6.5 USDT por Binance Pay.
Los PDF entregados tienen acceso de por vida. Se estudia a ritmo propio. No incluye
herramientas ni materiales físicos. La miniguía introductoria de 12 páginas es gratuita,
sin obligación de compra, y no equivale a la maleta completa.
La maleta se entrega únicamente después de verificar el pago por el proceso externo.
El comprobante y la palabra LISTO no son por sí solos una confirmación de pago.
No afirmes haber verificado pagos, enviado archivos ni activado entregas.
No hay un plazo fijo garantizado de revisión; una vez confirmado, el flujo habilita la entrega.

PAGO MÓVIL: Banco de Venezuela, código 0102, titular KENNY BARICO,
cédula 20.110.298, teléfono 0412-8319767, monto Bs. 5.950.
BINANCE PAY: Pay ID 1125063516, destinatario PROGRESODIGITALOFICIAL,
monto 6.5 USDT. El QR existe en ManyChat; no inventes ni envíes otro.
Después de pagar, pide una captura legible y que escriban LISTO para iniciar la revisión.

Solo después del pago principal confirmado y la entrega, ManyChat puede ofrecer
dos cuadernos opcionales: Cuaderno Práctico / Laboratorio de Trazos y
Cuaderno de Francesa y Simetría, juntos por Bs. 3.550 o 3.5 USDT.
No son parte de la maleta ni de los cuatro bonos. No los promociones antes de esa etapa.

No inventes precios, descuentos, certificaciones, clases en vivo, mentorías,
garantías, enlaces, resultados profesionales automáticos, ingresos asegurados
ni recuperación garantizada de la inversión. No diagnostiques condiciones médicas.
No vuelvas a vender la maleta a quien reporta pago, incidencias o problemas de archivos.
El contexto opcional del pedido es orientativo, no prueba de pago confirmado.
`;

// ==========================================================
// FUNCIONES GENERALES
// ==========================================================

function normalizarTexto(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[¿?¡!.,;:()[\]{}"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contieneAlguna(texto, frases) {
  return frases.some((frase) => texto.includes(normalizarTexto(frase)));
}

function limpiarRespuesta(valor) {
  return String(valor ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function etapaDe(contexto) {
  if (!contexto || typeof contexto !== "object" || Array.isArray(contexto)) return "";
  return normalizarTexto(contexto.etapa ?? contexto.fase ?? "");
}

function esEtapaPostventa(contexto) {
  return ["pago", "postpago", "verificacion", "entrega", "entregado", "soporte", "upsell"]
    .includes(etapaDe(contexto));
}

// ==========================================================
// MENSAJES REUTILIZABLES
// ==========================================================

function cierrePago() {
  return "¿Qué método de pago prefieres utilizar: Pago Móvil o Binance Pay (USDT)? 💖";
}

function agregarCierre(respuesta, contexto) {
  const respuestaLimpia = limpiarRespuesta(respuesta);
  if (!respuestaLimpia || esEtapaPostventa(contexto)) return respuestaLimpia;
  if (normalizarTexto(respuestaLimpia).includes(normalizarTexto(cierrePago()))) {
    return respuestaLimpia;
  }
  return `${respuestaLimpia}\n\n${cierrePago()}`;
}

function resumenPrecio() {
  return `La maleta con sus 5 materiales principales y 4 bonos cuesta ${PRECIO_MALETA}.`;
}

// ==========================================================
// RESPUESTAS DIRECTAS: 20 INTENCIONES
// ==========================================================

function responderFormacion(contexto) {
  return agregarCierre(
    `Claro que sí, hermosa 💅 ${MARCA} es una formación digital organizada paso a paso para comenzar desde cero y avanzar hacia técnicas más especializadas. Incluye 5 materiales principales y 4 bonos en PDF.\n\nTe ayuda a desarrollar habilidades prácticas que, con estudio y práctica, pueden abrirte oportunidades para ofrecer servicios. ${resumenPrecio()}`,
    contexto
  );
}

function responderMiniguia(contexto) {
  return agregarCierre(
    `Sí 💖 La miniguía introductoria de 12 páginas es gratuita y no te obliga a comprar después. Es una muestra inicial; no es la maleta completa.\n\nSi quieres continuar con los 9 materiales de ${MARCA}, el precio es ${PRECIO_MALETA}.`,
    contexto
  );
}

function responderDiferencia(contexto) {
  return agregarCierre(
    `La miniguía gratuita te da una primera orientación en 12 páginas. La Maleta ${MARCA} es la formación completa: 5 materiales principales y 4 bonos para estudiar y practicar paso a paso.\n\nLa maleta cuesta ${PRECIO_MALETA}.`,
    contexto
  );
}

function responderPrecio(contexto) {
  return agregarCierre(
    `La Maleta ${MARCA} cuesta ${PRECIO_MALETA} 💖 Incluye los 5 materiales principales y los 4 bonos digitales, 9 PDF en total. Puedes estudiar a tu ritmo y conservar los archivos entregados de por vida.`,
    contexto
  );
}

function responderManuales(contexto) {
  return agregarCierre(
    `Los 5 materiales principales son:\n\n${PRINCIPALES.map((item, i) => `${i + 1}. ${item}`).join("\n")}\n\nAdemás se incluyen 4 bonos. Todo está dentro de la maleta por ${PRECIO_MALETA}. 📚`,
    contexto
  );
}

function responderBonos(contexto) {
  return agregarCierre(
    `Los 4 bonos incluidos son:\n\n${BONOS.map((item, i) => `${i + 1}. ${item}`).join("\n")}\n\nNo tienen costo adicional: forman parte de los 9 PDF de la maleta. ${resumenPrecio()} 🎁`,
    contexto
  );
}

function responderPrincipiante(contexto) {
  return agregarCierre(
    `Sí, puedes comenzar sin experiencia 🥰 La ruta inicia con fundamentos y te lleva paso a paso hacia otras técnicas. Los resultados dependen del estudio y de practicar con constancia; no necesitas dominar todo el primer día.\n\n${resumenPrecio()}`,
    contexto
  );
}

function responderHerramientas(contexto) {
  return agregarCierre(
    `Para practicar sí necesitarás herramientas y productos físicos, pero no vienen incluidos en la maleta digital. Puedes adquirirlos gradualmente según la técnica que estés estudiando. 💅\n\nLa formación te orienta para desarrollar la habilidad; no promete ingresos automáticos. ${resumenPrecio()}`,
    contexto
  );
}

function responderDigital(contexto) {
  return agregarCierre(
    `Sí, los 9 materiales son archivos PDF 📚 Se entregan por WhatsApp después de que el pago sea confirmado. Puedes abrirlos en un celular, tableta o computadora con lector PDF compatible.\n\n${resumenPrecio()}`,
    contexto
  );
}

function responderAcceso(contexto) {
  return agregarCierre(
    `Sí 💖 Los PDF que recibas son tuyos para conservar y consultar de por vida. No hay horarios fijos para estudiarlos. Esto no implica prometer futuras actualizaciones o clases adicionales.\n\n${resumenPrecio()}`,
    contexto
  );
}

function responderPostpago(contexto) {
  return agregarCierre(
    `La miniguía introductoria sí es gratuita. La maleta completa no se entrega antes de pagar: primero realizas el pago, envías el comprobante y el proceso autorizado lo verifica. Solo después se habilitan los 9 materiales.\n\n${resumenPrecio()}`,
    contexto
  );
}

function responderPagoMovil() {
  const pago = DATOS_PAGO.pagoMovil;
  return `Claro que sí 💖 Para pagar la maleta por Pago Móvil:\n\nMonto: ${pago.monto}\nBanco: ${pago.banco}\nCódigo: ${pago.codigo}\nTitular: ${pago.titular}\nCédula: ${pago.cedula}\nTeléfono: ${pago.telefono}\n\nDespués, envía una captura legible del comprobante y escribe LISTO. El pago se revisará antes de habilitar la entrega.`;
}

function responderBinance() {
  const pago = DATOS_PAGO.binance;
  return `Claro 💖 Para pagar la maleta por Binance Pay:\n\nMonto: ${pago.monto}\nPay ID: ${pago.payId}\nDestinatario: ${pago.destinatario}\n\nEl QR se muestra dentro del flujo de ManyChat. Después de pagar, envía una captura legible del comprobante y escribe LISTO. La entrega se habilita solo tras la verificación.`;
}

function responderComprobante() {
  return "Gracias por avisarme 💖 Si ya pagaste, envía aquí una captura legible del comprobante y escribe LISTO para que el proceso autorizado revise el pago. Ese mensaje no confirma la transacción por sí solo; espera la verificación antes de recibir los materiales.";
}

function responderEntrega() {
  return "Después de recibir el comprobante, el pago pasa por revisión. No hay un tiempo fijo garantizado para esa verificación. Una vez confirmado por el proceso autorizado, el flujo habilita de inmediato los 9 materiales digitales. ✨";
}

function responderIncidencia() {
  return "Lamento el inconveniente 💖 Envíame una captura clara del comprobante e indica qué mensaje recibiste o qué dato no coincide. El pago debe revisarse antes de sacar conclusiones; no realices un segundo pago mientras se aclara lo ocurrido.";
}

function responderArchivos() {
  return "Vamos a revisarlo 💖 Dime cuál PDF falta o qué sucede al abrirlo. Si aparece un error, indícame el mensaje y si estás usando celular o computadora. Puedes intentar con un lector PDF actualizado; no necesitas volver a pagar por un problema de entrega o descarga.";
}

function responderRitmo(contexto) {
  return agregarCierre(
    `Sí, estudias y practicas a tu propio ritmo, sin horarios fijos 📚 Los PDF entregados quedan contigo de por vida. Puedes avanzar gradualmente y desarrollar habilidades que luego podrías aplicar al ofrecer servicios.\n\n${resumenPrecio()}`,
    contexto
  );
}

function responderCuadernos(contexto) {
  const detalle = `Son dos complementos opcionales: el Cuaderno Práctico / Laboratorio de Trazos y el Cuaderno de Francesa y Simetría. Juntos cuestan ${PRECIO_CUADERNOS}; no están incluidos en la maleta ni son parte de los cuatro bonos.`;
  // Una etapa enviada en el cuerpo HTTP es orientativa, no una prueba fiable
  // de pago. ManyChat es quien presenta el upsell después de la entrega.
  if (etapaDe(contexto) === "upsell") {
    return `${detalle}\n\nSi ManyChat ya te mostró este complemento tras recibir la maleta, sigue esa opción del flujo para elegir el pago. 💖`;
  }
  return `${detalle}\n\nManyChat los presenta después de confirmar el pago principal y entregar la maleta; por ahora puedes continuar con la formación principal. 💖`;
}

function responderEmprender(contexto) {
  return agregarCierre(
    `Sí, ${MARCA} está pensado para aprender desde cero y desarrollar habilidades que podrías usar para ofrecer servicios de manicura 💅 Requiere estudio, práctica, herramientas y dedicación; no puedo prometer clientas ni ingresos.\n\n${resumenPrecio()}`,
    contexto
  );
}

const INTENCIONES = [
  // Soporte y pospago tienen prioridad sobre palabras comerciales generales.
  ["incidencia", ["pago no aparece", "pago rechazado", "comprobante rechazado", "pago no confirmado", "no reconocen mi pago", "transferencia no aparece", "rechazaron mi pago"], responderIncidencia],
  ["archivos", ["no recibi los archivos", "no puedo descargar", "no abre el pdf", "archivo danado", "faltan manuales", "no me llegaron los materiales", "no me llego el pdf", "no puedo abrir los pdf", "falta un manual", "no me llegan los manuales", "no recibi los manuales", "no tengo los manuales", "no puedo abrir los manuales", "no me llegan los pdf", "no veo los manuales", "no me llego la maleta"], responderArchivos],
  ["comprobante", ["comprobante", "enviar comprobante", "capture de pago", "captura del pago", "ya pague", "mande el pago", "ya hice el pago", "ya transferi", "ya envie el pago", "ya compre", "ya compre la maleta"], responderComprobante],
  ["postpago", ["pagar despues", "pago despues", "recibir antes de pagar", "primero los manuales", "pagar cuando reciba", "contraentrega", "primero me envias y luego pago"], responderPostpago],
  ["cuadernos", ["cuadernos", "cuaderno de trazos", "francesa y simetria", "dos cuadernos", "cuadernos practicos", "precio de los cuadernos", "laboratorio de trazos"], responderCuadernos],
  ["diferencia", ["diferencia", "diferencia entre guia y maleta", "guia o maleta", "que trae la maleta completa", "contenido completo", "diferencia miniguia", "diferencia entre la miniguia"], responderDiferencia],
  ["miniguia", ["miniguia gratis", "mini guia gratuita", "la miniguia es gratis", "pagar por la miniguia", "costo de la miniguia", "la guia gratuita", "la miniguia", "mini guia"], responderMiniguia],
  ["pagoMovil", ["pago movil", "pagomovil", "datos de pago movil", "numero para pagar", "banco de venezuela", "pagar en bolivares"], responderPagoMovil],
  ["binance", ["binance", "binance pay", "usdt", "pagar con binance", "pago en usdt", "pay id"], responderBinance],
  ["entrega", ["tiempo de entrega", "cuanto tarda", "cuando recibo", "cuando llegan los manuales", "cuanto demoran", "verificacion del pago", "cuando los entregan", "cuando me llegan"], responderEntrega],
  ["bonos", ["bonos", "los 4 bonos", "cuatro bonos", "bonos incluidos", "bonos adicionales", "que bonos trae"], responderBonos],
  ["principiante", ["principiante", "principiantes", "sin experiencia", "nunca he hecho unas", "empezar desde cero", "no se hacer unas"], responderPrincipiante],
  ["herramientas", ["herramientas", "materiales para practicar", "necesito comprar materiales", "que necesito para practicar", "equipos de manicura", "necesito lampara"], responderHerramientas],
  ["digital", ["formato digital", "son pdf", "abrir los manuales", "ver en el celular", "ver en computadora", "descargar manuales"], responderDigital],
  ["acceso", ["acceso de por vida", "acceso permanente", "cuanto dura el acceso", "los manuales vencen", "puedo verlos siempre", "acceso ilimitado"], responderAcceso],
  ["manuales", ["manuales", "cinco manuales", "5 manuales", "materiales principales", "que manuales incluye", "contenido de los manuales"], responderManuales],
  ["ritmo", ["a mi ritmo", "horarios", "tiempo para estudiar", "cuando puedo practicar", "estudiar en mi tiempo libre", "horario fijo"], responderRitmo],
  ["emprender", ["emprender", "emprendimiento", "generar ingresos", "trabajar haciendo unas", "ganar dinero con unas", "poner mi negocio"], responderEmprender],
  ["precio", ["precio", "precios", "cuesta", "costo", "cuanto cuesta", "cuanto vale", "precio de la maleta"], responderPrecio],
  ["formacion", ["formacion", "curso", "que es master nails", "como funciona", "aprender manicura", "aprender unas", "que es la maleta"], responderFormacion]
];

function detectarIntencion(mensajeOriginal) {
  const texto = normalizarTexto(mensajeOriginal);
  if (!texto) return null;
  if (contieneAlguna(texto, ["miniguia", "mini guia"]) &&
      contieneAlguna(texto, ["gratis", "gratuita", "pagar despues", "obligatorio comprar"])) {
    return "miniguia";
  }
  for (const [nombre, variantes] of INTENCIONES) {
    if (contieneAlguna(texto, variantes)) return nombre;
  }
  return null;
}

function respuestaDirecta(mensajeOriginal, contexto) {
  const texto = normalizarTexto(mensajeOriginal);
  if (!texto) return null;
  if (texto === "listo") {
    return "Si ya enviaste el comprobante, espera a que el proceso autorizado revise el pago 💖 Escribir LISTO inicia la revisión, pero no confirma el pago ni habilita los materiales por sí solo.";
  }
  if (contieneAlguna(texto, ["miniguia", "mini guia"]) &&
      contieneAlguna(texto, ["gratis", "gratuita", "pagar despues", "obligatorio comprar"])) {
    return responderMiniguia(contexto);
  }
  for (const [, variantes, responder] of INTENCIONES) {
    if (contieneAlguna(texto, variantes)) return responder(contexto);
  }
  return null;
}

// ==========================================================
// RUTAS
// ==========================================================

app.get("/", (req, res) => {
  return res.status(200).send("Bot ventas MASTER NAILS PRO activo ✅");
});

app.post("/mensaje", async (req, res) => {
  try {
    const mensaje = req.body?.texto ?? req.body?.mensaje ?? req.body?.message ?? "";
    const textoUsuario = String(mensaje).trim();
    const contexto = req.body?.contexto ?? null;

    if (!textoUsuario) {
      return res.json({
        respuesta: "¡Hola! Soy Anthonella, asesora virtual de MASTER NAILS PRO 💖 Cuéntame qué te gustaría saber sobre la formación, la miniguía gratuita o los medios de pago."
      });
    }

    const directa = respuestaDirecta(textoUsuario, contexto);
    if (directa) {
      return res.json({ respuesta: limpiarRespuesta(directa) });
    }

    const etapa = etapaDe(contexto) || "no informada";
    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      temperature: 0.4,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: `${SYSTEM_PROMPT}\nEtapa orientativa del mensaje: ${etapa}. No la tomes como verificación de pago.` }]
        },
        {
          role: "user",
          content: [{ type: "input_text", text: textoUsuario }]
        }
      ]
    });

    const respuestaIA = limpiarRespuesta(response.output_text || "");
    const respuestaFinal = respuestaIA || "Con mucho gusto te ayudo 💖 ¿Podrías contarme un poco más sobre tu duda?";
    // No se agrega cierre de compra a preguntas ambiguas, soporte o poscompra.
    return res.json({ respuesta: respuestaFinal });
  } catch (error) {
    console.error("Error en /mensaje:", error);
    return res.json({
      respuesta: "En este momento no pude procesar tu consulta. Por favor, escríbeme de nuevo qué necesitas y te ayudaré con mucho gusto 💖"
    });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
