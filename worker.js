// =====================================================================
//  Painel SUAP - Faltas (Cloudflare Worker)
//  - Página web para gerar relatório manual (/)
//  - Envio automático por WhatsApp via Cron + Whapi.Cloud
//  - Monitor de notas novas (KV 'NOTAS'): /notas e /boletim (diagnóstico)
//  - Teste manual: /enviar?token=SEU_TOKEN
// =====================================================================

// ---------------------------------------------------------------------
// HORÁRIO DA TURMA 83632
// dia da semana (0=dom ... 6=sáb) ->
//   [palavra-chave no boletim (sem acento), nº de aulas no dia, nome exibido, termo a excluir (opcional)]
// ---------------------------------------------------------------------
const HORARIO = {
  1: [
    ["historia", 2, "História"],
    ["matematica", 2, "Matemática"],
    ["desenvolvimento web", 2, "Desenvolvimento Web"],
  ],
  2: [
    ["geografia", 2, "Geografia"],
    ["gestao", 2, "Gestão e Empreendedorismo"],
    ["banco de dados", 2, "Banco de Dados"],
    ["educacao fisica", 2, "Educação Física"],
  ],
  3: [
    ["filosofia", 1, "Filosofia"],
    ["sociologia", 1, "Sociologia"],
    ["desenvolvimento web", 2, "Desenvolvimento Web"],
    ["seguranca", 2, "Segurança da Informação"],
    ["quimica", 2, "Química"],
  ],
  4: [
    ["portugues", 2, "Língua Portuguesa"],
    ["biologia", 2, "Biologia"],
    ["projeto", 2, "Projeto, Inst. Serv. Rede"],
    ["programacao", 2, "Linguagem de Programação II"],
  ],
  5: [
    ["projeto", 2, "Projeto, Inst. Serv. Rede"],
    ["espanhol", 2, "Espanhol"],
    ["fisica", 2, "Física", "educacao"],
  ],
};

const NOMES_DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

