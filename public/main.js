if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

let CARREGANDO_ESTADO = false;

let ocrWorker = null;

async function getOCRWorker() {
  if (!ocrWorker) {
    ocrWorker = await Tesseract.createWorker('por');
  }
  return ocrWorker;
}
async function pdfParaImagem(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  // pega só a PRIMEIRA página (90% dos comprovantes)
  const page = await pdf.getPage(1);

  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvasContext: ctx, viewport }).promise;

  return canvas;
}
function limparNomePagadorCaixa(nome) {
  if (!nome) return '';

  return nome
    .replace(/[,.;:-]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 8) // Caixa costuma ter nomes maiores
    .join(' ');
}
const NOMES_PROIBIDOS = [
  'ANTONIO CLERVES OLIVEIRA',
  'VALE VIAGENS'
];

// ================= FUNÇÕES =================
function parseBRL(v) {
  if (!v) return 0;
  return parseFloat(
    v.replace('R$', '')
     .replace(/\./g, '')
     .replace(',', '.')
     .trim()
  ) || 0;
}

function formatBRL(v) {
  return v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}
let taxaContexto = null;

const modal = document.getElementById('modal-taxa');
const inputTaxa = document.getElementById('input-taxa');
const btnAplicar = document.getElementById('btn-aplicar');
const btnCancelar = document.getElementById('btn-cancelar');
inputTaxa.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    btnAplicar.click();
  }

  if (e.key === 'Escape') {
    e.preventDefault();
    fecharModalTaxa();
  }
});

function abrirModalTaxa(contexto) {
  taxaContexto = contexto;
  inputTaxa.value = '';
  modal.classList.remove('hidden');
  setTimeout(() => inputTaxa.focus(), 50);
}

function fecharModalTaxa() {
  modal.classList.add('hidden');
  taxaContexto = null;
}

btnCancelar.addEventListener('click', fecharModalTaxa);

btnAplicar.addEventListener('click', () => {
  if (!taxaContexto) return;

  const { valorEl, taxaEl, resumo } = taxaContexto;
  const taxaValor = parseBRL(inputTaxa.value);

  if (taxaValor < 0) return alert('Taxa inválida');

  const valorOriginal = parseFloat(valorEl.dataset.original) || 0;

  if (taxaValor > valorOriginal) {
    return alert('Taxa maior que o valor');
  }

  const novoValor = taxaValor === 0
    ? valorOriginal
    : valorOriginal - taxaValor;

  valorEl.textContent = formatBRL(novoValor);
  taxaEl.textContent  = taxaValor === 0 ? '' : formatBRL(taxaValor);

  resumo.valor = formatBRL(novoValor);
  resumo.taxa  = taxaValor === 0 ? '' : formatBRL(taxaValor);

  atualizarResumo();
  salvarEstado();
  fecharModalTaxa();
});

function copiarResumo({ nome, hora, valor }) {
  const texto = `${nome} | ${hora} | ${valor}`;

  navigator.clipboard.writeText(texto).catch(() => {});
}

