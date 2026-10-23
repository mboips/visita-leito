// validador.js
// Regras que impedem o registro de dados que identifiquem pacientes.
// É usado pelo navegador (aviso na hora) E pelo servidor (bloqueio de verdade).
// ATENÇÃO: é uma heurística. Reduz muito o risco, mas não garante 100%.

// Palavras que podem aparecer com inicial maiúscula sem serem nome de pessoa.
const PERMITIDAS = new Set([
  "hospital", "m'boi", "m’boi", "mboi", "mirim", "uti", "ucin", "cph", "rpa", "sia",
  "sus", "epi", "ps", "cm", "ped", "anexo", "maternidade", "centro", "cirurgico",
  "neonatal", "emergencia", "pediatrica", "psiquiatria", "saude", "mental",
  "medicacao", "adulto", "andar", "enfermagem", "nutricao", "higiene", "medico",
  "medica", "barulho", "paciente", "pacientes", "acompanhante", "acompanhantes",
  "familiar", "familiares", "leito", "leitos", "box", "sala", "quarto", "setor",
  "unidade", "equipe", "tecnico", "tecnica", "enfermeiro", "enfermeira", "lideranca",
]);

function semAcento(s) {
  return String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function ehMaiuscula(c) {
  return c !== c.toLowerCase();
}

function inicioDeFrase(texto, i) {
  return /(^|[.!?:\n]\s*)$/.test(texto.slice(0, i));
}

function montarMensagem(problemas, cabecalho) {
  const linhas = problemas.slice(0, 6).map(
    (p) => "• " + (p.trecho ? `"${p.trecho}": ` : "") + p.dica
  );
  return cabecalho + "\n" + linhas.join("\n");
}

const RE_DATA = /\b\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\b/g;
const RE_EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const RE_NUMERO = /\d[\d.\-\s()\/]{4,}\d/g;

const DICA_NOME =
  "parece nome de pessoa. Use só iniciais (ex.: M.S.) ou escreva em minúsculas se for palavra comum.";

function validarTextoLivre(texto) {
  const t = String(texto ?? "");
  const problemas = [];
  const add = (tipo, trecho, dica) => {
    if (!problemas.some((p) => p.tipo === tipo && p.trecho === trecho)) {
      problemas.push({ tipo, trecho, dica });
    }
  };

  if (t.length > 300) {
    add("tamanho", "", "o texto passa de 300 caracteres. Resuma, sem detalhes clínicos.");
  }

  for (const m of t.matchAll(RE_DATA)) {
    add("data", m[0], "datas completas podem ser a de nascimento. Remova.");
  }
  for (const m of t.matchAll(RE_EMAIL)) {
    add("email", m[0], "e-mail identifica pessoa. Remova.");
  }
  const semDatas = t.replace(RE_DATA, " ");
  for (const m of semDatas.matchAll(RE_NUMERO)) {
    if (m[0].replace(/\D/g, "").length >= 7) {
      add("numero", m[0].trim(), "número longo pode ser CPF, telefone, prontuário ou cartão SUS. Remova.");
    }
  }

  // Palavras com inicial maiúscula que não são siglas/termos permitidos
  const tokens = [...t.matchAll(/\p{L}[\p{L}'’]*/gu)];
  const ehNomeProvavel = (tok) =>
    tok.length >= 3 && ehMaiuscula(tok[0]) && !PERMITIDAS.has(semAcento(tok).toLowerCase());

  tokens.forEach((m, k) => {
    const tok = m[0];
    if (!ehNomeProvavel(tok)) return;
    const i = m.index;
    const tudoMaiusculo = tok === tok.toUpperCase();
    const prox = tokens[k + 1];
    const proxCap =
      prox &&
      /^\s+$/.test(t.slice(i + tok.length, prox.index)) &&
      ehNomeProvavel(prox[0]);
    if (!inicioDeFrase(t, i) || tudoMaiusculo || proxCap) {
      add("nome", tok, DICA_NOME);
    }
  });

  // Palavras-gatilho ("paciente", "sra", "filho de"...) seguidas de nome
  const gatilho =
    /\b(paciente|pcte|pct|sr|sra|senhor|senhora|seu|dona|dna|mae|pai|filho|filha|esposa|marido|irmao|irma|nome)\b\.?\s*:?\s*(?:d[aeo]s?\s+)?([a-z][a-z'’]*)/gi;
  for (const m of semAcento(t).matchAll(gatilho)) {
    const tok = m[2];
    if (ehMaiuscula(tok[0]) && tok.length >= 2 && !PERMITIDAS.has(tok.toLowerCase())) {
      add("nome", tok, DICA_NOME);
    }
  }

  return {
    ok: problemas.length === 0,
    problemas,
    mensagem: problemas.length
      ? montarMensagem(problemas, "Não é permitido registrar dados que identifiquem o paciente:")
      : "",
  };
}

const RE_LEITO =
  /^(leito|box|bx|lt|l|cama|berco|poltrona|sala|quarto|uti|ps|rpa)?\s*[-.]?\s*[a-z]{0,2}\s*[-.]?\s*\d{1,3}[a-z]?$/;

function validarLeito(valor) {
  const itens = String(valor ?? "")
    .split(/[,;\/]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (itens.length === 0) {
    const problemas = [{ tipo: "leito", trecho: "", dica: "informe ao menos um leito." }];
    return { ok: false, problemas, mensagem: montarMensagem(problemas, "Leito inválido:") };
  }
  if (itens.length > 30) {
    const problemas = [{ tipo: "leito", trecho: "", dica: "máximo de 30 leitos por registro." }];
    return { ok: false, problemas, mensagem: montarMensagem(problemas, "Leito inválido:") };
  }

  const problemas = itens
    .filter((i) => i.length > 14 || !RE_LEITO.test(semAcento(i).toLowerCase()))
    .map((i) => ({
      tipo: "leito",
      trecho: i,
      dica: "use só a identificação do leito (ex.: Leito 01, A12, Box 3), sem nomes ou outros dados.",
    }));

  return {
    ok: problemas.length === 0,
    problemas,
    mensagem: problemas.length ? montarMensagem(problemas, "Leito inválido:") : "",
  };
}

// Usado ao devolver registros antigos: apaga datas, e-mails e números longos.
function mascararSensivel(texto) {
  return String(texto ?? "")
    .replace(RE_DATA, "[removido]")
    .replace(RE_EMAIL, "[removido]")
    .replace(RE_NUMERO, (m) => (m.replace(/\D/g, "").length >= 7 ? "[removido]" : m));
}
