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
                resultadoDiv.innerHTML = `<p style="color: #ef4444; text-align: center;">\${data.erro}</p>`;
                return;
            }

            let html = '<h3>Relatório Gerado:</h3>';
            data.materias.forEach(item => {
                let statusClass = 'OK';
                if (item.restantes < 0) statusClass = 'ESTOURADO';
                else if (item.restantes <= 2) statusClass = 'PERIGO';

                html += `
                    <div class="card \${statusClass}">
                        <span class="badge bg-\${statusClass}">\${statusClass}</span>
                        <strong>\${item.disciplina}</strong><br>
                        <small>Faltas acumuladas: \${item.faltas} de \${item.limite_max} permitidas</small><br>
                        <small>Frequência atual: \${item.freq_atual}</small><br>
                        <strong>Faltas restantes no curso: \${item.restantes}</strong>
                    </div>
                `;
            });

            const urlWa = `https://api.whatsapp.com/send?phone=\${data.telefone}&text=\${encodeURIComponent(data.mensagem)}`;
            html += `<a href="\${urlWa}" target="_blank" class="whatsapp-btn">📲 Enviar Relatório pelo WhatsApp</a>`;

            resultadoDiv.innerHTML = html;
        });
    </script>
</body>
</html>`;

function stripTags(html) {
    return html.replace(/<[^>]*>/g, '').trim();
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

                const loginUrl = "https://suap.ifba.edu.br/accounts/login/";
                const loginPageRes = await fetch(loginUrl);
                const loginHtml = await loginPageRes.text();
                const setCookie = loginPageRes.headers.get('set-cookie') || '';

                const csrfMatch = loginHtml.match(/name=["']csrfmiddlewaretoken["']\s+value=["']([^"']+)["']/);
                if (!csrfMatch) {
                    return new Response(JSON.stringify({ erro: "Não foi possível obter o token de segurança do SUAP." }), {
                        status: 500,
                        headers: { "Content-Type": "application/json" }
                    });
                }

                const csrfToken = csrfMatch[1];
                const bodyParams = new URLSearchParams({
                    'username': usuario,
                    'password': senha,
                    'csrfmiddlewaretoken': csrfToken
                });

                const postRes = await fetch(loginUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Referer': loginUrl,
                        'Cookie': setCookie
                    },
                    body: bodyParams.toString()
                });

                const postHtml = await postRes.text();
                if (postHtml.includes("Usuário ou senha inválidos")) {
                    return new Response(JSON.stringify({ erro: "Matrícula ou senha incorretas." }), {
                        status: 401,
                        headers: { "Content-Type": "application/json" }
                    });
                }

                const authCookie = postRes.headers.get('set-cookie') || setCookie;
                const boletimUrl = `https://suap.ifba.edu.br/edu/aluno/${usuario}/?tab=boletim`;
                const boletimRes = await fetch(boletimUrl, {
                    headers: { 'Cookie': authCookie }
                });
                const boletimHtml = await boletimRes.text();

                const trBlocks = boletimHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
                const dadosMaterias = [];
                let textoMensagem = "📊 *BOLETIM SUAP - CONTROLE DE FALTAS*\n\n";

                for (const tr of trBlocks) {
                    const tdBlocks = tr.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || [];
                    const cols = tdBlocks.map(stripTags);

                    if (cols.length < 5) continue;
                    if (cols[0].toLowerCase().includes('disciplina') || cols[1].toLowerCase().includes('disciplina')) continue;

                    const disciplina = cols[1].length > 2 ? cols[1] : cols[0];
                    let totalAulasMateria = null;
                    let faltasAtuais = 0;
                    let freqRaw = "100%";

                    for (const val of cols.slice(2)) {
                        if (val.includes('%')) {
                            freqRaw = val;
                        } else if (!isNaN(val) && val.trim() !== '') {
                            const num = parseInt(val, 10);
                            if (totalAulasMateria === null && num > 10) {
                                totalAulasMateria = num;
                            } else if (totalAulasMateria !== null) {
                                faltasAtuais = num;
                            }
                        }
                    }

                    if (!totalAulasMateria) continue;

                    const limiteMaxFaltas = Math.floor(totalAulasMateria * 0.25);
                    const faltasRestantes = limiteMaxFaltas - faltasAtuais;

                    dadosMaterias.push({
                        disciplina,
                        total_aulas: totalAulasMateria,
                        faltas: faltasAtuais,
                        freq_atual: freqRaw,
                        limite_max: limiteMaxFaltas,
                        restantes: faltasRestantes
                    });

                    let alerta = "✅ *OK*";
                    if (faltasRestantes < 0) alerta = `🚨 *ESTOURADO!* (${Math.abs(faltasRestantes)} além do limite)`;
                    else if (faltasRestantes <= 2) alerta = "⚠️ *ATENÇÃO! PRÓXIMO DO LIMITE*";

                    textoMensagem += `🔹 *${disciplina}*\n`;
                    textoMensagem += `   • Faltas acumuladas: ${faltasAtuais} de ${limiteMaxFaltas} permitidas\n`;
                    textoMensagem += `   • Frequência atual: ${freqRaw}\n`;
                    textoMensagem += `   • Faltas restantes permitidas: *${faltasRestantes}* ${alerta}\n\n`;
                }

                if (dadosMaterias.length === 0) {
                    return new Response(JSON.stringify({ erro: "Nenhuma disciplina com faltas registrada no período atual." }), {
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
                return new Response(JSON.stringify({ erro: `Erro no servidor: ${err.message}` }), {
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