// ---------------------------------------------------------------------
// PÁGINA WEB
// ---------------------------------------------------------------------
const HTML_PAGE = `<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Painel SUAP - Envio de Faltas</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f0f2f5; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        h1 { color: #1e293b; font-size: 22px; text-align: center; margin-bottom: 20px; }
        .form-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 6px; font-weight: 600; color: #334155; }
        input[type="text"], input[type="password"] { width: 100%; padding: 12px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box; font-size: 14px; }
        button { width: 100%; padding: 12px; background-color: #25d366; color: white; border: none; border-radius: 6px; font-size: 16px; cursor: pointer; font-weight: bold; margin-top: 10px; }
        button:hover { background-color: #128c7e; }
        .card { border: 1px solid #e2e8f0; padding: 15px; margin-top: 12px; border-radius: 8px; }
        .OK { border-left: 5px solid #22c55e; }
        .PERIGO { border-left: 5px solid #f59e0b; }
        .ESTOURADO { border-left: 5px solid #ef4444; }
        .badge { font-weight: bold; padding: 4px 8px; border-radius: 4px; color: white; float: right; font-size: 12px; }
        .bg-OK { background-color: #22c55e; }
        .bg-PERIGO { background-color: #f59e0b; }
        .bg-ESTOURADO { background-color: #ef4444; }
        .whatsapp-btn { display: block; text-align: center; background-color: #25d366; color: white; text-decoration: none; padding: 12px; border-radius: 6px; font-weight: bold; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>📊 Relatório de Faltas - SUAP</h1>
        <form id="suapForm">
            <div class="form-group">
                <label for="usuario">Matrícula (SUAP):</label>
                <input type="text" id="usuario" name="usuario" required placeholder="Digite sua matrícula">
            </div>
            <div class="form-group">
                <label for="senha">Senha:</label>
                <input type="password" id="senha" name="senha" required placeholder="Digite sua senha">
            </div>
            <div class="form-group">
                <label for="telefone">Número de Destino (com DDD):</label>
                <input type="text" id="telefone" name="telefone" required placeholder="Ex: 5575981140411">
            </div>
            <button type="submit">Gerar e Enviar Relatório</button>
        </form>

        <div id="resultado" style="margin-top: 25px;"></div>
    </div>

    <script>
        function esc(s) {
            return String(s).replace(/[&<>"']/g, function (c) {
                return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
            });
        }

        document.getElementById('suapForm').addEventListener('submit', async function (e) {
            e.preventDefault();
            const resultadoDiv = document.getElementById('resultado');
            resultadoDiv.innerHTML = '<p style="text-align:center; color: #64748b;">Acessando SUAP e calculando faltas...</p>';

            try {
                const formData = new FormData(this);
                const response = await fetch('/processar', { method: 'POST', body: formData });
                const data = await response.json();

                if (data.erro) {
                    resultadoDiv.innerHTML = '<p style="color: #ef4444; text-align: center;">' + esc(data.erro) + '</p>';
                    return;
                }

                let html = '<h3>Relatório Gerado:</h3>';
                data.materias.forEach(function (item) {
                    let statusClass = 'OK';
                    if (item.restantes < 0) statusClass = 'ESTOURADO';
                    else if (item.restantes <= 2) statusClass = 'PERIGO';

                    html += '<div class="card ' + statusClass + '">' +
                        '<span class="badge bg-' + statusClass + '">' + statusClass + '</span>' +
                        '<strong>' + esc(item.disciplina) + '</strong><br>' +
                        '<small>Faltas acumuladas: ' + item.faltas + ' de ' + item.limite_max + ' permitidas</small><br>' +
                        '<small>Frequência atual: ' + esc(item.freq_atual) + '</small><br>' +
                        '<strong>Faltas restantes no curso: ' + item.restantes + '</strong>' +
                        '</div>';
                });

                const urlWa = 'https://api.whatsapp.com/send?phone=' + encodeURIComponent(data.telefone) + '&text=' + encodeURIComponent(data.mensagem);
                html += '<a href="' + urlWa + '" target="_blank" class="whatsapp-btn">📲 Enviar Relatório pelo WhatsApp</a>';

                resultadoDiv.innerHTML = html;
            } catch (err) {
                resultadoDiv.innerHTML = '<p style="color: #ef4444; text-align: center;">Erro de conexão: ' + esc(err.message) + '</p>';
            }
        });
    <\/script>
</body>
</html>`;

// ---------------------------------------------------------------------
// UTILITÁRIOS
// ---------------------------------------------------------------------
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function cleanText(text) {
  return text.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function normalizar(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function parseCookies(headers) {
  const cookies = [];
  headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      cookies.push(value.split(";")[0].trim());
    }
  });
  return cookies.join("; ");
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

// ---------------------------------------------------------------------
// SUAP: LOGIN + BOLETIM
// ---------------------------------------------------------------------
async function baixarBoletimHtml(usuario, senha) {
  const loginUrl = "https://suap.ifba.edu.br/accounts/login/";

  const initialRes = await fetch(loginUrl, { headers: { "User-Agent": UA } });
  const initialHtml = await initialRes.text();
  const initialCookies = parseCookies(initialRes.headers);

  const csrfMatch = initialHtml.match(
    /name=["']csrfmiddlewaretoken["']\s+value=["']([^"']+)["']/
  );
  if (!csrfMatch) throw new Error("Erro ao conectar ao servidor do SUAP.");

  const loginBody = new URLSearchParams({
    username: usuario,
    password: senha,
    csrfmiddlewaretoken: csrfMatch[1],
    next: "",
  });

  const loginRes = await fetch(loginUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": UA,
      Referer: loginUrl,
      Cookie: initialCookies,
    },
    body: loginBody.toString(),
    redirect: "manual",
  });

  const authCookies = parseCookies(loginRes.headers) || initialCookies;

  const res = await fetch(
    "https://suap.ifba.edu.br/edu/aluno/" + encodeURIComponent(usuario) + "/?tab=boletim",
    { headers: { "User-Agent": UA, Cookie: authCookies } }
  );
  return await res.text();
}

