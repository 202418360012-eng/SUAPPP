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
        document.getElementById('suapForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const resultadoDiv = document.getElementById('resultado');
            resultadoDiv.innerHTML = '<p style="text-align:center; color: #64748b;">Acessando SUAP e calculando faltas...</p>';

            const formData = new FormData(this);
            const response = await fetch('/processar', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            
            if (data.erro) {
                resultadoDiv.innerHTML = '<p style="color: #ef4444; text-align: center;">' + data.erro + '</p>';
                return;
            }

            let html = '<h3>Relatório Gerado:</h3>';
            data.materias.forEach(item => {
                let statusClass = 'OK';
                if (item.restantes < 0) statusClass = 'ESTOURADO';
                else if (item.restantes <= 2) statusClass = 'PERIGO';

                html += '<div class="card ' + statusClass + '">' +
                        '<span class="badge bg-' + statusClass + '">' + statusClass + '</span>' +
                        '<strong>' + item.disciplina + '</strong><br>' +
                        '<small>Faltas acumuladas: ' + item.faltas + ' de ' + item.limite_max + ' permitidas</small><br>' +
                        '<small>Frequência atual: ' + item.freq_atual + '</small><br>' +
                        '<strong>Faltas restantes no curso: ' + item.restantes + '</strong>' +
                    '</div>';
            });

            const urlWa = 'https://api.whatsapp.com/send?phone=' + data.telefone + '&text=' + encodeURIComponent(data.mensagem);
            html += '<a href="' + urlWa + '" target="_blank" class="whatsapp-btn">📲 Enviar Relatório pelo WhatsApp</a>';

            resultadoDiv.innerHTML = html;
        });
    </script>
</body>
</html>`;

function cleanText(text) {
    return text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function parseCookies(headers) {
    const cookies = [];
    headers.forEach((value, key) => {
        if (key.toLowerCase() === 'set-cookie') {
            const parts = value.split(';');
            if (parts.length > 0) cookies.push(parts[0].trim());
        }
    });
    return cookies.join('; ');
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        if (url.pathname === '/processar' && request.method === 'POST') {
            try {
                const formData = await request.formData();
                const usuario = formData.get('usuario');
                const senha = formData.get('senha');
                const telefone = formData.get('telefone');

                if (!usuario || !senha) {
                    return new Response(JSON.stringify({ erro: "Matrícula e senha são obrigatórias." }), {
                        status: 400,
                        headers: { "Content-Type": "application/json" }
                    });
                }

                const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
                const loginUrl = "https://suap.ifba.edu.br/accounts/login/";

                // 1. Obter formulário inicial e CSRF Token
                const initialRes = await fetch(loginUrl, {
                    headers: { 'User-Agent': userAgent }
                });
                const initialHtml = await initialRes.text();
                const initialCookies = parseCookies(initialRes.headers);

                const csrfMatch = initialHtml.match(/name=["']csrfmiddlewaretoken["']\s+value=["']([^"']+)["']/);
                if (!csrfMatch) {
                    return new Response(JSON.stringify({ erro: "Não foi possível conectar ao servidor do SUAP." }), {
                        status: 500,
                        headers: { "Content-Type": "application/json" }
                    });
                }

                const csrfToken = csrfMatch[1];
                const loginBody = new URLSearchParams({
                    'username': usuario,
                    'password': senha,
                    'csrfmiddlewaretoken': csrfToken,
                    'next': ''
                });

                // 2. Realizar Login
                const loginRes = await fetch(loginUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent': userAgent,
                        'Referer': loginUrl,
                        'Cookie': initialCookies
                    },
                    body: loginBody.toString(),
                    redirect: 'manual'
                });

                const authCookies = parseCookies(loginRes.headers) || initialCookies;
                const postHtml = await loginRes.text();

                if (postHtml.includes("Usuário ou senha inválidos") || postHtml.includes("Informe um usuário e senha válidos")) {
                    return new Response(JSON.stringify({ erro: "Matrícula ou senha incorretas." }), {
                        status: 401,
                        headers: { "Content-Type": "application/json" }
                    });
                }

                // 3. Acessar página de diários / boletim do aluno
                const boletimUrl = "https://suap.ifba.edu.br/edu/aluno/" + usuario + "/";
                const boletimRes = await fetch(boletimUrl, {
                    headers: {
                        'User-Agent': userAgent,
                        'Cookie': authCookies
                    }
                });

                const boletimHtml = await boletimRes.text();
                const trMatches = boletimHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
                const dadosMaterias = [];
                let textoMensagem = "📊 *BOLETIM SUAP - CONTROLE DE FALTAS*\n\n";

                for (const tr of trMatches) {
                    const tdMatches = tr.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
                    if (tdMatches.length < 3) continue;

                    const cols = tdMatches.map(cleanText);
                    const lineText = cols.join(" ").toLowerCase();

                    if (lineText.includes("componente") || lineText.includes("c.h.") || lineText.includes("manual")) continue;

                    let disciplina = cols[1] && cols[1].length > 3 ? cols[1] : cols[0];
                    if (disciplina.includes('-')) {
                        const parts = disciplina.split('-');
                        if (parts.length > 1 && parts[0].trim().length <= 10) {
                            disciplina = parts.slice(1).join('-').trim();
                        }
                    }

                    if (!disciplina || disciplina.length < 3) continue;

                    let totalAulas = 80;
                    let faltas = 0;
                    let freq = "100%";

                    for (const val of cols) {
                        if (val.includes('%')) {
                            freq = val;
                        } else if (!isNaN(val) && val !== '') {
                            const num = parseInt(val, 10);
                            if (num >= 20 && num <= 240) totalAulas = num;
                            else if (num >= 0 && num < 20) faltas = num;
                        }
                    }

                    const limiteMax = Math.floor(totalAulas * 0.25);
                    const restantes = limiteMax - faltas;

                    dadosMaterias.push({
                        disciplina,
                        total_aulas: totalAulas,
                        faltas,
                        freq_atual: freq,
                        limite_max: limiteMax,
                        restantes
                    });

                    let alerta = "✅ *OK*";
                    if (restantes < 0) alerta = "🚨 *ESTOURADO!* (" + Math.abs(restantes) + " além do limite)";
                    else if (restantes <= 2) alerta = "⚠️ *ATENÇÃO! PRÓXIMO DO LIMITE*";

                    textoMensagem += "🔹 *" + disciplina + "*\n";
                    textoMensagem += "   • Faltas acumuladas: " + faltas + " de " + limiteMax + " permitidas\n";
                    textoMensagem += "   • Frequência atual: " + freq + "\n";
                    textoMensagem += "   • Faltas restantes permitidas: *" + restantes + "* " + alerta + "\n\n";
                }

                if (dadosMaterias.length === 0) {
                    return new Response(JSON.stringify({ erro: "Sessão iniciada, mas nenhuma matéria foi identificada no perfil do aluno." }), {
                        status: 404,
                        headers: { "Content-Type": "application/json" }
                    });
                }

                textoMensagem += "───────────────────────────\n_Relatório gerado via Painel Web SUAP._";

                return new Response(JSON.stringify({
                    materias: dadosMaterias,
                    mensagem: textoMensagem,
                    telefone
                }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                });

            } catch (err) {
                return new Response(JSON.stringify({ erro: "Erro na conexão: " + err.message }), {
                    status: 500,
                    headers: { "Content-Type": "application/json" }
                });
            }
        }

        return new Response(HTML_PAGE, {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8" }
        });
    }
};