function limitarTexto(texto, limite = 10) {
  if (!texto) return '';
  return texto.length > limite
    ? texto.slice(0, limite) + '...'
    : texto;
}
function atualizarResumo() {
  const linhas = document.querySelectorAll('.file-item');

  let total = 0;

  linhas.forEach(linha => {
    const valorEl = linha.querySelector('.col.valor');
    if (!valorEl) return;

    // pega "R$ 215,75" → 215.75
    const valor = valorEl.textContent
      .replace('R$', '')
      .replace('.', '')
      .replace(',', '.')
      .trim();

    total += parseFloat(valor) || 0;
  });

  document.getElementById('contador-arquivos').textContent = linhas.length;
  document.getElementById('soma-total').textContent =
    total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function identificarBanco(textoOCR) {
  if (!textoOCR) return 'Banco não identificado';

  const texto = textoOCR.toLowerCase();

  // 🟢 PRIORIDADE ABSOLUTA — CAIXA
  if (
    texto.includes('dados do pagador') &&
    (
      texto.includes('caixa economica federal') ||
      texto.includes('caixa econômica federal') ||
      texto.includes('cef')
    )
  ) {
    return 'Caixa Econômica';
  }

  const bancos = [
    { nome: 'Nubank', chaves: ['nubank', 'nu pagamentos', 'roxinho'] },
    { nome: 'Banco Inter', chaves: ['banco inter', 'inter s.a', 'inter pagamentos'] },
    { nome: 'Bradesco', chaves: ['bradesco', 'banco bradesco', 'bradesco s.a'] },
    { nome: 'Itaú', chaves: ['itau', 'itaú', 'banco itau', 'itaú unibanco'] },
    { nome: 'Santander', chaves: ['santander', 'banco santander'] },
    { nome: 'Banco do Nordeste', chaves:['banco do nordeste','bnb'] },
    { nome: 'Banco do Brasil', chaves: ['banco do brasil', 'bb '] },
    { nome: 'PicPay', chaves: ['picpay'] },
    { nome: 'Mercado Pago', chaves: ['mercado pago'] },
    { nome: 'PagBank', chaves: ['pagbank', 'pagseguro'] },
    { nome: 'Neon', chaves: ['neon'] },
    { nome: 'C6 Bank', chaves: ['banco: 336', 'banco c6', 'c6 s.a', 'c6 sa', 'c6pank', 'copank'] },
    { nome: 'Next', chaves: ['next banco'] }
  ];

  for (const banco of bancos) {
    for (const chave of banco.chaves) {
      if (texto.includes(chave)) return banco.nome;
    }
  }

  return 'Banco não identificado';
}

function extrairResumoComprovante(texto) {
if (!texto) {
  return {
    nome: '-',
    hora: '-',
    valor: '-'
  };
}

  const linhas = texto
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  let nome = '';
  let hora = '';
  let valor = '';

  const BLOQUEADAS = [
    'BANCO','PIX','TRANSFERENCIA','TRANSFERÊNCIA',
    'CPF','CNPJ','VALOR','DATA','HORA',
    'COMPROVANTE','PAGAMENTO','REALIZADO',
    'RECEBEDOR','RECEBIDO','CONTA'
  ];

  /* ===== 💰 VALOR ===== */
  for (const l of linhas) {
    const m = l.match(/R\$\s*\d{1,3}(\.\d{3})*,\d{2}/);
    if (m) {
      valor = m[0];
      break;
    }
  }

  /* ===== ⏰ HORA ===== */
  for (const l of linhas) {
    const m = l.match(/\b\d{2}:\d{2}(:\d{2})?\b/);
    if (m) {
      hora = m[0].slice(0, 5); // remove segundos
      break;
    }
  }

  /* ===== 👤 NOME DO PAGADOR ===== */
  for (const l of linhas) {
    const limpa = l
      .replace(/[^A-Za-zÀ-ÿ\s]/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (!limpa) continue;

    const up = limpa.toUpperCase();
    if (BLOQUEADAS.some(b => up.includes(b))) continue;

    const partes = limpa.split(' ').filter(p => p.length >= 3);

    // nome humano típico
    if (partes.length >= 2 && partes.length <= 6) {
      nome = limpa;
      break;
    }
  }
return {
  nome: limparNomePagador(nome) || '-',
  hora: hora || '-',
  valor: valor || '-'
};
}
function numerarLinhasTexto(texto) {
  if (!texto) return '';

  return texto
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    // remove QUALQUER repetição de "n. " no início (7. 7. 7. Texto)
    .map(l => l.replace(/^(\d+\.\s*)+/g, ''))
    .map((linha, i) => `${i + 1}. ${linha}`)
    .join('\n');
}


function limparNomePagador(nome) {
  if (!nome) return '';

  const nomeLimpo = nome
    .replace(/[,.;:-]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const nomeNormalizado = normalizarTexto(nomeLimpo);

  // 🚫 frases técnicas (linha inteira)
  const FRASES_INVALIDAS = [
    'DADOS DO PAGADOR',
    'DADOS DO RECEBEDOR',
    'DADOS DE QUEM RECEBEU',
    'DADOS DE QUEM FEZ A TRANSACAO',
    'PAGADOR',
    'RECEBEDOR',
    'NOME'
  ];

  if (FRASES_INVALIDAS.includes(nomeNormalizado)) {
    return '';
  }

  // 🚫 bloqueio específico (ex: sua própria empresa)
  for (const proibido of NOMES_PROIBIDOS) {
    if (nomeNormalizado.includes(proibido)) {
      return '';
    }
  }

  // ✅ validação mínima realista
  if (nomeLimpo.split(' ').length < 2) {
    return '';
  }

  return nomeLimpo
    .split(' ')
    .slice(0, 6)
    .join(' ');
}


function normalizarTexto(txt) {
  return txt
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}



function regraBancoDoBrasil(texto) {
  const linhas = texto
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  let nome = '';
  let hora = '';
  let valor = '';

  /* ===== 💰 VALOR + ⏰ HORA (linha seguinte) ===== */
  for (let i = 0; i < linhas.length; i++) {
    const m = linhas[i].match(/R\$\s*\d+,\d{2}/);
    if (m) {
      valor = m[0];

      // ⏰ hora vem na próxima linha
      const prox = linhas[i + 1];
      if (prox) {
        const h = prox.match(/\b\d{2}:\d{2}(:\d{2})?\b/);
        if (h) hora = h[0].slice(0, 5);
      }
      break;
    }
  }

  /* ===== 👤 PAGADOR (linha após "Pagador") ===== */
  for (let i = 0; i < linhas.length; i++) {
    if (linhas[i].toUpperCase() === 'PAGADOR') {
      const candidato = linhas[i + 1];
      if (!candidato) break;

      nome = candidato
        .replace(/[^A-Za-zÀ-ÿ\s]/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();

      break;
    }
  }

  return {
    nome: limparNomePagador(nome) || '-',
    hora: hora || '-',
    valor: valor || '-'
  };
}
function regraNubank(texto) {
  const linhas = texto
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  let nome = '';

  for (let i = 0; i < linhas.length; i++) {
    if (linhas[i].toLowerCase() === 'origem') {
      const candidato = linhas[i + 1];
      if (!candidato) break;

   const limpo = candidato
  .replace(/^nome\s+/i, '') // 🔥 remove "Nome " no começo
  .replace(/[^A-Za-zÀ-ÿ\s]/g, ' ')
  .replace(/\s{2,}/g, ' ')
  .trim();
      if (limpo.length >= 5) {
  nome = limpo;
}
      break;
    }
  }

  return {
    nome: limparNomePagador(nome) || '-',
    hora: '-',   // 🔁 universal
    valor: '-'   // 🔁 universal
  };
}
function regraBancoInter(texto) {
  const linhas = texto
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  let nome = '';

  for (let i = 0; i < linhas.length; i++) {
    if (linhas[i].toLowerCase() === 'quem pagou') {
      const candidato = linhas[i + 1];
      if (!candidato) break;

      const limpo = candidato
        .replace(/^nome\s+/i, '') // remove "Nome "
        .replace(/[^A-Za-zÀ-ÿ\s]/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();

      if (limpo.split(' ').length >= 2) {
        nome = limpo;
      }
      break;
    }
  }

  return {
    nome: limparNomePagador(nome) || '-',
    hora: '-',   // 🔁 universal
    valor: '-'   // 🔁 universal
  };
}


function regraBancoDoNordeste(texto) {
  const linhas = texto
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  let nome = '';

  for (let i = 0; i < linhas.length; i++) {
    const linhaLimpa = linhas[i]
      .replace(/^\d+\.\s*/, '') // remove "13. "
      .toUpperCase();

    if (linhaLimpa === 'PAGADOR' || linhaLimpa === 'O PAGADOR') {

      // procura até 5 linhas abaixo
      for (let j = i + 1; j <= i + 5 && j < linhas.length; j++) {
        const candidata = linhas[j]
          .replace(/^\d+\.\s*/, '') // remove numeração
          .replace(/^NOME\s*/i, '') // remove "Nome "
          .replace(/[^A-Za-zÀ-ÿ\s]/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .trim();

        if (candidata.split(' ').length >= 2) {
          nome = candidata;
          break;
        }
      }
      break;
    }
  }

  return {
    nome: limparNomePagador(nome) || '-',
    hora: '-',   // 🔁 universal
    valor: '-'   // 🔁 universal
  };
}
function regraSantander(texto) {
  const linhas = texto
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  let nome = '';

  for (let i = 0; i < linhas.length; i++) {
    if (linhas[i].toLowerCase() === 'dados do pagador') {

      // normalmente vem: "De" → nome
      const possivelDe = linhas[i + 1]?.toLowerCase();
      const candidato = linhas[i + 2];

      if (possivelDe === 'de' && candidato) {
        const limpo = candidato
          .replace(/^nome\s+/i, '')
          .replace(/[^A-Za-zÀ-ÿ\s]/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .trim();

        if (limpo.split(' ').length >= 2) {
          nome = limpo;
        }
      }
      break;
    }
  }

  return {
    nome: limparNomePagador(nome) || '-',
    hora: '-',   // 🔁 universal
    valor: '-'   // 🔁 universal
  };
}
function regraBradesco(texto) {
  const linhas = texto
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  let nome = '';

  // linha 27 no OCR = índice 26 no array
  const linha27 = linhas[26];

  if (linha27) {
    const limpo = linha27
      .replace(/^(\d+\.\s*)+/g, '') // remove "27. "
      .replace(/^nome\s*/i, '')     // remove "Nome "
      .replace(/[^A-Za-zÀ-ÿ\s]/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (limpo.split(' ').length >= 2) {
      nome = limpo;
    }
  }

  return {
    nome: limparNomePagador(nome) || '-',
    hora: '-',   // 🔁 universal
    valor: '-'   // 🔁 universal
  };
}
function regraCaixa(texto) {
  const linhas = texto
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  let nome = '-';

  for (let i = 0; i < linhas.length; i++) {

    // 1️⃣ acha "Dados do pagador"
    if (linhas[i].toLowerCase().includes('dados do pagador')) {

      // 2️⃣ procura a linha "Nome"
      for (let j = i + 1; j < i + 10 && j < linhas.length; j++) {

const lj = linhas[j]
  .replace(/^(\d+\.\s*)+/g, '')
  .toLowerCase();

        if (lj === 'nome' || lj.startsWith('nome ')) {

          // 3️⃣ desce até achar o nome real
          for (let k = j + 1; k < j + 10 && k < linhas.length; k++) {

            const candidato = linhas[k];
            if (!candidato) continue;

            const up = candidato.toUpperCase();

            // ⛔ parou, passou do nome
            if (up.includes('CPF') || up.includes('CNPJ')) break;

            const limpo = candidato
              .replace(/^(\d+\.\s*)+/g, '')
              .replace(/[^A-Za-zÀ-ÿ\s]/g, ' ')
              .replace(/\s{2,}/g, ' ')
              .trim();

            if (limpo.split(' ').length >= 2) {
              nome = limparNomePagadorCaixa(limpo);
              break;
            }
          }
          break;
        }
      }
      break;
    }
  }

  return {
    nome,
    hora: '-',
    valor: '-'
  };
}
function regraPicPay(texto) {
  const linhas = texto
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  let nome = '-';

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i]
      .replace(/^(\d+\.\s*)+/g, '')
      .toLowerCase();

    // 1️⃣ achou "de" sozinho
    if (linha === 'de') {
      const partesNome = [];

      // 2️⃣ junta linhas seguintes até achar CPF / CNPJ / parada
      for (let j = i + 1; j < i + 10 && j < linhas.length; j++) {
        const raw = linhas[j];
        if (!raw) break;

        const up = raw.toUpperCase();

        // ⛔ condição de parada
        if (
          up.includes('CPF') ||
          up.includes('CNPJ') ||
          up.includes('PIC PAY') ||
          up.includes('PICPAY') ||
          up.includes('ID ') ||
          up.includes('CHAVE') ||
          /\d{3}\.\d{3}/.test(up) ||
          /\d{11,14}/.test(up)
        ) {
          break;
        }

        const limpo = raw
          .replace(/^(\d+\.\s*)+/g, '')
          .replace(/[^A-Za-zÀ-ÿ\s]/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .trim();

        if (limpo.length >= 2) {
          partesNome.push(limpo);
        }
      }

      if (partesNome.length) {
        nome = limparNomePagador(partesNome.join(' '));
      }
      break;
    }
  }

  return {
    nome,
    hora: '-',
    valor: '-'
  };
}
function regraC6Bank(texto) {
  const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean);

  let valor = '-';
  let hora  = '-';
  let nome  = '-';

  for (const l of linhas) {
    const m = l.match(/\b\d{2}:\d{2}\b/);
    if (m) { hora = m[0]; break; }
  }

  for (const l of linhas) {
    const m = l.match(/R\$\s*\d{1,3}(\.\d{3})*,\d{2}/);
    if (m) { valor = m[0]; break; }
  }

  let dentroBloco = false;

  for (const l of linhas) {
    const up = l.toUpperCase();

    if (up.replace(/[^A-Z]/g,'').includes('CONTADEORIGEM')) {
      dentroBloco = true;
      continue;
    }

    if (dentroBloco && up.includes('BANCO: 336')) break;

    if (dentroBloco) {
      const limpo = l
        .replace(/[^A-Za-zÀ-ÿ\s]/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();

      if (
        limpo.split(' ').length >= 2 &&
        limpo.length >= 8 &&
        !up.includes('AGÊNCIA') &&
        !up.includes('CONTA')
      ) {
        nome = limparNomePagador(limpo);
        break;
      }
    }
  }

  return { nome, hora, valor };
}

function regraMercadoPago(texto) {
  const linhas = texto
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  let hora  = '-';
  let valor = '-';
  let nome  = '-';

  /* ========= ⏰ HORÁRIO ========= */
  for (const l of linhas) {
    let m = l.match(/às?\s*(\d{1,2})h(\d{2})/i);
    if (m) {
      hora = `${m[1].padStart(2,'0')}:${m[2]}`;
      break;
    }

    m = l.match(/\b(\d{1,2})h(\d{2})\b/i);
    if (m) {
      hora = `${m[1].padStart(2,'0')}:${m[2]}`;
      break;
    }

    m = l.match(/\b\d{2}:\d{2}\b/);
    if (m) {
      hora = m[0];
      break;
    }
  }

  /* ========= 💰 VALOR ========= */
  for (const l of linhas) {
    let m = l.match(/R\$\s*\d{1,3}(\.\d{3})*,\d{2}/);
    if (m) {
      valor = m[0];
      break;
    }

    // fallback: R$ 35
    m = l.match(/R\$\s*(\d{1,3})\b/);
    if (m) {
      valor = `R$ ${m[1]},00`;
      break;
    }
  }

  /* ========= 👤 NOME (fallback “De”) ========= */
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i].toLowerCase();

    if (l === 'de' || l.endsWith(' e de')) {
      const candidato = linhas[i + 1];
      if (!candidato) continue;

      const limpo = candidato
        .replace(/[^A-Za-zÀ-ÿ\s]/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();

      if (limpo.split(' ').length >= 2) {
        nome = limparNomePagador(limpo);
        break;
      }
    }
  }

  return { nome, hora, valor };
}


//função principal
function extrairResumoPorBanco(texto, banco) {
  // 🔥 PRIORIDADE ABSOLUTA PARA BLOCO "Dados do pagador"
if (texto.toLowerCase().includes('dados do pagador')) {
  const tentativaCaixa = regraCaixa(texto);
  if (tentativaCaixa.nome && tentativaCaixa.nome !== '-') {
    const universal = extrairResumoComprovante(texto);
    return {
      nome: tentativaCaixa.nome,
      hora: universal.hora,
      valor: universal.valor
    };
  }
}

  switch (banco) {
    case 'Banco do Brasil':
      return regraBancoDoBrasil(texto);

    case 'Nubank': {
      const nubank = regraNubank(texto);
      const universal = extrairResumoComprovante(texto);
      return { nome: nubank.nome !== '-' ? nubank.nome : universal.nome, hora: universal.hora, valor: universal.valor };
    }

    case 'Banco Inter': {
      const inter = regraBancoInter(texto);
      const universal = extrairResumoComprovante(texto);
      return { nome: inter.nome !== '-' ? inter.nome : universal.nome, hora: universal.hora, valor: universal.valor };
    }

    case 'Banco do Nordeste': {
      const nordeste = regraBancoDoNordeste(texto);
      const universal = extrairResumoComprovante(texto);
      return { nome: nordeste.nome !== '-' ? nordeste.nome : universal.nome, hora: universal.hora, valor: universal.valor };
    }

    case 'Santander': {
      const santander = regraSantander(texto);
      const universal = extrairResumoComprovante(texto);
      return { nome: santander.nome !== '-' ? santander.nome : universal.nome, hora: universal.hora, valor: universal.valor };
    }

    case 'Bradesco': {
      const bradesco = regraBradesco(texto);
      const universal = extrairResumoComprovante(texto);
      return { nome: bradesco.nome !== '-' ? bradesco.nome : universal.nome, hora: universal.hora, valor: universal.valor };
    }
    case 'PicPay': {
      const picpay = regraPicPay(texto);
      const universal = extrairResumoComprovante(texto);
      return {nome: picpay.nome !== '-' ? picpay.nome : universal.nome,hora: universal.hora,valor: universal.valor };
    }
case 'C6 Bank': {
  const c6 = regraC6Bank(texto);
  return c6;
}
case 'Mercado Pago': {
  const mp = regraMercadoPago(texto);
  const universal = extrairResumoComprovante(texto);

  return {
    nome: universal.nome, // 👈 SEMPRE universal
    hora: mp.hora || universal.hora,
    valor: mp.valor || universal.valor
  };
}
    default:
      return extrairResumoComprovante(texto);
  }
}



// ================= STORAGE =================
function salvarEstado() {
  if (CARREGANDO_ESTADO) return;

  const itens = document.querySelectorAll('.file-item');
  const registros = [];

  itens.forEach(item => {
    const linha = item.querySelector('.ocr-row');
    if (!linha) return;

    registros.push({
      nomeArquivo: linha.querySelector('.col.arquivo')?.getAttribute('title') || '',
      banco: '',
      resumo: {
        nome: linha.querySelector('.col.nome')?.textContent || '-',
        hora: linha.querySelector('.col.hora')?.textContent || '-',
        valor: linha.querySelector('.col.valor')?.textContent || '-',
        taxa: linha.querySelector('.col.taxa')?.textContent || ''
      },
      texto: item.querySelector('.ocr-detalhe')?.textContent || ''
    });
  });

  localStorage.setItem(STORAGE_KEY, JSON.stringify(registros));
}
const STORAGE_AGENTE  = 'ocr_nome_agente';
const STORAGE_AGENCIA = 'ocr_nome_agencia';
const STORAGE_KEY = 'ocr_registros';

function carregarRegistros() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function criarItemOCR({ nomeArquivo, banco, resumo, texto }) {
  const item = document.createElement('div');
  item.className = 'file-item';

  // garante taxa
  resumo.taxa = resumo.taxa || '';

  const linha = document.createElement('div');
  linha.className = 'ocr-row';

  linha.innerHTML = `
    <span class="col arquivo" title="${nomeArquivo}">
  ${limitarTexto(nomeArquivo, 10)}
</span>    <span class="col nome" contenteditable="false">${resumo.nome}</span>
    <span class="col hora" contenteditable="false">${resumo.hora}</span>
    <span class="col valor" contenteditable="false">${resumo.valor}</span>
    <span class="col taxa">${resumo.taxa || ''}</span>

    <span class="row-actions">
      <button class="pill primary btn-copy">📋 Copiar</button>
      <button class="pill btn-edit">✏️ Editar</button>
      <button class="pill btn-taxa">💰 Taxa</button>
      <button class="pill btn-add">➕ Adicionar</button>
      <button class="pill danger btn-remove">🗑 Remover</button>
    </span>
  `;
const nomeArquivoEl = linha.querySelector('.col.arquivo');

nomeArquivoEl.addEventListener('click', e => {
  e.stopPropagation();
  item.classList.toggle('expanded');
});
  // TEXTO OCR COMPLETO
  const detalhe = document.createElement('div');
  detalhe.className = 'ocr-detalhe';
  detalhe.textContent = numerarLinhasTexto(texto);

  // ================= AÇÕES =================

  const nomeEl  = linha.querySelector('.col.nome');
  const horaEl  = linha.querySelector('.col.hora');
  const valorEl = linha.querySelector('.col.valor');

// 🔒 salva o valor original apenas uma vez
if (!valorEl.dataset.original) {
  valorEl.dataset.original = parseBRL(valorEl.textContent);
}

valorEl.addEventListener('blur', () => {
  atualizarResumo();
  salvarEstado();
});
  const taxaEl  = linha.querySelector('.col.taxa');

  /* 📋 COPIAR */
 const btnCopy = linha.querySelector('.btn-copy');
const textoOriginal = btnCopy.textContent;

btnCopy.addEventListener('click', e => {
  e.stopPropagation();

  const textoCopiar = `${nomeEl.textContent} ${valorEl.textContent} ${horaEl.textContent}`;
  navigator.clipboard.writeText(textoCopiar).catch(() => {});

  btnCopy.textContent = '✅ Copiado';
  btnCopy.classList.add('copied');

  setTimeout(() => {
    btnCopy.textContent = textoOriginal;
    btnCopy.classList.remove('copied');
  }, 1000);
});

  /* ✏️ EDITAR */
  linha.querySelector('.btn-edit').addEventListener('click', e => {
    e.stopPropagation();

    const editando = nomeEl.isContentEditable;

    nomeEl.contentEditable  = !editando;
    horaEl.contentEditable  = !editando;
    valorEl.contentEditable = !editando;

    nomeEl.focus();
  });

  /* 💰 TAXA */
/* 💰 TAXA */
linha.querySelector('.btn-taxa').addEventListener('click', e => {
  e.stopPropagation();
  abrirModalTaxa({ valorEl, taxaEl, resumo });
});


  /* 🗑 REMOVER */
linha.querySelector('.btn-remove').addEventListener('click', e => {
  e.stopPropagation();
  item.remove();
  salvarEstado();
  atualizarResumo(); 
});

  

  item.append(linha, detalhe);
  return item;
}
function bindCalculadora(input, resultado) {
  if (!input || !resultado) return;

  function calcular() {
    const valor = parseBRL(input.value);

    if (!valor || valor <= 0) {
      resultado.innerHTML = '';
      return;
    }

    let percentual = 0;
    if (valor <= 150) percentual = 18;
    else if (valor <= 300) percentual = 12;
    else if (valor <= 450) percentual = 10;
    else percentual = 6;

    const taxa = valor * (percentual / 100);

    resultado.innerHTML = `
      <div>🪙 Valor: <b>${formatBRL(valor)}</b></div>
      <div>⚙️ Taxa: ${percentual}%</div>
      <div>💰 Taxa de serviço: <b>${formatBRL(taxa)}</b></div>
    `;
  }

  input.addEventListener('input', calcular);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') calcular();
  });
}

// ================= DOM =================

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('fileInput');
  const list  = document.getElementById('fileList');
  const btnClear = document.getElementById('btnClear');
  const uploadBox = document.getElementById('uploadBox');

  if (!input || !list || !uploadBox) return;

  /* ================= CALCULADORA ================= */

bindCalculadora(
  document.getElementById('calc-valor'),
  document.getElementById('calc-resultado')
);

bindCalculadora(
  document.getElementById('calc-valor-modal'),
  document.getElementById('calc-resultado-modal')
);
  

  /* ============== FIM CALCULADORA ============== */
let rodoviarias = [];

async function carregarRodoviarias() {
  try {
    const res = await fetch('./rodoviarias.json');
    rodoviarias = await res.json();
    renderizarRodoviarias(rodoviarias);
  } catch (e) {
    console.error('Erro ao carregar rodoviarias.json', e);
  }
}

function renderizarRodoviarias(lista) {
  const container = document.getElementById('rod-lista');
  if (!container) return;

  container.innerHTML = '';

  lista.forEach(r => {
    const horario = r.Horario
      ? `
        <div class="horario">
          🕒 <b>Seg–Sex:</b> ${r.Horario.SegSex || '-'}
          ${r.Horario.Sab ? `<br>🕒 <b>Sáb:</b> ${r.Horario.Sab}` : ''}
          ${r.Horario.Dom ? `<br>🕒 <b>Dom:</b> ${r.Horario.Dom}` : ''}
        </div>
      `
      : '';

    const div = document.createElement('div');
    div.className = 'rod-item';

    // 🔑 endereço completo para o Maps
    const endereco = `${r.Descricao}, ${r['CIDADE - UF']}`;

    div.dataset.endereco = endereco;

    div.innerHTML = `
      <div class="titulo">${r.Nome}</div>
      <div class="cidade">${r['CIDADE - UF']}</div>
      <div class="desc">${r.Descricao}</div>
      ${horario}

      <!-- preview do mapa -->
      <div class="rod-map hidden"></div>
    `;

    container.appendChild(div);
  });
}


document.getElementById('rod-pesquisa')?.addEventListener('input', e => {
  const termo = e.target.value.toLowerCase();

  const filtrado = rodoviarias.filter(r =>
    r.Nome?.toLowerCase().includes(termo) ||
    r['CIDADE - UF']?.toLowerCase().includes(termo) ||
    r.Descricao?.toLowerCase().includes(termo)
  );

  renderizarRodoviarias(filtrado);
});

/* carrega quando a página abre */
carregarRodoviarias();


  // ===== DRAG & DROP =====
  ['dragenter','dragover','dragleave','drop'].forEach(event => {
    uploadBox.addEventListener(event, e => e.preventDefault());
  });

  uploadBox.addEventListener('dragover', () => {
    uploadBox.classList.add('dragover');
  });

  uploadBox.addEventListener('dragleave', () => {
    uploadBox.classList.remove('dragover');
  });

  uploadBox.addEventListener('drop', e => {
    uploadBox.classList.remove('dragover');

    const files = e.dataTransfer.files;
    if (!files.length) return;

    input.files = files;
    input.dispatchEvent(new Event('change'));
  });

  /* ===== CAMPOS AGENTE / AGENCIA (STORAGE) ===== */
  const inputAgente   = document.getElementById('nome-agente');
  const selectAgencia = document.getElementById('nome-agencia');

  // 🔁 RESTAURA AO CARREGAR
  if (inputAgente) {
    inputAgente.value = localStorage.getItem(STORAGE_AGENTE) || '';
  }

  if (selectAgencia) {
    selectAgencia.value =
      localStorage.getItem(STORAGE_AGENCIA) || selectAgencia.value;
  }

  // 💾 SALVA EM TEMPO REAL
  inputAgente?.addEventListener('input', () => {
    localStorage.setItem(STORAGE_AGENTE, inputAgente.value.trim());
  });

  selectAgencia?.addEventListener('change', () => {
    localStorage.setItem(STORAGE_AGENCIA, selectAgencia.value);
  });

CARREGANDO_ESTADO = true;

const registrosSalvos = carregarRegistros();
registrosSalvos.forEach(r => {
  list.appendChild(criarItemOCR(r));
});

CARREGANDO_ESTADO = false;

atualizarResumo(); 

  // 🗑 Limpar histórico
  btnClear?.addEventListener('click', () => {
    if (!confirm('Deseja apagar todo o histórico de OCR?')) return;
    localStorage.removeItem(STORAGE_KEY);
    list.innerHTML = '';
     atualizarResumo();
  });


const sidebarButtons = document.querySelectorAll('.sidebar button[data-page]');
const pages = document.querySelectorAll('.page');

sidebarButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.page;

    sidebarButtons.forEach(b => b.classList.remove('active'));
    pages.forEach(p => p.classList.remove('active'));

    btn.classList.add('active');

    const page = document.getElementById(target);
    if (page) page.classList.add('active');
  });
});

  // 📂 OCR
  input.addEventListener('change', async () => {
    const files = Array.from(input.files);

for (const file of files) {
  try {
    const worker = await getOCRWorker();
let imagemOCR = file;

if (file.type === 'application/pdf') {
  imagemOCR = await pdfParaImagem(file);
}

const res = await worker.recognize(imagemOCR);    const textoExtraido = res.data.text.trim() || '';

    const banco = identificarBanco(textoExtraido);
    const resumo = extrairResumoPorBanco(textoExtraido, banco);

    const novoItem = criarItemOCR({
      nomeArquivo: file.name,
      banco,
      resumo,
      texto: textoExtraido
    });

    list.appendChild(novoItem);
salvarEstado();
atualizarResumo();

  } catch (err) {
    const erroItem = document.createElement('div');
    erroItem.className = 'file-item';
    erroItem.textContent = `Erro ao processar ${file.name}`;
    list.appendChild(erroItem);
  }
}

  });
});
document.addEventListener('click', e => {
const item = e.target.closest('.rod-item');
if (!item || e.target.closest('iframe')) return;

  const mapBox = item.querySelector('.rod-map');
  const endereco = item.dataset.endereco;
  if (!mapBox || !endereco) return;

  // fecha outros mapas
  document.querySelectorAll('.rod-map').forEach(m => {
    if (m !== mapBox) {
      m.classList.add('hidden');
      m.innerHTML = '';
    }
  });

  // toggle
  if (!mapBox.classList.contains('hidden')) {
    mapBox.classList.add('hidden');
    mapBox.innerHTML = '';
    return;
  }

  const url = `https://www.google.com/maps?q=${encodeURIComponent(endereco)}&output=embed`;

  mapBox.innerHTML = `
    <iframe
      loading="lazy"
referrerpolicy="no-referrer-when-downgrade"
      src="${url}">
    </iframe>
  `;

  mapBox.classList.remove('hidden');
});

// 🧹 Finaliza o worker OCR ao sair da página
window.addEventListener('beforeunload', async () => {
  if (ocrWorker) {
    await ocrWorker.terminate();
    ocrWorker = null;
  }
});