function parseMaterias(html) {
  const trs = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
  const dados = [];
  const vistas = new Set();

  for (const tr of trs) {
    if (tr.includes("colspan") || tr.includes("<thead>") || tr.includes("<th>")) continue;

    const tds = tr.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
    if (tds.length < 6) continue;

    const cols = tds.map(cleanText);
    let disciplina = cols[1];
    if (!disciplina) continue;

    const low = disciplina.toLowerCase();
    if (low.includes("total") || low.includes("componente")) continue;

    if (disciplina.includes("-")) {
      disciplina = disciplina.split("-").slice(1).join("-").trim();
    }

    if (vistas.has(disciplina.toLowerCase())) continue;
    vistas.add(disciplina.toLowerCase());

    const ch = cols[2].match(/\d+/);
    const cargaHoraria = ch ? parseInt(ch[0], 10) : 72;
    const faltas = parseInt(cols[4], 10) || 0;

    let freq = 100;
    if (cols[5].includes("%")) {
      freq = parseFloat(cols[5].replace("%", "").replace(",", ".")) || 100;
    }

    const limite_max = Math.floor(cargaHoraria * 0.25);

    dados.push({
      disciplina,
      total_aulas: cargaHoraria,
      faltas,
      freq_atual: freq.toFixed(2) + "%",
      limite_max,
      restantes: limite_max - faltas,
    });
  }

  if (dados.length === 0) {
    throw new Error(
      "Não foi possível extrair as disciplinas do boletim. Verifique matrícula e senha."
    );
  }
  return dados;
}

async function buscarMaterias(usuario, senha) {
  return parseMaterias(await baixarBoletimHtml(usuario, senha));
}

// ---------------------------------------------------------------------
// MENSAGENS
// ---------------------------------------------------------------------
function montarMensagemCompleta(materias) {
  let msg = "📊 *BOLETIM SUAP - CONTROLE DE FALTAS*\n\n";
  for (const item of materias) {
    let alerta = "✅ *OK*";
    if (item.restantes < 0) alerta = "🚨 *ESTOURADO!* (" + Math.abs(item.restantes) + " além do limite)";
    else if (item.restantes <= 2) alerta = "⚠️ *ATENÇÃO! PRÓXIMO DO LIMITE*";

    msg += "🔹 *" + item.disciplina + "*\n";
    msg += "   • Faltas acumuladas: " + item.faltas + " de " + item.limite_max + " permitidas\n";
    msg += "   • Frequência atual: " + item.freq_atual + "\n";
    msg += "   • Faltas restantes permitidas: *" + item.restantes + "* " + alerta + "\n\n";
  }
  msg += "─────────────────────────\n_Relatório gerado via Painel Web SUAP._";
  return msg;
}

function montarMensagemDoDia(materiasSuap, diaSemana) {
  const aulasHoje = HORARIO[diaSemana];
  if (!aulasHoje) return null; // sábado / domingo

  let msg = "📚 *AULAS DE HOJE (" + NOMES_DIAS[diaSemana] + ") - FALTAS*\n\n";

  for (const [chave, qtdAulas, nomeBonito, excluir] of aulasHoje) {
    const m = materiasSuap.find((x) => {
      const n = normalizar(x.disciplina);
      return n.includes(chave) && !(excluir && n.includes(excluir));
    });

    if (!m) {
      msg += "🔹 *" + nomeBonito + "* (" + qtdAulas + " aula" + (qtdAulas > 1 ? "s" : "") + ")\n";
      msg += "   • Não encontrei essa disciplina no boletim\n\n";
      continue;
    }

    const sobraSeFaltar = m.restantes - qtdAulas;
    let alerta = "✅ *OK*";
    if (m.restantes < 0) alerta = "🚨 *ESTOURADO!* (" + Math.abs(m.restantes) + " além do limite)";
    else if (sobraSeFaltar < 0) alerta = "🚨 *NÃO FALTE: estouraria o limite!*";
    else if (m.restantes <= 2) alerta = "⚠️ *ATENÇÃO! PRÓXIMO DO LIMITE*";

    msg += "🔹 *" + nomeBonito + "* (" + qtdAulas + " aula" + (qtdAulas > 1 ? "s" : "") + " hoje)\n";
    msg += "   • Faltas: " + m.faltas + " de " + m.limite_max + " permitidas\n";
    msg += "   • Frequência: " + m.freq_atual + "\n";
    msg += "   • Restantes: *" + m.restantes + "* " + alerta + "\n";
    msg += "   • Se faltar hoje, sobram: " + sobraSeFaltar + "\n\n";
  }

  msg += "─────────────────────────\n_Relatório diário automático._";
  return msg;
}

