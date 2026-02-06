
const registrosOCR = [];
let MODO_ADICIONAR = false;
let MODO_PARSE = false;

document.addEventListener('DOMContentLoaded', async () => {

  'use strict';
    const arquivosAnexados = new Set();
    /* ========= LOAD LIBS ========= */
    function load(src){
        return new Promise(r=>{
            const s=document.createElement('script');
            s.src=src;
            s.onload=r;
            document.head.appendChild(s);
        });
    }
    if (!window.XLSX)
        await load('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');

    if(!window.Tesseract)
        await load('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');

    if(!window.pdfjsLib){
        await load('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
        pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    function gerarId() {
        return 'ocr_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    }

    function restaurarCardsDaTela() {
        registrosOCR.forEach(r => {

            const nomeCurto = limitarNomeArquivo(r.arquivo || '', 10);
            const body = criarDoc(nomeCurto);

            body.dataset.salvo = '1';
            body.dataset.ocrId = r.id;

            atualizarVisualFinal(body);
            // ✅ ESSENCIAL
        });

        atualizarContador();
        atualizarTotalTela();
    }
    function calcularTotalTela() {
        let total = 0;

        registrosOCR.forEach(r => {
            const pix = parseValor(r.valor);
            const taxa = Number(r.taxa || 0);

            if (pix.numero !== null) {
                total += pix.numero - taxa;
            }
        });

        return total;
    }
    function calcularTaxaServico(valor) {
        if (valor <= 150) return 0.18;
        if (valor <= 300) return 0.12;
        if (valor <= 450) return 0.10;
        return 0.06;
    }

    function atualizarVisualFinal(body) {
        if (!body) return;

        const id = body.dataset.ocrId;
        if (!id) return;

        const r = registrosOCR.find(x => x.id === id);
        if (!r) return;

        const pix = parseValor(r.valor);
        const taxa = Number(r.taxa || 0);

        let pixLiquidoTxt = r.valor || '-';

        if (pix.numero !== null) {
            const liquido = pix.numero - taxa;
            pixLiquidoTxt = liquido
                .toFixed(2)
                .replace('.', ',');
        }

        body.innerHTML = `
  <span class="final-nome">${r.nome || '-'}</span>
  <span class="final-hora">${r.hora || '-'}</span>
  <span class="final-pix">R$ ${pixLiquidoTxt}</span>
  <span class="final-taxa">
    ${taxa > 0 ? `R$ ${taxa.toFixed(2).replace('.', ',')}` : '-'}
  </span>
`;

    }



    function atualizarTotalTela() {
        const total = calcularTotalTela();
        totalTela.textContent =
            `TOTAL R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

    }
    function addStyle(css) {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}
    const STORAGE_KEY = 'OCR_REGISTROS_V1';

    function salvarStorage() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(registrosOCR));
    }

    function carregarStorage() {
        try {
            const salvo = localStorage.getItem(STORAGE_KEY);
            if (salvo) {
                const dados = JSON.parse(salvo);
                if (Array.isArray(dados)) {
                    registrosOCR.length = 0;
                    dados.forEach(d => registrosOCR.push(d));
                }
            }
        } catch (e) {
            console.warn('Erro ao carregar storage', e);
        }
    }

    function limparStorage() {
        localStorage.removeItem(STORAGE_KEY);
    }

    /* ========= UI ========= */
    const overlay = document.createElement('div');
    overlay.className = 'ocr-overlay';

    const box = document.createElement('div');
    box.className = 'ocr-box';
    // Criar o container para os botões
    const topActions = document.createElement('div');
    topActions.className = 'ocr-top-actions';
    box.appendChild(topActions);

    const maxBtn = document.createElement('button');
    topActions.appendChild(maxBtn);


    const darkBtn = document.createElement('button');
    darkBtn.textContent = '🌙';
    darkBtn.title = 'Modo escuro';

    topActions.appendChild(darkBtn);


    const drop = document.createElement('div');
    drop.className = 'ocr-drop';
    drop.textContent = '📄 Arraste, clique';

    // 🔢 CONTADOR DE ARQUIVOS
    const counter = document.createElement('div');
    counter.style.cssText = `
  margin:6px 0 12px 0;
  font-size:20px;
  font-weight:bold;
  color: #0d47a1;
`;
    counter.textContent = 'ARQUIVO 0';

    // 💰 TOTAL DA TELA
    const totalTela = document.createElement('div');
    totalTela.style.cssText = `
  margin: 0 0 12px 0;
  font-size: 20px;
  font-weight: bold;
  color: #0d47a1;
`;
    totalTela.textContent = 'TOTAL R$ 0,00';

    // 📦 WRAPPER INFO (ARQUIVO + TOTAL)
    const infoWrapper = document.createElement('div');
    infoWrapper.className = 'ocr-info';
    infoWrapper.append(counter, totalTela);

    const list = document.createElement('div');
    list.className = 'ocr-list';


const btnExcel  = document.getElementById('btnExcel');
const btnFechar = document.getElementById('btnFechar');

if (btnExcel) {
  btnExcel.onclick = gerarRelatorioExcel;
}

if (btnFechar) {
  btnFechar.onclick = () => {
    overlay.style.display = 'none';
  };
}

    // 👤 CAMPO AGENTE
    const agenteInput = document.createElement('input');
    agenteInput.placeholder = 'Nome do agente';
    agenteInput.value = localStorage.getItem('OCR_AGENTE_NOME') || 'GILVAN LIMA';

    agenteInput.className = 'ocr-input';
    // 💾 salva nome do agente automaticamente
    agenteInput.addEventListener('input', () => {
        localStorage.setItem('OCR_AGENTE_NOME', agenteInput.value.trim());
    });

    // 📋 SELECT TIPO
    const tipoSelect = document.createElement('select');
    tipoSelect.className = 'ocr-select';

    [
        'TOP VIAGENS',
        'VALE VIAGENS',
        'SUPORTE ONLINE',
        'AGENCIA',
        'CANOA'
    ].forEach(op => {
        const o = document.createElement('option');
        o.value = op;
        o.textContent = op;
        tipoSelect.appendChild(o);
    });
    // 📦 WRAPPER NOME + TIPO
    const headerForm = document.createElement('div');
    headerForm.className = 'ocr-header-form';

    headerForm.append(
        agenteInput,
        tipoSelect
    );
    const calcPanel = document.createElement('div');
    calcPanel.className = 'calc-panel';

    calcPanel.innerHTML = `
  <h3>🧮 Calculadora de Taxa</h3>

  <input type="text" id="calcValorInline" placeholder="Digite o valor (ex: 250,00)">

  <div class="calc-result" id="calcResultadoInline">
    Informe um valor para calcular.
  </div>
`;
    const inputCalc = calcPanel.querySelector('#calcValorInline');
    const resultadoCalc = calcPanel.querySelector('#calcResultadoInline');

    inputCalc.addEventListener('input', () => {
        let v = inputCalc.value
        .replace(/[^\d,]/g, '')
        .replace(',', '.');

        const valor = Number(v);

        if (isNaN(valor) || valor <= 0) {
            resultadoCalc.innerHTML = 'Informe um valor válido.';
            return;
        }

        const taxaPerc = calcularTaxaServico(valor);
        const taxaValor = valor * taxaPerc;


        resultadoCalc.innerHTML = `
    💰 Valor bruto: <b>R$ ${valor.toFixed(2).replace('.', ',')}</b><br>
    ⚙️ Taxa: <b>${(taxaPerc * 100).toFixed(0)}%</b><br>
    ➖ Taxa serviço: <b>R$ ${taxaValor.toFixed(2).replace('.', ',')}</b><br>
  `;
    });

    box.append(
        drop,
        headerForm,
        calcPanel,      // 👈 AQUI
        infoWrapper,
        list,
    );


    overlay.append(box);
document.getElementById('app-root').appendChild(overlay);
overlay.style.display = 'block';

    carregarStorage();
    restaurarCardsDaTela();
    atualizarTotalTela();
    atualizarContador();

// 🪟 MODAL RODOVIÁRIAS
const modalRod = document.createElement('div');

  modalRod.style.cssText = `
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.5);
  z-index: 10000000; /* acima do OCR fullscreen */
  display: none;
`;


modalRod.innerHTML = `
  <div style="
    background:#fff;
    width:600px;
    max-width:95%;
    max-height:80vh;
    margin:5vh auto;
    padding:16px;
    border-radius:12px;
    overflow:auto;
  ">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <h3>🚌 Rodoviárias</h3>
      <button id="fecharRod">✖</button>
    </div>

    <input
      id="buscaRod"
      placeholder="Buscar rodoviária ou cidade"
      style="width:100%;padding:8px;margin:10px 0"
    />

    <div id="listaRod"></div>
  </div>
`;

document.body.appendChild(modalRod);
// ===== SIDEBAR ACTIONS =====
const btnCalcSidebar = document.getElementById('btnCalc');
const btnRodSidebar  = document.getElementById('btnRod');

if (btnCalcSidebar) {
  btnCalcSidebar.onclick = () => {
    const aberto = calcPanel.style.display === 'block';
    calcPanel.style.display = aberto ? 'none' : 'block';

    if (!aberto) {
      calcPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
}

if (btnRodSidebar) {
  btnRodSidebar.onclick = async () => {
    modalRod.style.display = 'block';
    await carregarRodoviarias();
  };
}

  
let rodoviarias = [];

// 🔹 Carrega JSON apenas uma vez
async function carregarRodoviarias() {
  if (rodoviarias.length) return;

  try {
    const res = await fetch('./rodoviarias.json');

    if (!res.ok) {
      throw new Error('Erro ao carregar rodoviarias.json');
    }

    const data = await res.json();

    if (!Array.isArray(data)) {
      console.error('rodoviarias.json não é um array');
      rodoviarias = [];
    } else {
      rodoviarias = data;
    }

    renderRodoviarias(rodoviarias);

  } catch (e) {
    console.error('Erro ao carregar rodoviárias:', e);

    const container = modalRod.querySelector('#listaRod');
    if (container) {
      container.innerHTML =
        '<p style="opacity:.6;text-align:center">Erro ao carregar rodoviárias</p>';
    }
  }
}


// 🔹 Renderiza lista
function renderRodoviarias(lista) {
  const container = modalRod.querySelector('#listaRod');
  container.innerHTML = '';

  if (!lista.length) {
    container.innerHTML =
      '<p style="opacity:.6;text-align:center">Nenhuma rodoviária encontrada</p>';
    return;
  }

  lista.forEach(r => {
    const item = document.createElement('div');
    item.className = 'rod-item';

    const cidade = r['CIDADE - UF'] || '';
const nome = r['Nome'] || '';
const endereco = r['Descricao'] || '';

item.innerHTML = `
  <div class="rod-nome">${nome}</div>
  <div class="rod-cidade">${cidade}</div>
  <div class="rod-endereco">${endereco}</div>
`;
    // 📋 clique copia endereço
    item.onclick = () => {
      navigator.clipboard.writeText(endereco);
      item.classList.add('rod-copiado');

      setTimeout(() => {
        item.classList.remove('rod-copiado');
      }, 600);
    };

    container.appendChild(item);
  });
}


// 🔹 Fechar modal
modalRod.querySelector('#fecharRod').onclick = () => {
  modalRod.style.display = 'none';
};

// 🔹 Busca em tempo real
modalRod.querySelector('#buscaRod').oninput = e => {
  const termo = e.target.value.toLowerCase();

  const filtradas = rodoviarias.filter(r =>
    (r['CIDADE - UF'] || '').toLowerCase().includes(termo) ||
    (r['Nome'] || '').toLowerCase().includes(termo) ||
    (r['Descricao'] || '').toLowerCase().includes(termo)
  );

  renderRodoviarias(filtradas);
};
  
    closeBtn.onclick=()=>overlay.style.display='none';

    /* ========= INPUT ========= */
    const input=document.createElement('input');
    input.type='file';
    input.accept='.png,.jpg,.jpeg,.pdf';
    input.multiple=true;
    input.hidden=true;
    document.body.appendChild(input);

    const inputAdd = document.createElement('input');
    inputAdd.type = 'file';
    inputAdd.accept = '.png,.jpg,.jpeg,.pdf';
    inputAdd.multiple = true;
    inputAdd.hidden = true;
    document.body.appendChild(inputAdd);

    drop.onclick=()=>input.click();
    drop.ondragover=e=>e.preventDefault();
    drop.ondrop=e=>{
        e.preventDefault();
        processFiles(e.dataTransfer.files);
    };
    input.onchange=()=>processFiles(input.files);

    let fullscreen = false;
    let estadoOriginal = {};
    let darkMode = localStorage.getItem('OCR_DARK') === '1';

    if (darkMode) {
        overlay.classList.add('dark');
        darkBtn.textContent = '☀️';
    }

    darkBtn.onclick = () => {
        darkMode = !darkMode;

        overlay.classList.toggle('dark', darkMode);
        darkBtn.textContent = darkMode ? '☀️' : '🌙';

        localStorage.setItem('OCR_DARK', darkMode ? '1' : '0');
    };

    
    /* ========= SOBRENOMES ========= */
    const SOBRENOMES=new Set([
        'SILVA','SANTOS','OLIVEIRA','PEREIRA','COSTA','RODRIGUES','ALVES','LIMA','GOMES',
        'RIBEIRO','CARVALHO','SOUZA','FERNANDES','ARAUJO','ROCHA','MARTINS','BARROS',
        'FREITAS','BATISTA','TEIXEIRA','NOGUEIRA','MOREIRA','CUNHA','CORREIA','MENDES',
        'PACHECO','FARIAS','MACEDO','GUEDES','MOURA','AZEVEDO','TORRES','ANTUNES',
        'FIGUEIREDO','SIQUEIRA','PAIVA','TAVARES','BEZERRA','LOPES','DANTAS','AMARAL',
        'FONSECA','MAGALHAES','NEVES','VASCONCELOS','NASCIMENTO','GUIMARAES'
    ]);

    function ehSobrenomeProvavel(p){
        return SOBRENOMES.has(
            p.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()
        );
    }
    /* ========= BANCO ========= */
    function identificarBanco(texto){
        const t = texto.toUpperCase();

        if (
            t.includes('MERCADO PAGO') &&
            t.includes('COMPROVANTE DE PIX')
        ) {
            return 'MERCADO_PAGO';
        }

        // 🔵 BANCO DO BRASIL (APP BB)
        if (
            (t.includes('COMPROVANTE BB') || t.startsWith('BANCO DO BRASIL')) &&
            !t.includes('MERCADO PAGO')
        ) {
            return 'BB';
        }

        // 🟠 BANCO INTER
        if (
            t.includes('BANCO INTER')
        ) {
            return 'INTER';
        }

        // 🟣 NUBANK
        if (
            t.includes('NUBANK')
        ) {
            return 'NUBANK';
        }
        // 🔴 SANTANDER
        if (
            t.includes('SANTANDER') ||
            t.includes('BANCO SANTANDER') ||
            t.includes('COMPROVANTE DO PIX') && t.includes('SANTANDER')
        ) {
            return 'SANTANDER';
        }
        // 🔴 BRADESCO
        if (
            t.includes('BRADESCO')
        ) {
            return 'BRADESCO';
        }
        // 🔵 ITAÚ
        if (
            t.includes('ITAU') ||
            t.includes('ITAÚ')
        ) {
            return 'ITAU';
        }
        // 🟦 CAIXA
        if (
            t.includes('CAIXA ECONÔMICA') ||
            t.includes('CAIXA ECONOMICA') ||
            t.includes('CAIXA')
        ) {
            return 'CAIXA';
        }
        // 🟢 PICPAY
        if (
            t.includes('PICPAY') ||
            t.includes('COMPROVANTE DE PIX') && t.includes('PICPAY')
        ) {
            return 'PICPAY';
        }
        if (
            t.includes('BANCO C6') ||
            t.includes('BANCO: 336') ||
            t.includes(' C6 ') ||
            t.includes('\nC6\n') ||
            t.includes('C6 AR') ||   // cobre C6ArNK
            t.includes('C6ARNK')
        ) {
            return 'C6';
        }
        // 🚌 PASSAGEM RODOVIÁRIA (GUANABARA)
        if (
            t.includes('VIA DO PASSAGEIRO') ||
            t.includes('GUANABARA') ||
            t.includes('GUANASARA')
        ) {
            return 'PASSAGEM';
        }
        // 🟢 BANCO DO NORDESTE (BNB)
        if (
            t.includes('BANCO DO NORDESTE') ||
            t.includes('BNB')
        ) {
            return 'BNB';
        }
        return 'OUTRO';
    }
    function removerSegundos(hora) {
        if (!hora) return hora;
        // remove apenas :SS (HH:MM:SS → HH:MM)
        return hora.replace(/:(\d{2})$/, match =>
                            hora.split(':').length === 3 ? '' : match
                           );
    }

    function jaEstaFinal(body) {
        return body.querySelector('.doc-final') !== null;
    }

    function extrairHoraUniversal(linhasHTML) {
        for (let i = 0; i < linhasHTML.length; i++) {
            let t = linhasHTML[i]
            .querySelector('span:last-child')
            ?.textContent || '';

            t = t
                .toLowerCase()
                .replace(/às/g, 'as')
                .replace(/o/g, '0')
                .trim();

            // às 14h00 | as 14h00 | 14h00
            let m = t.match(/(?:as\s*)?(\d{1,2})h(\d{2})/);
            if (m) return `${m[1].padStart(2,'0')}:${m[2]}`;

            // 14:00
            m = t.match(/\b(\d{2}):(\d{2})\b/);
            if (m) return `${m[1]}:${m[2]}`;

            // 1400
            m = t.match(/\b(\d{2})(\d{2})\b/);
            if (m) return `${m[1]}:${m[2]}`;
        }

        return '';
    }
    function extrairValorUniversal(linhasHTML) {
        let inteiro = '';
        let erroCentavos = false;

        for (let i = 0; i < linhasHTML.length; i++) {
            let t = linhasHTML[i]
            .querySelector('span:last-child')
            ?.textContent || '';

            t = t.replace(/O/g,'0').replace(/o/g,'0');

            // R$ 8,00
            let m = t.match(/R\$\s*(\d+)[,.](\d{2})/);
            if (m) return `${m[1]},${m[2]}`;

            // R$ 8° | R$ 8%
            m = t.match(/R\$\s*(\d+)\s*[%°º]/);
            if (m) {
                inteiro = m[1];
                erroCentavos = true;
                break;
            }

            // R$ 800
            m = t.match(/R\$\s*(\d+)/);
            if (m) {
                inteiro = m[1];
                break;
            }
        }

        if (erroCentavos && inteiro) {
            return `${inteiro}, erro ao ler centavos`;
        }

        if (inteiro) {
            if (inteiro.length === 1) return `0,0${inteiro}`;
            if (inteiro.length === 2) return `0,${inteiro}`;
            return `${inteiro.slice(0,-2)},${inteiro.slice(-2)}`;
        }

        return '';
    }
    function extrairNomeGlobal(linhasHTML) {
        const stopWords = [
            'instituicao',
            'instituição',
            'banco',
            'agencia',
            'agência',
            'conta',
            'cpf',
            'cnpj',
            'pix'
        ];

        for (let i = 0; i < linhasHTML.length; i++) {
            const atual = linhasHTML[i]
            .querySelector('span:last-child')
            ?.textContent
            ?.trim() || '';

            const t = atual.toLowerCase();

            if (t === 'origem' || t === 'pagador' || t === 'quem pagou') {

                for (let j = 1; j <= 3; j++) {
                    const prox = linhasHTML[i + j]
                    ?.querySelector('span:last-child')
                    ?.textContent
                    ?.trim() || '';

                    if (!prox) continue;

                    const p = prox.toLowerCase();

                    // ignora lixo
                    if (stopWords.some(w => p.includes(w))) continue;

                    // ignora linhas vazias / símbolos
                    if (prox.length < 4) continue;

                    // remove "Nome:"
                    return limparNome(prox);
                }
            }
        }

        return '';
    }

    function renderFinal(body, { nome, hora, valor }) {

        if (nome) {
            const nomeNorm = normalizarNome(nome);

            if (NOMES_PROIBIDOS.some(n => nomeNorm.includes(n))) {
                nome = '-'; // 🔒 some da tela e do total
            }
        }

        if (MODO_PARSE) {
            body.innerHTML = `
      <div class="doc-line doc-final">
        <span class="final-nome">${nome || '-'}</span>
        <span class="final-hora">${hora || '-'}</span>
        <span class="final-pix">${valor || '-'}</span>
      </div>
    `;
            return;
        }
        let valorLimpo = (valor || '')
        .replace(/R\$\s*/gi, '')
        .trim();

        if (!body.dataset.salvo) {
            const novoId = gerarId();
            body.dataset.ocrId = novoId;

            registrosOCR.push({
                id: novoId,
                arquivo: body.dataset.nomeArquivo || '',
                nome: nome || '',
                hora: hora || '',
                valor: valorLimpo || '',
                taxa: 0
            });

            body.dataset.salvo = '1';
            salvarStorage();
            atualizarContador();
        } else {
            const r = registrosOCR.find(x => x.id === body.dataset.ocrId);
            if (r) {
                r.nome = nome || r.nome;
                r.hora = hora || r.hora;
                r.valor = valorLimpo || r.valor;
                salvarStorage();
            }
        }

        atualizarVisualFinal(body);

        atualizarTotalTela();
    }


    function horaParaMinutos(hora) {
        if (!hora || !hora.includes(':')) return 9999;
        const [h, m] = hora.split(':').map(Number);
        return (h * 60) + m;
    }
    function limparCPFdoNome(nome) {
        if (!nome) return nome;

        // mantém apenas letras e espaços
        return nome
            .normalize('NFD')
            .replace(/[^A-Za-zÀ-ÿ\s]/g, ' ') // remove tudo que não é letra
            .replace(/\s{2,}/g, ' ')
            .trim();
    }

    function limparNome(n) {
        return n
            .replace(/^\s*NOME\s*:?\s*/i, '') // remove "Nome", "NOME :", etc
            .replace(/^N0ME\s*/i, 'NOME ')
            .trim();
    }

    function regraBancoBrasil(texto, body) {
        const linhasHTML = body.querySelectorAll('.doc-line');

        let valor = '';
        let hora  = '';
        let nome  = '';

        function txtLinha(i) {
            return linhasHTML[i]
                ?.querySelector('span:last-child')
                ?.textContent
                ?.trim() || '';
        }


        for (let i = 0; i < linhasHTML.length; i++) {
            const t = txtLinha(i);
            const m = t.match(/R\$\s*\d{1,3}(\.\d{3})*,\d{2}/);
            if (m) {
                valor = m[0];
                break;
            }
        }

        for (let i = 0; i < linhasHTML.length; i++) {
            const t = txtLinha(i);
            const m = t.match(/\b\d{2}:\d{2}(:\d{2})?\b/);
            if (m) {
                hora = m[0];
                break;
            }
        }

        for (let i = 0; i < linhasHTML.length; i++) {
            const t = txtLinha(i).toUpperCase();

            if (
                t === 'PAGADOR' ||
                t === 'ORIGEM' ||
                t === 'QUEM PAGOU'
            ) {
                for (let j = 1; j <= 3; j++) {
                    let candidato = txtLinha(i + j);
                    if (!candidato) continue;

                    candidato = candidato
                        .replace(/[*•:]+$/g, '')
                        .replace(/[^A-Za-zÀ-ÿ\s]/g, ' ')
                        .replace(/\s{2,}/g, ' ')
                        .trim();

                    if (
                        candidato.length >= 6 &&
                        !/CPF|CNPJ|AGÊNCIA|CONTA|BANCO/i.test(candidato)
                    ) {
                        nome = candidato;
                        break;
                    }
                }
                if (nome) break;
            }
        }

        renderFinal(body, {
            nome: nome || '-',
            hora: removerSegundos(hora) || '-',
            valor: valor || '-'
        });
    }

    function regraNubank(texto, body) {
        const linhasHTML = body.querySelectorAll('.doc-line');

        let valor = '';
        let hora  = '';
        let nome  = '';

        function txtLinha(n) {
            return linhasHTML[n]
                ?.querySelector('span:last-child')
                ?.textContent
                ?.trim() || '';
        }

        function extrairHora(n) {
            const m = txtLinha(n).match(/\b\d{2}:\d{2}(:\d{2})?\b/);
            return m ? m[0] : '';
        }

        function extrairValor(n) {
            const m = txtLinha(n).match(/R\$\s*\d{1,3}(\.\d{3})*,\d{2}/);
            return m ? m[0] : '';
        }

        /* =====================================================
     CASO 1 — "TRANSFERÊNCIA" NA LINHA 4
  ====================================================== */
        if (txtLinha(3).toUpperCase().includes('TRANSFERÊNCIA')) {

            hora  = extrairHora(5); // linha 6
            valor = extrairValor(7); // linha 8

            for (let i = 0; i < linhasHTML.length; i++) {
                if (txtLinha(i).toUpperCase() === 'ORIGEM') {

                    // tenta 1 linha abaixo
                    if (txtLinha(i + 1).toUpperCase().startsWith('NOME')) {
                        nome = limparNome(txtLinha(i + 1));
                    }
                    // tenta 2 linhas abaixo
                    else if (txtLinha(i + 2).toUpperCase().startsWith('NOME')) {
                        nome = limparNome(txtLinha(i + 2));
                    }

                    break;
                }
            }
        }


        /* =====================================================
   CASO — "TRANSFERÊNCIA" NA LINHA 5
===================================================== */
        else if (txtLinha(4).toUpperCase().includes('TRANSFERÊNCIA')) {

            // 🔵 HORÁRIO — linha 6
            hora = extrairHora(5);

            // 💚 VALOR — linha 7
            valor = extrairValor(6);

            // 🔴 ORIGEM NA LINHA 15 → PAGADOR LINHA 16
            if (txtLinha(14).toUpperCase() === 'ORIGEM') {
                nome = limparNome(txtLinha(15));
            }
        }

        /* =====================================================
   CASO — "TRANSFERÊNCIA" NA LINHA 6
===================================================== */
        else if (txtLinha(5).toUpperCase().includes('TRANSFERÊNCIA')) {

            // 🔵 HORÁRIO — linha 7
            hora = extrairHora(6);

            // 💚 VALOR — linha 8
            valor = extrairValor(7);

            // 🔴 ORIGEM ENTRE LINHA 16 E 20
            for (let i = 15; i <= 19; i++) {
                if (txtLinha(i).toUpperCase() === 'ORIGEM') {
                    nome = limparNome(txtLinha(i + 1));

                    // 🧹 REMOVE "Nome " DO INÍCIO
                    nome = nome.replace(/^NOME\s+/i, '').trim();

                    break;
                }
            }
        }

        if (!valor || !hora || !nome) {
            linhasHTML.forEach((linha, i) => {
                const txt = txtLinha(i).toUpperCase();

                if (!valor && txt.includes('R$')) {
                    const m = txt.match(/R\$\s*\d{1,3}(\.\d{3})*,\d{2}/);
                    if (m) valor = m[0];
                }

                if (!hora) {
                    const m = txt.match(/\b\d{2}:\d{2}(:\d{2})?\b/);
                    if (m) hora = m[0];
                }

                if (txt === 'ORIGEM' && !nome) {
                    nome = txtLinha(i + 1);
                }
            });
        }

        renderFinal(body, { nome, hora: removerSegundos(hora), valor });

    }
    function regraBancoInter(texto, body) {
        const linhasHTML = body.querySelectorAll('.doc-line');

        let valor = '';
        let hora  = '';
        let nome  = '';

        function txtLinha(n) {
            return linhasHTML[n]
                ?.querySelector('span:last-child')
                ?.textContent
                ?.trim() || '';
        }

        function extrairValor(n) {
            const m = txtLinha(n).match(/R\$\s*\d{1,3}(\.\d{3})*,\d{2}/);
            return m ? m[0] : '';
        }

        function extrairHoraTexto(t) {
            t = t.trim();

            // 12h18 | 15h06
            let m = t.match(/(\d{1,2})h(\d{2})/i);
            if (m) return `${m[1].padStart(2,'0')}:${m[2]}`;

            // OCR bug: 12018 → 12h18
            m = t.match(/\b(\d{2})0(\d{2})\b/);
            if (m) return `${m[1]}:${m[2]}`;

            // 12:18
            m = t.match(/\b\d{2}:\d{2}\b/);
            if (m) return m[0];

            // fallback simples: 1218 → 12:18
            m = t.match(/\b(\d{2})(\d{2})\b/);
            if (m) return `${m[1]}:${m[2]}`;

            return '';
        }

        /* =====================================================
       VALOR — PRIMEIRA LINHA COM R$
    ====================================================== */
        for (let i = 0; i < linhasHTML.length; i++) {
            valor = extrairValor(i);
            if (valor) break;
        }

        /* =====================================================
       HORÁRIO — APÓS A PALAVRA "HORÁRIO"
    ====================================================== */
        for (let i = 0; i < linhasHTML.length; i++) {
            if (txtLinha(i).toUpperCase().includes('HORÁRIO')) {

                // tenta na mesma linha
                hora = extrairHoraTexto(txtLinha(i));
                if (hora) break;

                // tenta na próxima linha
                hora = extrairHoraTexto(txtLinha(i + 1));
                if (hora) break;
            }
        }

        /* =====================================================
       NOME — DEPOIS DE "QUEM PAGOU"
    ====================================================== */
        for (let i = 0; i < linhasHTML.length; i++) {
            if (txtLinha(i).toUpperCase() === 'QUEM PAGOU') {
                nome = limparNome(txtLinha(i + 1));
                break;
            }
        }

        if (!hora) hora = '-';
        if (!nome) nome = '-';

        renderFinal(body, { nome, hora: removerSegundos(hora), valor });

    }
    function regraBancoNordeste(texto, body) {
        const linhasHTML = body.querySelectorAll('.doc-line');

        let valor = '';
        let hora  = '';
        let nome  = '';

        function txtLinha(i) {
            return linhasHTML[i]
                ?.querySelector('span:last-child')
                ?.textContent
                ?.trim() || '';
        }

        /* ========= VALOR ========= */
        for (let i = 0; i < linhasHTML.length; i++) {
            const m = txtLinha(i).match(/R\$\s*\d{1,3}(\.\d{3})*,\d{2}/);
            if (m) {
                valor = m[0];
                break;
            }
        }

        /* ========= HORÁRIO ========= */
        for (let i = 0; i < linhasHTML.length; i++) {
            const m = txtLinha(i).match(/\b\d{2}:\d{2}(:\d{2})?\b/);
            if (m) {
                hora = m[0];
                break;
            }
        }

        /* ========= PAGADOR ========= */
        for (let i = 0; i < linhasHTML.length; i++) {
            if (txtLinha(i).toUpperCase() === 'O PAGADOR') {

                // procura "NOME" logo abaixo
                for (let j = i + 1; j <= i + 5; j++) {
                    if (txtLinha(j).toUpperCase().startsWith('NOME')) {

                        const candidato = txtLinha(j)
                        .replace(/^NOME\s*/i, '')
                        .replace(/[^A-Za-zÀ-ÿ\s]/g, ' ')
                        .replace(/\s{2,}/g, ' ')
                        .trim();

                        if (candidato.length >= 6) {
                            nome = candidato;
                            break;
                        }
                    }
                }
                break;
            }
        }

        /* ========= OUTPUT ========= */
        renderFinal(body, {
            nome: nome || '-',
            hora: removerSegundos(hora) || '-',
            valor: valor || '-'
        });
    }

    function regraSantander(texto, body) {
        const linhasHTML = body.querySelectorAll('.doc-line');

        const INDEX_HORA    = 6;   // linha 7
        const INDEX_VALOR   = 10;  // linha 11
        const INDEX_PAGADOR = 38;  // linha 39

        let valor = '';
        let hora  = '';
        let nome  = '';

        function txtLinha(i) {
            return linhasHTML[i]
                ?.querySelector('span:last-child')
                ?.textContent
                ?.trim() || '';
        }

        /* ========= VALOR ========= */
        if (linhasHTML[INDEX_VALOR]) {
            const t = txtLinha(INDEX_VALOR);
            const m = t.match(/R\$\s*\d{1,3}(?:\.\d{3})*,\d{2}/);
            if (m) valor = m[0];
        }

        /* ========= HORÁRIO ========= */
        if (linhasHTML[INDEX_HORA]) {
            const t = txtLinha(INDEX_HORA);
            const m = t.match(/\b\d{2}:\d{2}(:\d{2})?\b/);
            if (m) hora = m[0];
        }

        /* ========= PAGADOR ========= */
        if (linhasHTML[INDEX_PAGADOR]) {
            nome = limparNome(txtLinha(INDEX_PAGADOR));
        }

        /* ========= OUTPUT FINAL ========= */
        renderFinal(body, { nome, hora: removerSegundos(hora), valor });

    }
    function regraBradesco(texto, body) {
        const linhasHTML = body.querySelectorAll('.doc-line');

        let valor = '';
        let hora  = '';
        let nome  = '';

        function txtLinha(i) {
            return linhasHTML[i]
                ?.querySelector('span:last-child')
                ?.textContent
                ?.trim() || '';
        }


        // ⏰ HORÁRIO — linha 7 (index 6)
        if (!hora && txtLinha(6)) {
            const m = txtLinha(6).match(/\b\d{2}:\d{2}(:\d{2})?\b/);
            if (m) hora = m[0];
        }

        // 💰 VALOR — linha 8 (index 7)
        if (!valor && txtLinha(7)) {
            const m = txtLinha(7).match(/R\$\s*\d{1,3}(\.\d{3})*,\d{2}/);
            if (m) valor = m[0];
        }

        // 👤 PAGADOR — linha 20 (index 19)
        if (!nome && txtLinha(19)) {
            nome = limparNome(txtLinha(19));
        }


        // ⏰ HORÁRIO — linha 7 (index 6)
        if (!hora && txtLinha(6)) {
            const m = txtLinha(6).match(/\b\d{2}:\d{2}(:\d{2})?\b/);
            if (m) hora = m[0];
        }

        // 💰 VALOR — linha 9 (index 8)
        if (!valor && txtLinha(8)) {
            const m = txtLinha(8).match(/R\$\s*\d{1,3}(\.\d{3})*,\d{2}/);
            if (m) valor = m[0];
        }

        // 👤 PAGADOR — linha 31 (index 30)
        if (!nome && txtLinha(30)) {
            nome = limparNome(txtLinha(30));
        }

        renderFinal(body, {
            nome,
            hora: removerSegundos(hora),
            valor
        });
    }

    function extrairHoraMercadoPago(linhasHTML) {
        for (let i = 0; i < linhasHTML.length; i++) {
            let t = linhasHTML[i]
            .querySelector('span:last-child')
            ?.textContent || '';

            t = t
                .toLowerCase()
                .replace(/às/g, 'as')
                .replace(/o/g, '0'); // corrige hO0 → h00

            // 1️⃣ as 14h00 | às 14h00 | 14h00
            let m = t.match(/(?:as\s*)?(\d{1,2})h(\d{2})/);
            if (m) {
                return `${m[1].padStart(2,'0')}:${m[2]}`;
            }

            // 2️⃣ 14:00
            m = t.match(/\b(\d{2}):(\d{2})\b/);
            if (m) {
                return `${m[1]}:${m[2]}`;
            }

            // 3️⃣ 1400
            m = t.match(/\b(\d{2})(\d{2})\b/);
            if (m) {
                return `${m[1]}:${m[2]}`;
            }
        }

        return '';
    }

    function regraItau(texto, body) {
        const linhasHTML = body.querySelectorAll('.doc-line');

        // 📍 índices baseados no novo layout Itaú
        const INDEX_HORA    = 1;   // linha 2
        const INDEX_VALOR   = 10;  // linha 11
        const INDEX_NOME_1  = 14;  // linha 15
        const INDEX_NOME_2  = 15;  // linha 16 (continuação)

        let valor = '';
        let hora  = '';
        let nome  = '';

        function txtLinha(i) {
            return linhasHTML[i]
                ?.querySelector('span:last-child')
                ?.textContent
                ?.trim() || '';
        }

        /* ========= HORÁRIO ========= */
        if (linhasHTML[INDEX_HORA]) {
            const t = txtLinha(INDEX_HORA);
            const m = t.match(/\b\d{2}:\d{2}(:\d{2})?\b/);
            if (m) hora = m[0];
        }

        /* ========= VALOR ========= */
        if (linhasHTML[INDEX_VALOR]) {
            const t = txtLinha(INDEX_VALOR);
            const m = t.match(/R\$\s*\d{1,3}(?:\.\d{3})*,\d{2}/);
            if (m) valor = m[0];
        }

        /* ========= NOME DO PAGADOR ========= */
        let partesNome = [];

        const linhaNome1 = txtLinha(INDEX_NOME_1);
        const linhaNome2 = txtLinha(INDEX_NOME_2);

        if (linhaNome1) {
            partesNome.push(linhaNome1);
        }

        // 🔁 se a próxima linha não for CPF/CNPJ, concatena
        if (
            linhaNome2 &&
            !/CPF|CNPJ|AGÊNCIA|CONTA|BANCO/i.test(linhaNome2)
        ) {
            partesNome.push(linhaNome2);
        }

        if (partesNome.length) {
            nome = limparCPFdoNome(
                limparNome(partesNome.join(' '))
            );
        }

        /* ========= OUTPUT FINAL ========= */
        renderFinal(body, {
            nome: nome || '-',
            hora: removerSegundos(hora) || '-',
            valor: valor || '-'
        });
    }

    function regraCaixa(texto, body) {
        const linhasHTML = body.querySelectorAll('.doc-line');

        function txtLinha(i) {
            return linhasHTML[i]
                ?.querySelector('span:last-child')
                ?.textContent
                ?.trim() || '';
        }

        let valor = '';
        let hora  = '';
        let nome  = '-';

        for (let i = 0; i < linhasHTML.length; i++) {
            const t = txtLinha(i).toLowerCase();

            if (t.includes('valor data')) {

                // 💚 VALOR — linha seguinte
                const v = txtLinha(i + 1);
                const mv = v.match(/R\$\s*\d{1,3}(?:\.\d{3})*,\d{2}/);
                if (mv) valor = mv[0];

                // 🔵 HORÁRIO — linha depois do valor
                const h = txtLinha(i + 2);
                const mh = h.match(/\b\d{2}:\d{2}(:\d{2})?\b/);
                if (mh) hora = mh[0];

                break;
            }
        }

        for (let i = 0; i < linhasHTML.length; i++) {

            if (txtLinha(i).toLowerCase() === 'dados do pagador') {

                // procura "nome" depois do bloco
                for (let j = i + 1; j < i + 8; j++) {

                    if (txtLinha(j).toLowerCase() === 'nome') {

                        // agora procura o nome real
                        for (let k = j + 1; k < j + 8; k++) {

                            const candidato = txtLinha(k);
                            if (!candidato) continue;

                            const up = candidato.toUpperCase();

                            // ⛔ condição de parada
                            if (
                                up.includes('CPF') ||
                                up.includes('CNPJ')
                            ) break;

                            // ignora lixo
                            if (candidato.length < 4) continue;

                            nome = limparCPFdoNome(
                                limparNome(candidato)
                            );
                            break;
                        }
                        break;
                    }
                }
                break;
            }
        }

        /* ========= OUTPUT FINAL ========= */
        renderFinal(body, { nome, hora: removerSegundos(hora), valor });

    }

    function regraPicPay(texto, body) {
        const linhasHTML = body.querySelectorAll('.doc-line');

        function txtLinha(i) {
            return linhasHTML[i]
                ?.querySelector('span:last-child')
                ?.textContent
                ?.trim() || '';
        }

        let valor = '';
        let hora  = '';
        let nome  = '';

        for (let i = 0; i < linhasHTML.length; i++) {
            if (txtLinha(i).toLowerCase().includes('comprovante de pix')) {
                for (let j = 1; j <= 4; j++) {
                    const m = txtLinha(i + j)
                    .match(/\b\d{2}:\d{2}(:\d{2})?\b/);
                    if (m) {
                        hora = m[0];
                        break;
                    }
                }
                break;
            }
        }

        for (let i = 0; i < linhasHTML.length; i++) {
            if (txtLinha(i).toLowerCase() === 'valor') {
                for (let j = 1; j <= 2; j++) {
                    const m = txtLinha(i + j)
                    .match(/R\$\s*\d{1,3}(?:\.\d{3})*,\d{2}/);
                    if (m) {
                        valor = m[0];
                        break;
                    }
                }
                break;
            }
        }

        for (let i = 0; i < linhasHTML.length; i++) {
            if (txtLinha(i).toLowerCase() === 'de') {

                let partesNome = [];

                for (let j = i + 1; j < linhasHTML.length; j++) {
                    const linha = txtLinha(j);
                    if (!linha) continue;

                    const up = linha.toUpperCase();

                    if (
                        up.includes('CPF') ||
                        up.includes('CNPJ') ||
                        /\d{3}\.\d{3}\.\d{3}-\d{2}/.test(linha) ||
                        /\*{2,3}\.\d{3}\.\d{3}-\*{2}/.test(linha) ||
                        /\+\*{2}\.\d{3}\.\d{3}-\*{2}/.test(linha) ||
                        /\*{2,3}\d{6}\*{2}/.test(linha)
                    ) {
                        break;
                    }
                    if (linha.length < 3) continue;
                    if (
                        up.includes('BANCO') ||
                        up.includes('INSTITUIÇÃO') ||
                        up.includes('PICPAY')
                    ) break;

                    partesNome.push(linha);
                }

                if (partesNome.length) {
                    nome = limparCPFdoNome(
                        limparNome(partesNome.join(' '))
                    );

                    nome = nome
                        .replace(/\*{2,3}\.\d{3}\.\d{3}-\*{2}.*/g, '')
                        .replace(/\+\*{2}\.\d{3}\.\d{3}-\*{2}.*/g, '')
                        .replace(/\*{2,3}\d{6}\*{2}.*/g, '')
                        .replace(/\d{3}\.\d{3}\.\d{3}-\d{2}.*/g, '')
                        .trim();
                }
                break;
            }
        }
        renderFinal(body, { nome, hora: removerSegundos(hora), valor });

    }

    function regraC6Bank(texto, body) {
        const linhasHTML = body.querySelectorAll('.doc-line');

        let valor = '';
        let hora  = '';
        let nome  = '';

        function txtLinha(i) {
            return linhasHTML[i]
                ?.querySelector('span:last-child')
                ?.textContent
                ?.trim() || '';
        }

        /* ========= HORÁRIO — C6 ========= */
        for (let i = 0; i < linhasHTML.length; i++) {
            const t = txtLinha(i);

            let m = t.match(/\b(\d{2}:\d{2})\s+\1\b/);
            if (m) {
                hora = m[1];
                break;
            }

            m = t.match(/\b\d{2}:\d{2}\b/);
            if (m) {
                hora = m[0];
                break;
            }
        }

        /* ========= VALOR ========= */
        for (let i = 0; i < linhasHTML.length; i++) {
            const m = txtLinha(i).match(/R\$\s*\d{1,3}(\.\d{3})*,\d{2}/);
            if (m) {
                valor = m[0];
                break;
            }
        }

        /* ========= PAGADOR — BANCO: 336 ========= */
        for (let i = 0; i < linhasHTML.length; i++) {
            if (txtLinha(i).toUpperCase().includes('BANCO: 336')) {
                const candidato = txtLinha(i - 1);

                if (
                    candidato.length > 5 &&
                    !candidato.toUpperCase().includes('CPF') &&
                    !candidato.toUpperCase().includes('CNPJ')
                ) {
                    nome = limparNome(candidato);
                }
                break;
            }
        }
        /* ========= PRECAUÇÃO — PAGADOR APÓS "ORIGEM" ========= */
        if (!nome) {
            for (let i = 0; i < linhasHTML.length; i++) {
                if (txtLinha(i).toUpperCase().includes('ORIGEM')) {
                    for (let j = 1; j <= 2; j++) {
                        const candidato = txtLinha(i + j);

                        if (
                            candidato.length > 5 &&
                            !candidato.toUpperCase().includes('CPF') &&
                            !candidato.toUpperCase().includes('CNPJ') &&
                            !candidato.toUpperCase().includes('CONTA') &&
                            !candidato.toUpperCase().includes('AGÊNCIA')
                        ) {
                            nome = limparNome(candidato);
                            break;
                        }
                    }
                    break;
                }
            }
        }

        /* ========= OUTPUT ========= */
        renderFinal(body, { nome, hora: removerSegundos(hora), valor });

    }


    function regraMercadoPago(texto, body) {
        const linhasHTML = body.querySelectorAll('.doc-line');

        function txtLinha(n) {
            return linhasHTML[n]
                ?.querySelector('span:last-child')
                ?.textContent
                ?.trim() || '';
        }
        /* ========= HORÁRIO ========= */
        let hora = '';

        for (let i = 0; i < linhasHTML.length; i++) {
            let t = txtLinha(i)
            .toLowerCase()
            .replace(/às/g, 'as')
            .replace(/o/g, '0');

            let m = t.match(/as\s*(\d{1,2})h(\d{2})/);
            if (m) {
                hora = `${m[1].padStart(2,'0')}:${m[2]}`;
                break;
            }

            m = t.match(/\b(\d{2}):(\d{2})\b/);
            if (m) {
                hora = `${m[1]}:${m[2]}`;
                break;
            }
        }
        /* ========= VALOR (MP — DEFINITIVO COMPLETO) ========= */
        let valor = '';
        let inteiro = '';
        let erroCentavos = false;

        for (let i = 0; i < linhasHTML.length; i++) {
            let t = txtLinha(i);
            if (!t) continue;

            // normalização OCR
            t = t
                .replace(/O/g, '0')
                .replace(/o/g, '0');

            // 1️⃣ valor perfeito: R$ 8,00 | R$8,00 | R$ 2875,00
            let m = t.match(/R\$\s*(\d+)[,.](\d{2})/);
            if (m) {
                valor = `${m[1]},${m[2]}`;
                break;
            }

            // 2️⃣ inteiro + erro de centavos (% ° º)
            m = t.match(/R\$\s*(\d+)\s*[%°º]/);
            if (m) {
                inteiro = m[1];
                erroCentavos = true;
                break;
            }

            // 3️⃣ inteiro puro (sem símbolo depois)
            m = t.match(/R\$\s*(\d+)/);
            if (m) {
                inteiro = m[1];
                break;
            }
        }

        // decisão final
        if (valor) {
            // ok
        }
        else if (erroCentavos && inteiro) {
            valor = `${inteiro} , erro ao ler centavos`;
        }
        else if (inteiro) {
            // 🔥 regra nova: vírgula 2 casas antes
            if (inteiro.length === 1) {
                valor = `0,0${inteiro}`;
            }
            else if (inteiro.length === 2) {
                valor = `0,${inteiro}`;
            }
            else {
                const i = inteiro.slice(0, -2);
                const c = inteiro.slice(-2);
                valor = `${i},${c}`;
            }
        }
        else {
            valor = 'valor não encontrado';
        }

        let nome = '';

        for (let i = 0; i < linhasHTML.length; i++) {
            const t = txtLinha(i)
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .replace(/^[^a-z]+/, '') // remove lixo antes
            .trim();

            // aceita: "e de", "o de", "- e de", etc
            if (t === 'e de' || t.endsWith(' de')) {
                nome = txtLinha(i + 1);

                // 🧹 limpa CPF / CNPJ se vier junto
                nome = nome
                    .replace(/cpf.*$/i, '')
                    .replace(/cnpj.*$/i, '')
                    .trim();

                break;
            }
        }
        /* ========= OUTPUT ========= */
        renderFinal(body, { nome, hora: removerSegundos(hora), valor });

    }

    function regraPassagem(texto, body) {
        const linhasHTML = body.querySelectorAll('.doc-line');

        function txtLinha(i) {
            return linhasHTML[i]
                ?.querySelector('span:last-child')
                ?.textContent
                ?.trim() || '';
        }
        let nome = '';
        let hora = '';
        let somaValor = 0;
        let encontrouValor = false;

        /* ================= NOME DO PASSAGEIRO ================= */
        for (let i = 22; i <= 40 && i < linhasHTML.length; i++) {
            let t = txtLinha(i);
            if (!t) continue;

            if (/PASSA?GEIRO/i.test(t)) {

                // 1️⃣ tenta pegar da mesma linha
                let nomeTemp = t
                .replace(/^.*PASSA?GEIRO[:.\s]*/i, '')
                .replace(/CPF.*$/i, '')
                .replace(/RG.*$/i, '')
                .replace(/[^A-Za-zÀ-ÿ\s]/g, ' ')
                .replace(/\s{2,}/g, ' ')
                .trim();

                // 2️⃣ fallback: linha seguinte
                let linhaNomeIndex = i;
                if (nomeTemp.length < 6) {
                    const prox = txtLinha(i + 1);
                    if (prox) {
                        nomeTemp = prox
                            .replace(/CPF.*$/i, '')
                            .replace(/RG.*$/i, '')
                            .replace(/IDOSO.*$/i, '')
                            .replace(/ID\s*JOVEM.*$/i, '')
                            .replace(/[^A-Za-zÀ-ÿ\s]/g, ' ')
                            .replace(/\s{2,}/g, ' ')
                            .trim();
                        linhaNomeIndex = i + 1;
                    }
                }

                const BLOQUEADAS = [
                    'OBRIGATORIO','OBRIGATÓRIO',
                    'COMPARECIMENTO',
                    'EMBARQUE',
                    'MINUTOS',
                    'ANTES',
                    'HORA',
                    'HORARIO','HORÁRIO',
                    'UTILIZE','UTILIZAR',
                    'DOCUMENTO'
                ];

                for (let k = 1; k <= 2; k++) {
                    const proxLinha = txtLinha(linhaNomeIndex + k);
                    if (!proxLinha) continue;

                    const contLimpo = proxLinha
                    .replace(/CPF.*$/i, '')
                    .replace(/RG.*$/i, '')
                    .replace(/IDOSO.*$/i, '')
                    .replace(/ID\s*JOVEM.*$/i, '')
                    .replace(/[^A-Za-zÀ-ÿ\s]/g, ' ')
                    .replace(/\s{2,}/g, ' ')
                    .trim();

                    const palavras = contLimpo
                    .split(' ')
                    .filter(p => p.length >= 3);

                    const palavrasUpper = palavras.map(p => p.toUpperCase());

                    let novas = [];

                    for (let p of palavrasUpper) {
                        if (BLOQUEADAS.includes(p)) {
                            // encontrou aviso → limpa e CONTINUA procurando sobrenome depois
                            novas = [];
                            continue;
                        }
                        if (p.length >= 3) {
                            novas.push(p);
                        }
                    }
                    if (novas.length) {
                        const total =
                              nomeTemp.split(' ').length + novas.length;

                        if (total <= 6) {
                            nomeTemp = `${nomeTemp} ${novas.join(' ')}`.trim();
                        }
                    }
                }
                if (nomeTemp.length >= 6) {
                    nome = nomeTemp;
                }
                break;
            }
        }
        /* ================= SOMA DE VALORES (TODAS AS PÁGINAS) ================= */
        for (let i = 0; i < linhasHTML.length; i++) {
            const t = txtLinha(i).toUpperCase();

            if (t.includes('VALOR') && t.includes('PAGO')) {
                for (let j = i; j <= i + 3; j++) {
                    let v = txtLinha(j);
                    if (!v) continue;

                    v = v.replace(/O/g,'0').replace(/o/g,'0');

                    // R$ 28,99
                    let m = v.match(/R\$\s*(\d+)[,.](\d{2})/);
                    if (m) {
                        somaValor += Number(`${m[1]}.${m[2]}`);
                        encontrouValor = true;
                        break;
                    }

                    // 2899 → 28,99
                    m = v.match(/\b(\d{3,})\b/);
                    if (m) {
                        const n = m[1];
                        somaValor += Number(`${n.slice(0,-2)}.${n.slice(-2)}`);
                        encontrouValor = true;
                        break;
                    }
                }
            }
        }

        /* ================= ÚLTIMA HORA (AUTORIZAÇÃO) ================= */
        for (let i = linhasHTML.length - 1; i >= 0; i--) {
            const t = txtLinha(i).toLowerCase();

            if (t.includes('autoriz')) {
                let m = t.match(/\b\d{2}:\d{2}\b/);
                if (m) {
                    hora = m[0];
                    break;
                }

                for (let j = i + 1; j <= i + 5; j++) {
                    const h = txtLinha(j)?.match(/\b\d{2}:\d{2}\b/);
                    if (h) {
                        hora = h[0];
                        break;
                    }
                }
                break;
            }
        }

        const valorFinal = encontrouValor
        ? somaValor.toFixed(2).replace('.', ',')
        : '-';

        renderFinal(body, {
            nome: nome || '-',
            hora: removerSegundos(hora) || '-',
            valor: valorFinal
        });
    }



    function parseValor(valor) {
        if (!valor) return { numero: null, texto: '' };

        // se tem erro explícito
        if (/erro ao ler centavos/i.test(valor)) {
            return {
                numero: null,
                texto: valor.trim()
            };
        }

        const v = valor
        .replace(/[^\d,]/g, '')
        .replace(',', '.');

        const n = Number(v);

        return {
            numero: isNaN(n) ? null : n,
            texto: valor.trim()
        };
    }

  
    function gerarRelatorioExcel() {
        const dados = [];

        const agente = agenteInput.value || 'SEM NOME';
        const tipo   = tipoSelect.value;

        // ===== LINHA 1 =====
        dados.push([
            `AGENTE: ${agente.toUpperCase()}`,
            XLSX.SSF.format('dd/mm/yyyy', new Date()),
            '',
            '',
            tipo
        ]);

        // ===== LINHA 2 (CABEÇALHO) =====
        dados.push([
            'NOME',
            'HORA',
            'PIX',
            'TAXA',
            'PIX TOTAL'
        ]);

        // ===== ORDENA JSON POR HORÁRIO (00:00 → 23:59) =====
        const registrosOrdenados = [...registrosOCR].sort((a, b) => {
            return horaParaMinutos(a.hora) - horaParaMinutos(b.hora);
        });

        // ===== MONTA EXCEL A PARTIR DO JSON =====
        registrosOrdenados.forEach(item => {

            if (
                (!item.nome || item.nome === '-') &&
                (!item.hora || item.hora === '-') &&
                (!item.valor || item.valor === '-')
            ) return;

            const linhaExcel = dados.length + 1;
            const pixOriginal = parseValor(item.valor);
            const taxa = Number(item.taxa || 0);

            // 🔥 PIX LÍQUIDO (igual à tela)
            let pixLiquido = pixOriginal.numero;
            if (pixLiquido !== null && taxa > 0) {
                pixLiquido = pixLiquido - taxa;
            }

            dados.push([
                item.nome ? item.nome.toUpperCase() : '',
                item.hora || '',
                pixLiquido !== null ? pixLiquido : pixOriginal.texto, // ✅ PIX LÍQUIDO
                taxa || 0,
                pixLiquido !== null
                ? { f: `IF(ISNUMBER(C${linhaExcel}),C${linhaExcel}+D${linhaExcel},"")` }
                : ''
            ]);
        });


        if (dados.length <= 2) {
            alert('Nenhum dado válido para gerar Excel.');
            return;
        }
        // ===== LINHA EM BRANCO (SEPARADOR) =====
        dados.push(['', '', '', '', '']);

        // ===== LINHA DE TOTAL =====
        const primeiraLinhaDados = 3;
        const ultimaLinhaDados = dados.length - 1; // 🔥 ignora a linha em branco

        dados.push([
            'TOTAL',
            '',
            '',
            '',
            { f: `SUM(E${primeiraLinhaDados}:E${ultimaLinhaDados})` }
        ]);

        const ws = XLSX.utils.aoa_to_sheet(dados);
        // ===== FORMATA PIX (C) E TAXA (D) COMO MOEDA =====
        const range = XLSX.utils.decode_range(ws['!ref']);

        for (let R = 2; R <= range.e.r; ++R) { // começa na linha de dados
            const pixCell  = XLSX.utils.encode_cell({ r: R, c: 2 }); // coluna C
            const taxaCell = XLSX.utils.encode_cell({ r: R, c: 3 }); // coluna D

            if (ws[pixCell] && typeof ws[pixCell].v === 'number') {
                ws[pixCell].z = '#,##0.00';
            }

            if (ws[taxaCell] && typeof ws[taxaCell].v === 'number') {
                ws[taxaCell].z = '#,##0.00';
            }
        }
        ws['!cols'] = [
            { wch: 40 }, // Nome
            { wch: 10 }, // Hora
            { wch: 18 }, // Pix
            { wch: 10 }, // Taxa
            { wch: 15 }  // Pix Total
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Relatório OCR');

        XLSX.writeFile(wb, 'relatorio_ocr.xlsx');
    }

    function normalizarNome(txt) {
        return txt
            .toUpperCase()
            .normalize('NFD')                 // remove acentos
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^A-Z\s]/g, ' ')        // só letras
            .replace(/\s+/g, ' ')             // espaços duplicados
            .trim();
    }
    function campoVazio(v) {
        return !v || v === '-' || v.trim() === '';
    }

    const NOMES_PROIBIDOS = [
        'ANTONIO CLERVES OLIVEIRA DE ARAUJO','ANTONIO CLERVES DE ARAUJO','ANTONIO CLERVES OLIVEIRA','VALE VIAGENS','ANTONIO CLERVES OLVEIRADE ARAUJO'

    ].map(n => normalizarNome(n));

    function regraPrint(texto, body) {
        const linhas = texto
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);

        let valor = '';
        let hora  = '';
        let nome  = '';
        let achouPagador = false;

        const BLOQUEADAS_GERAIS = [
            'DADOS','RECEBEDOR','RECEBIDO','TIPO','CONTA',
            'INFORMAÇÕES','INFORMACOES','PROCESSANDO','FINALIZADO',
            'DETALHES','DESCRIÇÃO','DESCRICAO',
            'BANCO','PIX','TRANSFERENCIA','TRANSFERÊNCIA',
            'CPF','CNPJ','VALOR','DATA','HORA',
            'VIAGEM','VIAGENS','TURISMO','AGENCIA','AGÊNCIA',
            'LTDA','ME','EIRELI','SA','S.A','COMPANHIA',
            'EMPRESA',
            'TARIFA','TARIFA ZERADA','TARIFA ZERO',
            'ISENTO','ISENTA','GRATUITO','GRATUITA',
            'COMPROVANTE','NÃO INFORMADO','NAO INFORMADO',
            'PAGAMENTO','PIX REALIZADO','COM SUCESSO'
        ];

        /* ===== 💰 VALOR ===== */
        for (const l of linhas) {
            const m = l.match(/R\$\s*\d{1,3}(\.\d{3})*,\d{2}/);
            if (m) {
                valor = m[0];
                break;
            }
        }

        /* ===== ⏰ HORÁRIO ===== */
        for (const l of linhas) {
            const m = l.match(/\b\d{2}:\d{2}(:\d{2})?\b/);
            if (m) {
                hora = m[0];
                break;
            }
        }

        /* ===== 👤 PAGADOR ===== */
        for (let i = 0; i < linhas.length; i++) {
            if (linhas[i].toUpperCase() === 'PAGADOR') {
                achouPagador = true;

                for (let j = 1; j <= 4; j++) {
                    let candidato = linhas[i + j];
                    if (!candidato) continue;

                    const up = candidato.toUpperCase();
                    if (BLOQUEADAS_GERAIS.some(b => up.includes(b))) break;

                    candidato = candidato
                        .replace(/[^A-Za-zÀ-ÿ\s]/g, ' ')
                        .replace(/\s{2,}/g, ' ')
                        .trim();

                    const partes = candidato.split(' ').filter(p => p.length >= 3);
                    if (partes.length >= 2) {
                        nome = candidato;
                        break;
                    }
                }
                break;
            }
        }
        /* ===== 👤 NOME APÓS PAGADOR → NOME (ROBUSTO) ===== */
        if (!nome) {
            for (let i = 0; i < linhas.length; i++) {

                if (linhas[i].toUpperCase() === 'PAGADOR') {

                    // procura "NOME" logo abaixo
                    for (let j = i + 1; j <= i + 5; j++) {

                        if (linhas[j]?.toUpperCase() === 'NOME') {

                            let partes = [];

                            // coleta até 3 linhas após "NOME"
                            for (let k = j + 1; k <= j + 4; k++) {
                                const linha = linhas[k];
                                if (!linha) continue;

                                const up = linha.toUpperCase();

                                // ⛔ para ao encontrar CPF / CNPJ
                                if (up.includes('CPF') || up.includes('CNPJ')) break;

                                const limpa = linha
                                .replace(/[^A-Za-zÀ-ÿ\s]/g, ' ')
                                .replace(/\s{2,}/g, ' ')
                                .trim();

                                if (limpa.length >= 3) {
                                    partes.push(limpa);
                                }
                            }

                            if (partes.length) {
                                nome = partes.join(' ');
                            }

                            break;
                        }
                    }
                }

                if (nome) break;
            }
        }


        /* ===== 🛟 FALLBACK (SEM CONTEXTO) ===== */
        if (!nome && !achouPagador) {
            for (const l of linhas) {
                const up = l.toUpperCase();

                if (!/^[A-ZÀ-Ÿ\s]+$/.test(up)) continue;
                if (BLOQUEADAS_GERAIS.some(b => up.includes(b))) continue;

                const partes = up.split(/\s+/).filter(p => p.length >= 3);
                if (partes.length >= 3) {
                    nome = l;
                    break;
                }
            }
        }
        /* ===== ⛔ BLOQUEIO FINAL DE NOMES PROIBIDOS ===== */
        if (nome) {
            const nomeNormalizado = normalizarNome(nome);

            if (NOMES_PROIBIDOS.some(n => nomeNormalizado.includes(n))) {
                nome = ''; // 🔒 bloqueia recebedor proibido
            }
        }
        /* ===== 🧠 FALLBACK — PRINT SÓ COM NOME ===== */
        if (!nome) {
            for (const l of linhas) {
                const limpa = l
                .replace(/[^A-Za-zÀ-ÿ\s]/g, ' ')
                .replace(/\s{2,}/g, ' ')
                .trim();

                if (!limpa) continue;

                const palavras = limpa.split(' ').filter(p => p.length >= 3);

                // nome humano típico: 2 a 6 palavras
                if (palavras.length >= 2 && palavras.length <= 6) {

                    // evita pegar lixo
                    const up = limpa.toUpperCase();
                    if (
                        BLOQUEADAS_GERAIS.some(b => up.includes(b)) ||
                        /\bPIX\b|\bBANCO\b|\bVALOR\b/.test(up)
                    ) continue;

                    nome = limpa;
                    break;
                }
            }
        }

        /* ===== FINAL ===== */
        renderFinal(body, {
            nome: nome || '-',
            hora: removerSegundos(hora) || '-',
            valor: valor || '-'
        });
    }



    /* ========= NUMERA + APLICA ========= */
    function aplicarRegras(body){
        const texto = body.textContent;

        // 🖨️ PRINT (CTRL+V) — BLOQUEIO TOTAL
        if (body.dataset.print === '1') {
            regraPrint(texto, body);
            return; // ⛔ PARA TUDO AQUI
        }
        const linhas = texto.split('\n');
        const banco = identificarBanco(texto);

        // 🔢 Numera todas as linhas
        body.innerHTML = linhas.map((l,i)=>
                                    `<div class="doc-line"><span class="ln">${i+1}</span><span>${l}</span></div>`
                                   ).join('');

        // 🏦 Regras específicas por banco
        if (banco === 'BB') {
            regraBancoBrasil(texto, body);
        }
        else if (banco === 'BRADESCO') {
            regraBradesco(texto, body);
        }
        else if (banco === 'NUBANK') {
            regraNubank(texto, body);
        }
        else if (banco === 'INTER') {
            regraBancoInter(texto, body);
        }
        else if (banco === 'MERCADO_PAGO') {
            regraMercadoPago(texto, body);
        }
        else if (banco === 'C6') {
            regraC6Bank(texto, body);
        }
        else if (banco === 'ITAU') {
            regraItau(texto, body);
        }
        else if (banco === 'SANTANDER') {
            regraSantander(texto, body);
        }
        else if (banco === 'PICPAY') {
            regraPicPay(texto, body);
        }
        else if (banco === 'CAIXA') {
            regraCaixa(texto, body);
        }else if (banco === 'PASSAGEM') {
            regraPassagem(texto, body);
        }else if (banco === 'BNB') {
            regraBancoNordeste(texto, body);
        }




        // 🔥 FALLBACK UNIVERSAL DEFINITIVO
        if (!jaEstaFinal(body)) {
            regraPrint(texto, body);
        }

    }
    function chaveArquivo(file) {
        return `${file.name}__${file.size}__${file.type}`;
    }
    async function completarCardSelecionadoComPrint(file) {
        const card = document.querySelector('.doc.selecionado');
        if (!card) return false;

        const body = card.querySelector('.doc-body');
        const id = body?.dataset?.ocrId;
        if (!id) return false;

        const registro = registrosOCR.find(r => r.id === id);
        if (!registro) return false;

        // OCR silencioso
        let texto = '';
        if (file.type.includes('pdf')) {
            texto = await ocrPDFTemp(file);
        } else {
            texto = await ocrImgTemp(file);
        }

        const dados = extrairDadosViaBanco(texto, true);

        // 🔍 COMPLETA SOMENTE O QUE ESTIVER VAZIO
        if (campoVazio(registro.nome) && dados.nome && dados.nome !== '-') {
            registro.nome = dados.nome;
        }

        if (campoVazio(registro.hora) && dados.hora && dados.hora !== '-') {
            registro.hora = dados.hora;
        }

        if (campoVazio(registro.valor) && dados.valor && dados.valor !== '-') {
            registro.valor = dados.valor;
        }

        salvarStorage();
        atualizarVisualFinal(body);
        atualizarTotalTela();
        flashCard(card, 'flash-add');

        return true;
    }

    function extrairDadosViaBanco(texto, forcarPrint = false) {

        MODO_PARSE = true; // 🔒 não salva nada durante parse

        let nome = '';
        let hora = '';
        let valor = '';

        const banco = identificarBanco(texto);
        const fakeBody = document.createElement('div');

        // replica EXATAMENTE o corpo numerado
        fakeBody.innerHTML = texto
            .split('\n')
            .map((l, i) => `
            <div class="doc-line">
                <span class="ln">${i + 1}</span>
                <span>${l}</span>
            </div>
        `).join('');

        // 🔥 força modo PRINT se solicitado
        if (forcarPrint) {
            fakeBody.dataset.print = '1';
            regraPrint(texto, fakeBody);
        } else {
            switch (banco) {
                case 'BB': regraBancoBrasil(texto, fakeBody); break;
                case 'BRADESCO': regraBradesco(texto, fakeBody); break;
                case 'NUBANK': regraNubank(texto, fakeBody); break;
                case 'INTER': regraBancoInter(texto, fakeBody); break;
                case 'MERCADO_PAGO': regraMercadoPago(texto, fakeBody); break;
                case 'C6': regraC6Bank(texto, fakeBody); break;
                case 'ITAU': regraItau(texto, fakeBody); break;
                case 'SANTANDER': regraSantander(texto, fakeBody); break;
                case 'PICPAY': regraPicPay(texto, fakeBody); break;
                case 'CAIXA': regraCaixa(texto, fakeBody); break;
                case 'PASSAGEM': regraPassagem(texto, fakeBody); break;
                default:
                    regraPrint(texto, fakeBody);
            }
        }

        // 🎯 coleta resultado final
        const final = fakeBody.querySelector('.doc-final');
        if (final) {
            nome  = final.querySelector('.final-nome')?.textContent || '';
            hora  = final.querySelector('.final-hora')?.textContent || '';
            valor = final.querySelector('.final-pix')
                ?.textContent
                ?.replace(/[^\d,]/g, '') || '';
        }

        MODO_PARSE = false; // 🔓 libera

        return { banco, nome, hora, valor };
    }


    /* ========= OCR ========= */
    async function processFiles(files) {

        // ⛔ BLOQUEIA se estiver usando ➕ Adicionar
        if (MODO_ADICIONAR) {
            console.log('🚫 processFiles bloqueado (modo adicionar)');
            return;
        }

        for (const file of files) {
            const chave = chaveArquivo(file);

            if (arquivosAnexados.has(chave)) {
                console.log('Arquivo ignorado (duplicado):', file.name);
                continue;
            }

            arquivosAnexados.add(chave);
            atualizarContador();
            processFile(file);
        }
    }

    function atualizarContador() {
        counter.textContent = `ARQUIVO ${registrosOCR.length}`;
    }

    async function ocrImgTemp(file){
        const { data } = await Tesseract.recognize(file, 'por');
        return data.text || '';
    }

    async function ocrPDFTemp(file){
        let texto = '';
        const buf = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({data:buf}).promise;

        for (let i = 1; i <= pdf.numPages; i++) {
            const p = await pdf.getPage(i);
            const v = p.getViewport({scale:2});
            const c = document.createElement('canvas');
            const ctx = c.getContext('2d');
            c.width = v.width;
            c.height = v.height;
            await p.render({canvasContext:ctx,viewport:v}).promise;
            const blob = await new Promise(r=>c.toBlob(r));
            const { data } = await Tesseract.recognize(blob,'por');
            texto += '\n' + data.text;
        }
        return texto;
    }

    function extrairValorTextoSimples(texto){
        const m = texto.match(/R\$\s*(\d+)[,.](\d{2})/);
        if (!m) return null;
        return Number(`${m[1]}.${m[2]}`);
    }

    function flashCard(card, tipo) {
        card.classList.remove(
            'flash-copy',
            'flash-edit',
            'flash-taxa',
            'flash-remove',
            'flash-add'
        );

        card.classList.add('flash', tipo);

        // força reflow pra animar sempre
        card.offsetHeight;

        setTimeout(() => {
            card.classList.remove('flash', tipo);
        }, 700);
    }

    function criarDoc(titulo){
        const d=document.createElement('div');
        d.className='doc';

        // ===== SELEÇÃO VISUAL DO CARD =====
        d.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;

            const jaSelecionado = d.classList.contains('selecionado');

            document.querySelectorAll('.doc.selecionado')
                .forEach(el => el.classList.remove('selecionado'));

            if (!jaSelecionado) {
                d.classList.add('selecionado');
            }
        });

        d.innerHTML = `
  <div class="doc-header">${titulo}</div>
  <div class="doc-final"></div>
  <div class="doc-actions">
    <button class="copy">📋 Copiar</button>
    <button class="editar">✏️ Editar</button>
    <button class="taxa">💰 Taxa</button>
    <button class="add">➕ Adicionar</button>
    <button class="remove">➖ Remover</button>
  </div>
`;
        // 🧾 tooltip com nome completo do arquivo
        const header = d.querySelector('.doc-header');
        if (header && d.dataset.nomeArquivo) {
            header.title = d.dataset.nomeArquivo;
        }
        const body = d.querySelector('.doc-final');
       
        d.querySelector('.copy').onclick = function () {
            const texto =
                  body.querySelector('.doc-final')?.innerText || '';

            navigator.clipboard.writeText(texto.trim());

            // ===== FEEDBACK NO PRÓPRIO BOTÃO =====
            const btn = this;
            const original = btn.innerHTML;

            btn.classList.add('copiado');
            btn.innerHTML = '✅ Copiado';

            setTimeout(() => {
                btn.classList.remove('copiado');
                btn.innerHTML = original;
                flashCard(d, 'flash-copy');

            }, 1000);
        };
        d.querySelector('.add').onclick = () => {

            // 🔒 limpa qualquer estado anterior
            MODO_ADICIONAR = false;
            const id = body.dataset.ocrId;
            if (!id) return;

            MODO_ADICIONAR = true;

            // 🔥 ESSENCIAL: limpa antes de abrir
            inputAdd.value = '';

            inputAdd.onchange = async () => {
                const files = [...inputAdd.files];
                if (!files.length) {
                    MODO_ADICIONAR = false;
                    return;
                }

                const registro = registrosOCR.find(r => r.id === id);
                if (!registro) {
                    MODO_ADICIONAR = false;
                    return;
                }

                for (const file of files) {
                    let texto = '';
                    if (file.type.includes('pdf')) {
                        texto = await ocrPDFTemp(file);
                    } else {
                        texto = await ocrImgTemp(file);
                    }

                    const dados = extrairDadosViaBanco(texto, true);

                    // 🔁 SUBSTITUI (NUNCA SOMA / NUNCA CRIA NOVO)
                    if (dados.nome && dados.nome !== '-') registro.nome = dados.nome;
                    if (dados.hora && dados.hora !== '-') registro.hora = dados.hora;
                    if (dados.valor && dados.valor !== '-') registro.valor = dados.valor;

                    salvarStorage();
                    atualizarVisualFinal(body);
                    atualizarTotalTela();
                    break; // ⛔ apenas 1 arquivo
                }

                flashCard(d, 'flash-add');

                inputAdd.value = '';
                MODO_ADICIONAR = false;
            };

            inputAdd.click();

        };


        d.querySelector('.editar').onclick = () => {
            const id = body.dataset.ocrId;
            if (!id) return;

            const registro = registrosOCR.find(r => r.id === id);
            if (!registro) return;

            const nomeEl = body.querySelector('.final-nome');
            const horaEl = body.querySelector('.final-hora');
            const pixEl  = body.querySelector('.final-pix');
            const taxaEl = body.querySelector('.final-taxa');

            if (!nomeEl || !horaEl || !pixEl ) return;

            // 🔓 ativa edição
            [nomeEl, horaEl, pixEl].forEach(el => {
                el.contentEditable = true;
                el.classList.add('edit-field');
            });

            nomeEl.focus();

            const salvar = () => {
                // 🧾 salva dados limpos
                registro.nome = nomeEl.textContent.trim();
                registro.hora = horaEl.textContent.trim();

                registro.valor = pixEl.textContent
                    .replace(/[^\d,]/g, '')
                    .trim();



                // 🔒 trava edição
                [nomeEl, horaEl, pixEl].forEach(el => {
                    el.contentEditable = false;
                    el.classList.remove('edit-field');
                });

                salvarStorage();
                atualizarVisualFinal(body);
                flashCard(body.closest('.doc'), 'flash-edit');

                atualizarTotalTela();
            };

            // ⏎ ENTER salva
            [nomeEl, horaEl, pixEl].forEach(el => {
                el.onkeydown = e => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        salvar();
                    }
                };
            });

            // 🖱️ sair do último campo salva
            taxaEl.onblur = salvar;

        };



        d.querySelector('.taxa').onclick = () => {
            const id = body.dataset.ocrId;
            if (!id) return;

            const registro = registrosOCR.find(r => r.id === id);
            if (!registro) return;

            const atual = registro.taxa
            ? registro.taxa.toString().replace('.', ',')
            : '';

            let valor = prompt('Informe a TAXA (ex: 5,00)', atual);
            if (valor === null) return;

            valor = valor
                .replace(/[^\d,]/g, '')
                .replace(',', '.');

            const n = Number(valor);

            if (isNaN(n)) {
                alert('❌ Taxa inválida');
                return;
            }

            registro.taxa = n; // ✅ número real
            salvarStorage();
            atualizarVisualFinal(body);

            alert(`✅ Taxa R$ ${n.toFixed(2)} salva`);
            flashCard(d, 'flash-taxa');

        };

        d.querySelector('.remove').onclick = () => {

            const id = d.querySelector('.doc-body')?.dataset?.ocrId;

            // remove do JSON
            if (id) {
                const idx = registrosOCR.findIndex(r => r.id === id);
                if (idx !== -1) {
                    registrosOCR.splice(idx, 1);
                    salvarStorage();
                    atualizarTotalTela();
                }
            }

            // remove da tela
            const chave = d.getAttribute('data-chave');
            if (chave) arquivosAnexados.delete(chave);
            flashCard(d, 'flash-remove');

            setTimeout(() => {
                d.remove();
            }, 300);

            d.remove();
            atualizarContador();

        };
        list.prepend(d);
        return body;
    }
    async function ocrSilencioso(file) {
        if (file.type.includes('pdf')) {
            return await ocrPDFTemp(file);
        } else {
            return await ocrImgTemp(file);
        }
    }
    function limitarNomeArquivo(nome, max = 10) {
        if (!nome) return '';
        if (nome.length <= max) return nome;
        return nome.slice(0, max) + '...';
    }

    async function processFile(file, isPrint = false){
        const nomeCurto = limitarNomeArquivo(file.name, 10);

        const body = criarDoc(nomeCurto);
        body.dataset.nomeArquivo = file.name;

        // aplica tooltip agora que o nome completo existe
        const header = body.closest('.doc')?.querySelector('.doc-header');
        if (header) header.title = file.name;


        if (isPrint) {
            body.dataset.print = '1'; // 🖨️ MARCA PRINT
        }

        body.closest('.doc').setAttribute('data-chave', chaveArquivo(file));
        body.textContent = '🔍 Processando...\n';

        if (file.type.includes('pdf')) await ocrPDF(file, body);
        else await ocrImg(file, body);

        body.textContent += '\n✅ Finalizado';
        aplicarRegras(body);
        atualizarTotalTela();
    }


    async function ocrImg(file,target){
        const {data}=await Tesseract.recognize(file,'por');
        target.textContent+=data.text;
    }

    async function ocrPDF(file,target){
        const buf=await file.arrayBuffer();
        const pdf=await pdfjsLib.getDocument({data:buf}).promise;
        for(let i=1;i<=pdf.numPages;i++){
            const p=await pdf.getPage(i);
            const v=p.getViewport({scale:2});
            const c=document.createElement('canvas');
            const ctx=c.getContext('2d');
            c.width=v.width;
            c.height=v.height;
            await p.render({canvasContext:ctx,viewport:v}).promise;
            const blob=await new Promise(r=>c.toBlob(r));
            const {data}=await Tesseract.recognize(blob,'por');
            target.textContent+=`\n📄 Página ${i}\n${data.text}`;
        }
    }
    document.addEventListener('paste', async e => {

        // 🔓 garante que colar SEMPRE funcione
        MODO_ADICIONAR = false;

        for (const i of e.clipboardData?.items || []) {
            if (!i.type.startsWith('image/')) continue;

            const file = i.getAsFile();

            // 🎯 tenta completar card selecionado
            const usado = await completarCardSelecionadoComPrint(file);

            // 🆕 se não tinha card selecionado, cria novo
            if (!usado) {
                processFile(file, true);
            }
        }
    });
}); // ✅ FECHA O DOMContentLoaded
