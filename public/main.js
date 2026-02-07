
const NOMES_PROIBIDOS = [
  'ANTONIO CLERVES OLIVEIRA',
  'VALE VIAGENS'
];

// ================= FUNÇÕES =================
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

function identificarBanco(textoOCR) {
  if (!textoOCR) return 'Banco não identificado';

  const texto = textoOCR.toLowerCase();

  const bancos = [
    { nome: 'Nubank', chaves: ['nubank', 'nu pagamentos', 'roxinho'] },
    { nome: 'Banco Inter', chaves: ['banco inter', 'inter s.a', 'inter pagamentos'] },
    { nome: 'Bradesco', chaves: ['bradesco', 'banco bradesco', 'bradesco s.a'] },
    { nome: 'Itaú', chaves: ['itau', 'itaú', 'banco itau', 'itaú unibanco'] },
    { nome: 'Santander', chaves: ['santander', 'banco santander'] },
    { nome: 'Banco do Brasil', chaves: ['banco do brasil', 'bb ', 'bb-'] },
    { nome: 'Caixa Econômica', chaves: ['caixa', 'caixa economica', 'cef'] },
    { nome: 'PicPay', chaves: ['picpay'] },
    { nome: 'Mercado Pago', chaves: ['mercado pago', 'mercadopago'] },
    { nome: 'PagBank', chaves: ['pagbank', 'pag seguro', 'pagseguro'] },
    { nome: 'Neon', chaves: ['neon pagamentos', 'banco neon', 'neon'] },
    { nome: 'C6 Bank', chaves: ['c6 bank', 'cartão c6', 'banco c6'] },
    { nome: 'Next', chaves: ['next banco', 'banco next'] }
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

  const nomeNormalizado = normalizarTexto(nome);

  // 🚫 bloqueio por FRASE
  for (const proibido of NOMES_PROIBIDOS) {
    if (nomeNormalizado.includes(proibido)) {
      return '';
    }
  }

  return nome
    .replace(/[,.;:-]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 4)
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

function extrairResumoPorBanco(texto, banco) {
  switch (banco) {
    case 'Banco do Brasil':
      return regraBancoDoBrasil(texto);

    default:
      return extrairResumoComprovante(texto);
  }
}



// ================= STORAGE =================
function salvarEstado() {
  const itens = document.querySelectorAll('.file-item');
  const registros = [];

  itens.forEach(item => {
    const linha = item.querySelector('.ocr-row');

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

const STORAGE_KEY = 'ocr_registros';

function carregarRegistros() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function salvarRegistro(registro) {
  const registros = carregarRegistros();
  registros.push(registro);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(registros));
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
  linha.querySelector('.btn-taxa').addEventListener('click', e => {
    e.stopPropagation();

    const v = prompt('Digite o valor da taxa (ex: 5,00)');
    if (!v) return;

    const taxaFormatada = v.includes('R$') ? v : `R$ ${v}`;
    taxaEl.textContent = taxaFormatada;
    resumo.taxa = taxaFormatada;

    salvarEstado();
  });

  /* 🗑 REMOVER */
linha.querySelector('.btn-remove').addEventListener('click', e => {
  e.stopPropagation();
  item.remove();
  salvarEstado();
});

  

  item.append(linha, detalhe);
  return item;
}

// ================= DOM =================

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('fileInput');
  const list  = document.getElementById('fileList');
  const btnClear = document.getElementById('btnClear');

  if (!input || !list) return;

  // 🔄 Carregar histórico ao dar F5
  const registrosSalvos = carregarRegistros();
  registrosSalvos.forEach(r => {
    list.appendChild(criarItemOCR(r));
  });

  // 🗑 Limpar histórico
  btnClear?.addEventListener('click', () => {
    if (!confirm('Deseja apagar todo o histórico de OCR?')) return;
    localStorage.removeItem(STORAGE_KEY);
    list.innerHTML = '';
  });

  // 📂 OCR
  input.addEventListener('change', async () => {
    const files = Array.from(input.files);

for (const file of files) {
  try {
    const worker = await Tesseract.createWorker('por');
    const res = await worker.recognize(file);
    await worker.terminate();

    const textoExtraido = res.data.text.trim() || '';

    const banco = identificarBanco(textoExtraido);
    const resumo = extrairResumoPorBanco(textoExtraido, banco);

    const novoItem = criarItemOCR({
      nomeArquivo: file.name,
      banco,
      resumo,
      texto: textoExtraido
    });

    list.appendChild(novoItem);

    salvarRegistro({
      nomeArquivo: file.name,
      banco,
      resumo,
      texto: textoExtraido
    });

  } catch (err) {
    const erroItem = document.createElement('div');
    erroItem.className = 'file-item';
    erroItem.textContent = `Erro ao processar ${file.name}`;
    list.appendChild(erroItem);
  }
}

  });
});