// ---------------------------------------------------------------------
// WHATSAPP (CallMeBot)
// ---------------------------------------------------------------------
async function enviarWhatsApp(env, texto) {
  const url =
    "https://api.callmebot.com/whatsapp.php?phone=" +
    encodeURIComponent(env.WA_PHONE) +
    "&text=" +
    encodeURIComponent(texto) +
    "&apikey=" +
    encodeURIComponent(env.CALLMEBOT_KEY);

  const r = await fetch(url);
  if (!r.ok) {
    const corpo = await r.text();
    throw new Error("CallMeBot retornou " + r.status + ": " + corpo.slice(0, 200));
  }
}

// ---------------------------------------------------------------------
// TELEGRAM (alternativa gratuita e estável)
// ---------------------------------------------------------------------
async function enviarTelegram(env, texto) {
  const api = "https://api.telegram.org/bot" + env.TELEGRAM_TOKEN + "/sendMessage";
  const enviar = (extra) =>
    fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: texto, ...extra }),
    });

  let r = await enviar({ parse_mode: "Markdown" });
  if (!r.ok) r = await enviar({}); // se o Markdown falhar, manda texto simples
  if (!r.ok) {
    const corpo = await r.text();
    throw new Error("Telegram retornou " + r.status + ": " + corpo.slice(0, 200));
  }
}

// ---------------------------------------------------------------------
// WHATSAPP via Whapi.Cloud (sandbox gratuito, conecta seu número por QR code)
// ---------------------------------------------------------------------
async function enviarWhapi(env, texto) {
  const r = await fetch("https://gate.whapi.cloud/messages/text", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: "Bearer " + env.WHAPI_TOKEN,
    },
    body: JSON.stringify({ to: String(env.WA_PHONE).replace(/\D/g, ""), body: texto }),
  });
  const corpo = await r.text();
  if (!r.ok) {
    throw new Error("Whapi retornou " + r.status + ": " + corpo.slice(0, 200));
  }
  return "Whapi (" + r.status + "): " + corpo.slice(0, 300);
}

// Envia por todos os canais que estiverem configurados
async function enviarNotificacao(env, texto) {
  const temWhapi = env.WHAPI_TOKEN && env.WA_PHONE;
  const temTelegram = env.TELEGRAM_TOKEN && env.TELEGRAM_CHAT_ID;
  const temWhatsApp = env.CALLMEBOT_KEY && env.WA_PHONE;

  if (!temWhapi && !temTelegram && !temWhatsApp) {
    throw new Error(
      "Nenhum canal de envio configurado. Cadastre WHAPI_TOKEN e WA_PHONE."
    );
  }
  const detalhes = [];
  if (temWhapi) detalhes.push(await enviarWhapi(env, texto));
  if (temTelegram) { await enviarTelegram(env, texto); detalhes.push("Telegram: ok"); }
  if (temWhatsApp) { await enviarWhatsApp(env, texto); detalhes.push("CallMeBot: ok"); }
  return detalhes.join("\n");
}

// ---------------------------------------------------------------------
// PANORAMAS (sexta: faltas acumuladas / domingo: semana que vem)
// ---------------------------------------------------------------------
function acharMateria(materias, chave, excluir) {
  return materias.find((x) => {
    const n = normalizar(x.disciplina);
    return n.includes(chave) && !(excluir && n.includes(excluir));
  });
}

