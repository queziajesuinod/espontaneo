/* O modelo de IA erra capítulo com naturalidade e confiança, e gente
   digitando erra igual. Toda referência passa por aqui antes de entrar. */

const LIVROS: Record<string, number> = {
  "genesis": 50, "exodo": 40, "levitico": 27, "numeros": 36, "deuteronomio": 34,
  "josue": 24, "juizes": 21, "rute": 4, "1 samuel": 31, "2 samuel": 24,
  "1 reis": 22, "2 reis": 25, "1 cronicas": 29, "2 cronicas": 36,
  "esdras": 10, "neemias": 13, "ester": 10, "jo": 42, "salmos": 150,
  "proverbios": 31, "eclesiastes": 12, "cantares": 8, "isaias": 66,
  "jeremias": 52, "lamentacoes": 5, "ezequiel": 48, "daniel": 12,
  "oseias": 14, "joel": 3, "amos": 9, "obadias": 1, "jonas": 4,
  "miqueias": 7, "naum": 3, "habacuque": 3, "sofonias": 3, "ageu": 2,
  "zacarias": 14, "malaquias": 4,
  "mateus": 28, "marcos": 16, "lucas": 24, "joao": 21, "atos": 28,
  "romanos": 16, "1 corintios": 16, "2 corintios": 13, "galatas": 6,
  "efesios": 6, "filipenses": 4, "colossenses": 4,
  "1 tessalonicenses": 5, "2 tessalonicenses": 3,
  "1 timoteo": 6, "2 timoteo": 4, "tito": 3, "filemom": 1,
  "hebreus": 13, "tiago": 5, "1 pedro": 5, "2 pedro": 3,
  "1 joao": 5, "2 joao": 1, "3 joao": 1, "judas": 1, "apocalipse": 22,
};

const APELIDOS: Record<string, string> = {
  "salmo": "salmos", "canticos": "cantares", "cantico dos canticos": "cantares",
  "apoc": "apocalipse", "filemon": "filemom",
};

export const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export function referenciaValida(ref: string): boolean {
  const m = ref.trim().match(/^([1-3]?\s?[A-Za-zÀ-ÿ]+(?:\s[A-Za-zÀ-ÿ]+)?)\s+(\d+)(?::(\d+)(?:-(\d+))?)?$/);
  if (!m) return false;

  let livro = semAcento(m[1]).replace(/\s+/g, " ");
  livro = APELIDOS[livro] ?? livro;
  const capitulos = LIVROS[livro];
  if (!capitulos) return false;

  const cap = Number(m[2]);
  if (cap < 1 || cap > capitulos) return false;

  if (m[3] && m[4] && Number(m[4]) < Number(m[3])) return false;
  return true;
}

/* usado no hash de conteúdo: "Salmo 23" e "salmos 23" são a mesma pauta */
export const normalizar = (s: string) => semAcento(s).replace(/[^a-z0-9]+/g, " ").trim();