function emojiRisco(restantes, aulas) {
  if (restantes < 0) return "🚨";
  if (restantes < aulas) return "🚨";
  if (restantes <= 2) return "⚠️";
  return "✅";
}

// SEXTA: panorama das faltas que já tive, de todas as matérias
function montarPanoramaSexta(materias) {
  const ordenadas = [...materias].sort((a, b) => a.restantes - b.restantes);
  const totalFaltas = materias.reduce((acc, m) => acc + m.faltas, 0);
  const emRisco = materias.filter((m) => m.restantes <= 2).length;

  let msg = "📊 *PANORAMA DA SEMANA - FALTAS ACUMULADAS*\n\n";
  msg += "• Total de faltas no semestre: *" + totalFaltas + "*\n";
  msg += "• Matérias em risco (restam 2 ou menos): *" + emRisco + "*\n\n";

  for (const m of ordenadas) {
    let status = "✅";
    if (m.restantes < 0) status = "🚨 estourado";
    else if (m.restantes <= 2) status = "⚠️ risco";
    msg += "🔹 *" + m.disciplina + "*\n";
    msg += "   " + m.faltas + " de " + m.limite_max + " faltas | freq. " + m.freq_atual + " | restam *" + m.restantes + "* " + status + "\n";
  }
  msg += "\n─────────────────────────\n_Panorama de sexta (ordenado do mais crítico)._";
  return msg;
}

// DOMINGO: panorama das faltas que posso ter em cada dia da semana que vem
function montarPanoramaDomingo(materias) {
  // total de aulas de cada matéria na semana
  const aulasSemana = {};
  for (let d = 1; d <= 5; d++) {
    for (const [chave, qtd, nome] of HORARIO[d]) {
      aulasSemana[nome] = (aulasSemana[nome] || 0) + qtd;
    }
  }

  let msg = "📅 *PANORAMA DA SEMANA QUE VEM - FALTAS*\n";
  const cuidado = new Set();

  for (let d = 1; d <= 5; d++) {
    msg += "\n*" + NOMES_DIAS[d] + "*\n";
    for (const [chave, qtd, nome, excluir] of HORARIO[d]) {
      const m = acharMateria(materias, chave, excluir);
      if (!m) {
        msg += "• " + nome + " (" + qtd + "): não achei no boletim\n";
        continue;
      }
      const emoji = emojiRisco(m.restantes, aulasSemana[nome]);
      if (emoji !== "✅") cuidado.add(nome);
      msg += "• " + nome + " (" + qtd + " aula" + (qtd > 1 ? "s" : "") + "): restam *" + m.restantes + "* " + emoji + "\n";
    }
  }

  if (cuidado.size > 0) {
    msg += "\n⚠️ *Cuidado nesta semana:* " + [...cuidado].join(", ") + "\n";
  } else {
    msg += "\n✅ Nenhuma matéria em risco para a semana.\n";
  }
  msg += "\n─────────────────────────\n_Panorama de domingo. 🚨 = faltar a semana toda estouraria o limite._";
  return msg;
}

// ---------------------------------------------------------------------
// MONITOR DE NOTAS (avisa quando sai uma nota nova em qualquer unidade)
// Guarda a última foto do boletim no KV (binding NOTAS) e compara.
// ---------------------------------------------------------------------
// Colunas que NÃO são notas de unidade (faltas, frequência, médias, situação...)
const COLUNAS_IGNORADAS =
  /falta|freq|situa|m[eé]dia|\bmfd\b|\bmf\b|\bmd\b|%|c[oó]digo|disciplina|carga|aulas|total|resultado|obs|(^|\s)f\.?\d?(\s|$)/i;

function celulasDaLinha(tr, tag) {
  const re = new RegExp("<" + tag + "(\\s[^>]*)?>([\\s\\S]*?)<\\/" + tag + ">", "gi");
  const out = [];
  let m;
  while ((m = re.exec(tr)) !== null) {
    const attrs = m[1] || "";
    const cs = attrs.match(/colspan\s*=\s*["']?(\d+)/i);
    const rs = attrs.match(/rowspan\s*=\s*["']?(\d+)/i);
    out.push({
      texto: cleanText(m[2]),
      colspan: cs ? parseInt(cs[1], 10) : 1,
      rowspan: rs ? parseInt(rs[1], 10) : 1,
    });
  }
  return out;
}

// Monta o rótulo de cada coluna lendo o cabeçalho (com colspan/rowspan)
function montarCabecalho(html) {
  const trs = html.match(/<tr[\s>][\s\S]*?<\/tr>/gi) || [];
  const rotulos = [];
  const ocupado = [];
  let linha = 0;

  for (const tr of trs) {
    const tds = celulasDaLinha(tr, "td");
    if (tds.length >= 6) break; // chegou nas linhas de dados
    const ths = celulasDaLinha(tr, "th");
    if (ths.length < 3 || tds.length > 0) continue;

    ocupado[linha] = ocupado[linha] || [];
    let col = 0;
    for (const th of ths) {
      while (ocupado[linha][col]) col++;
      for (let c = 0; c < th.colspan; c++) {
        if (th.texto) (rotulos[col + c] = rotulos[col + c] || []).push(th.texto);
        for (let r = 1; r < th.rowspan; r++) {
          ocupado[linha + r] = ocupado[linha + r] || [];
          ocupado[linha + r][col + c] = true;
        }
      }
      col += th.colspan;
    }
    linha++;
  }
  return Array.from(rotulos, (r) => (r ? [...new Set(r)].join(" ") : ""));
}

// Retorna { disciplina: { "rótulo da coluna": "valor" } } só com notas já lançadas
function extrairNotas(html) {
  const cabecalho = montarCabecalho(html);
  const trs = html.match(/<tr[\s>][\s\S]*?<\/tr>/gi) || [];
  const notas = {};
  const vistas = new Set();

  for (const tr of trs) {
    if (tr.includes("colspan")) continue;
    const tds = celulasDaLinha(tr, "td").map((c) => c.texto);
    if (tds.length < 6) continue;

    let disciplina = tds[1];
    if (!disciplina) continue;
    const low = disciplina.toLowerCase();
    if (low.includes("total") || low.includes("componente")) continue;
    if (disciplina.includes("-")) disciplina = disciplina.split("-").slice(1).join("-").trim();
    if (vistas.has(disciplina.toLowerCase())) continue;
    vistas.add(disciplina.toLowerCase());

    for (let c = 6; c < tds.length; c++) {
      const rotuloBase = cabecalho[c] || "Coluna " + (c + 1);
      if (COLUNAS_IGNORADAS.test(rotuloBase)) continue;
      const valor = tds[c];
      if (!/\d/.test(valor)) continue; // vazio, "-" etc. = ainda não saiu
      notas[disciplina] = notas[disciplina] || {};
      const rotulo = notas[disciplina][rotuloBase] !== undefined ? rotuloBase + " (col " + (c + 1) + ")" : rotuloBase;
      notas[disciplina][rotulo] = valor;
    }
  }
  return { notas, cabecalho };
}

function contarNotas(notas) {
  return Object.values(notas).reduce((acc, r) => acc + Object.keys(r).length, 0);
}

function montarMensagemNotas(novas, alteradas) {
  let msg = "";
  if (novas.length > 0) {
    msg += "🆕 *NOVA NOTA LANÇADA!*\n";
    const porMateria = {};
    for (const n of novas) (porMateria[n.disc] = porMateria[n.disc] || []).push(n);
    for (const [disc, itens] of Object.entries(porMateria)) {
      msg += "\n📘 *" + disc + "*\n";
      for (const i of itens) msg += "   • " + i.rotulo + ": *" + i.valor + "*\n";
    }
  }
  if (alteradas.length > 0) {
    msg += (msg ? "\n" : "") + "✏️ *NOTA ALTERADA*\n";
    for (const a of alteradas) {
      msg += "\n📘 *" + a.disc + "*\n   • " + a.rotulo + ": " + a.de + " → *" + a.para + "*\n";
    }
  }
  msg += "\n─────────────────────────\n_Monitor de notas do SUAP._";
  return msg;
}

function montarMensagemBaseline(notas) {
  const qtdMaterias = Object.keys(notas).length;
  let msg = "🔔 *MONITOR DE NOTAS ATIVADO!*\n\n";
  msg += "Notas já lançadas agora: *" + contarNotas(notas) + "* em *" + qtdMaterias + "* matéria(s). ";
  msg += "Vou conferir o SUAP 20 vezes por dia (de hora em hora, das 06:15 à 01:15) e avisar quando sair uma nota nova.\n";
  for (const [disc, rotulos] of Object.entries(notas)) {
    msg += "\n• *" + disc + "*: " + Object.entries(rotulos).map(([k, v]) => k + " " + v).join(" | ");
  }
  return msg;
}

async function verificarNotas(env) {
  if (!env.NOTAS) throw new Error("O KV 'NOTAS' não está ligado ao Worker (veja o wrangler.toml).");

  const html = await baixarBoletimHtml(env.SUAP_USER, env.SUAP_PASS);
  parseMaterias(html); // se o login falhou, lança erro e NÃO mexe no histórico
  const { notas } = extrairNotas(html);

  const anteriorTxt = await env.NOTAS.get("snapshot");

  // Primeira vez: só registra o que já existe e avisa que ativou
  if (!anteriorTxt) {
    await enviarNotificacao(env, montarMensagemBaseline(notas));
    await env.NOTAS.put("snapshot", JSON.stringify(notas));
    return "Monitor ativado. Notas já lançadas: " + contarNotas(notas);
  }

  const anterior = JSON.parse(anteriorTxt);
  const novas = [];
  const alteradas = [];
  for (const [disc, rotulos] of Object.entries(notas)) {
    for (const [rotulo, valor] of Object.entries(rotulos)) {
      const antes = anterior[disc] ? anterior[disc][rotulo] : undefined;
      if (antes === undefined) novas.push({ disc, rotulo, valor });
      else if (antes !== valor) alteradas.push({ disc, rotulo, de: antes, para: valor });
    }
  }

  if (novas.length === 0 && alteradas.length === 0) return "Sem notas novas.";

  // Envia primeiro; só grava o histórico se o envio deu certo (senão tenta de novo depois)
  await enviarNotificacao(env, montarMensagemNotas(novas, alteradas));

  // Junta com o histórico para uma leitura incompleta do SUAP não gerar falso alarme depois
  const unido = { ...anterior };
  for (const [disc, rotulos] of Object.entries(notas)) unido[disc] = { ...(anterior[disc] || {}), ...rotulos };
  await env.NOTAS.put("snapshot", JSON.stringify(unido));

  return "Avisei: " + novas.length + " nova(s), " + alteradas.length + " alterada(s).";
}

// ---------------------------------------------------------------------
// ROTINA (escolhe a mensagem certa)
// modo: "diario" | "sexta" | "domingo" | undefined (automático pelo horário)
// ---------------------------------------------------------------------
async function rotina(env, modo, diaForcado) {
  // Hora de Brasília (UTC-3)
  const agora = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const dia = Number.isInteger(diaForcado) ? diaForcado : agora.getUTCDay();
  const hora = agora.getUTCHours();

  if (!modo) {
    // Sábado (10:30) = faltas acumuladas; domingo (10:30) = semana que vem;
    // sexta à noite (18:00) = faltas acumuladas; seg-sex de manhã (06:00) = matérias do dia
    if (dia === 6) modo = "sexta";
    else if (dia === 0) modo = "domingo";
    else if (dia === 5 && hora >= 12) modo = "sexta";
    else if (dia >= 1 && dia <= 5 && hora < 12) modo = "diario";
    else return false;
  }

  const materias = await buscarMaterias(env.SUAP_USER, env.SUAP_PASS);

  let msg = null;
  if (modo === "sexta") msg = montarPanoramaSexta(materias);
  else if (modo === "domingo") msg = montarPanoramaDomingo(materias);
  else msg = montarMensagemDoDia(materias, dia);

  if (!msg) return false;
  const detalhes = await enviarNotificacao(env, msg);
  return detalhes || true;
}

// ---------------------------------------------------------------------
// WORKER
// ---------------------------------------------------------------------
export default {
  // Disparado pelo Cron Trigger
  async scheduled(event, env, ctx) {
    // O cron das notas dispara sempre no minuto 15 (os de faltas usam minuto 00 e 30)
    const minutoUtc = new Date(event.scheduledTime).getUTCMinutes();
    const tarefa = minutoUtc === 15 ? verificarNotas(env) : rotina(env);
    ctx.waitUntil(tarefa.catch((e) => console.error("Falha no cron:", e.message)));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Teste manual do envio diário: /enviar?token=SEU_TOKEN
    if (url.pathname === "/enviar") {
      if (!env.TOKEN || url.searchParams.get("token") !== env.TOKEN) {
        return new Response("Não autorizado", { status: 401 });
      }
      try {
        // Testes: /enviar?token=...&modo=diario|sexta|domingo&dia=1..5
        const diaParam = parseInt(url.searchParams.get("dia"), 10);
        const modoParam = url.searchParams.get("modo") || "diario";
        if (!["diario", "sexta", "domingo"].includes(modoParam)) {
          return new Response("modo inválido (use diario, sexta ou domingo)", { status: 400 });
        }
        const enviou = await rotina(env, modoParam, Number.isNaN(diaParam) ? undefined : diaParam);
        if (!enviou) return new Response("Hoje não há aula (fim de semana).");
        return new Response(
          "Mensagem enviada!\n" + (typeof enviou === "string" ? enviou : ""),
          { headers: { "Content-Type": "text/plain; charset=utf-8" } }
        );
      } catch (err) {
        return new Response("Erro: " + err.message, { status: 500 });
      }
    }

    // Monitor de notas manual: /notas?token=...  (&reset=1 zera o histórico)
    if (url.pathname === "/notas") {
      if (!env.TOKEN || url.searchParams.get("token") !== env.TOKEN) {
        return new Response("Não autorizado", { status: 401 });
      }
      try {
        if (url.searchParams.get("reset") === "1" && env.NOTAS) await env.NOTAS.delete("snapshot");
        const resultado = await verificarNotas(env);
        return new Response(resultado, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
      } catch (err) {
        return new Response("Erro: " + err.message, { status: 500 });
      }
    }

    // Diagnóstico (não envia nada nem grava): /boletim?token=...
    if (url.pathname === "/boletim") {
      if (!env.TOKEN || url.searchParams.get("token") !== env.TOKEN) {
        return new Response("Não autorizado", { status: 401 });
      }
      try {
        const html = await baixarBoletimHtml(env.SUAP_USER, env.SUAP_PASS);
        parseMaterias(html);
        const { notas, cabecalho } = extrairNotas(html);
        return new Response(JSON.stringify({ cabecalho, notas }, null, 2), {
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      } catch (err) {
        return new Response("Erro: " + err.message, { status: 500 });
      }
    }

    // Relatório manual pela página
    if (url.pathname === "/processar" && request.method === "POST") {
      try {
        const formData = await request.formData();
        const usuario = (formData.get("usuario") || "").toString().trim();
        const senha = (formData.get("senha") || "").toString();
        const telefone = (formData.get("telefone") || "").toString().replace(/\D/g, "");

        if (!usuario || !senha) {
          return json({ erro: "Matrícula e senha são obrigatórias." }, 400);
        }

        const materias = await buscarMaterias(usuario, senha);
        return json({
          materias,
          mensagem: montarMensagemCompleta(materias),
          telefone,
        });
      } catch (err) {
        return json({ erro: "Erro ao processar: " + err.message }, 500);
      }
    }

    return new Response(HTML_PAGE, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
};
