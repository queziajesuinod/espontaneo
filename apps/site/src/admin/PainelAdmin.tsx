import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppBar,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  Divider,
  Drawer,
  Grow,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Pagination,
  Paper,
  Stack,
  TextField,
  ThemeProvider,
  Toolbar,
  Typography,
} from "@mui/material";
import CssBaseline from "@mui/material/CssBaseline";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
import MenuIcon from "@mui/icons-material/Menu";
import InboxIcon from "@mui/icons-material/MoveToInboxOutlined";
import DescriptionIcon from "@mui/icons-material/DescriptionOutlined";
import PublicIcon from "@mui/icons-material/PublicOutlined";
import {
  criacaoUsuarioSchema,
  edicaoAssuntoSchema,
  MOTIVOS_REPROVACAO,
  PAPEIS,
  type EdicaoAssunto,
} from "@espontaneo/shared";
import {
  api,
  ErroApi,
  type AssuntoAdmin,
  type Categoria,
  type Metricas,
  type Sugestao,
  type TemaAdmin,
  type Usuario,
} from "./api.ts";
import { temaCuradoria } from "./tema-mui.ts";

const LARGURA = 244;
const POR_PAGINA = 12;

const ROTULO_ORIGEM: Record<string, string> = { PUBLICO: "público", IA: "IA", ADMIN: "curadoria" };
const ROTULO_SITUACAO: Record<string, string> = { RASCUNHO: "rascunho", PUBLICADO: "publicado", ARQUIVADO: "arquivado" };
const COR_SITUACAO: Record<string, "default" | "success" | "warning"> = {
  RASCUNHO: "warning",
  PUBLICADO: "success",
  ARQUIVADO: "default",
};
const ROTULO_MOTIVO: Record<(typeof MOTIVOS_REPROVACAO)[number], string> = {
  FORA_DO_ESCOPO: "fora do escopo",
  TEOLOGIA_QUESTIONAVEL: "teologia questionável",
  DUPLICADA: "duplicada",
  MAL_ESCRITA: "mal escrita",
  REFERENCIA_INCORRETA: "referência incorreta",
  SPAM: "spam",
};

const fmtData = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });
const quando = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : fmtData.format(d);
};

type Secao = "fila" | "assuntos" | "temas" | "categorias" | "equipe";
const SECOES: { id: Secao; nome: string; soAdmin?: boolean }[] = [
  { id: "fila", nome: "Fila" },
  { id: "assuntos", nome: "Assuntos" },
  { id: "temas", nome: "Temas" },
  { id: "categorias", nome: "Categorias" },
  { id: "equipe", nome: "Equipe", soAdmin: true },
];

/* ---------- notificações e confirmação ---------- */

type Toast = { id: number; texto: string; tom: "ok" | "erro" };
const CtxNotif = createContext<{
  notificar: (texto: string, tom?: "ok" | "erro") => void;
  confirmar: (texto: string) => Promise<boolean>;
}>({ notificar: () => {}, confirmar: async () => false });
const useNotif = () => useContext(CtxNotif);

export default function PainelAdmin() {
  const [auth, setAuth] = useState<"verificando" | "fora" | "dentro">("verificando");
  const [usuario, setUsuario] = useState<{ nome: string; papel: string } | null>(null);
  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [temas, setTemas] = useState<TemaAdmin[]>([]);
  const [secao, setSecao] = useState<Secao>("fila");
  const [menuAberto, setMenuAberto] = useState(false);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmacao, setConfirmacao] = useState<{ texto: string; resolver: (v: boolean) => void } | null>(null);
  const idRef = useRef(0);

  const notificar = useCallback((texto: string, tom: "ok" | "erro" = "ok") => {
    const id = ++idRef.current;
    setToasts((ts) => [...ts, { id, texto, tom }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 4200);
  }, []);
  const confirmar = useCallback(
    (texto: string) => new Promise<boolean>((resolver) => setConfirmacao({ texto, resolver })),
    [],
  );
  const responder = useCallback((v: boolean) => {
    setConfirmacao((c) => {
      c?.resolver(v);
      return null;
    });
  }, []);
  const notif = useMemo(() => ({ notificar, confirmar }), [notificar, confirmar]);

  const tratar = useCallback(
    (e: unknown) => {
      if (e instanceof ErroApi && e.status === 401) {
        setAuth("fora");
        setUsuario(null);
      }
      notificar(e instanceof Error ? e.message : "algo deu errado", "erro");
    },
    [notificar],
  );

  const recarregarMetricas = useCallback(() => api.metricas().then(setMetricas).catch(tratar), [tratar]);
  const recarregarCategorias = useCallback(() => api.categorias().then(setCategorias).catch(tratar), [tratar]);
  const recarregarTemas = useCallback(() => api.temasAdmin().then(setTemas).catch(tratar), [tratar]);

  useEffect(() => {
    api
      .metricas()
      .then((m) => {
        setMetricas(m);
        setAuth("dentro");
      })
      .catch((e) => {
        setAuth("fora");
        if (!(e instanceof ErroApi && e.status === 401)) notificar(e instanceof Error ? e.message : "servidor fora do ar", "erro");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (auth !== "dentro") return;
    recarregarCategorias();
    recarregarTemas();
    api.eu().then((u) => setUsuario({ nome: u.nome, papel: u.papel })).catch(() => {});
  }, [auth, recarregarCategorias, recarregarTemas]);

  function entrar(nome: string, papel: string) {
    setUsuario({ nome, papel });
    setAuth("dentro");
    recarregarMetricas();
  }
  async function sair() {
    try {
      await api.sair();
    } catch {
      /* volta pro login */
    }
    setUsuario(null);
    setAuth("fora");
  }

  const catAtivas = categorias.filter((c) => c.ativa);
  const temasAtivos = temas.filter((t) => t.situacao === "PUBLICADO");
  const ehAdmin = usuario?.papel === "ADMIN";

  const nav = (
    <Stack sx={{ height: "100%" }}>
      <Toolbar sx={{ flexDirection: "column", alignItems: "flex-start", py: 2 }}>
        <Typography variant="h6" sx={{ letterSpacing: "-0.015em" }}>
          espont<Box component="span" sx={{ color: "primary.main" }}>â</Box>neo
        </Typography>
        <Typography variant="caption" sx={{ opacity: 0.6, letterSpacing: "0.16em", textTransform: "uppercase" }}>
          curadoria
        </Typography>
      </Toolbar>
      <List sx={{ px: 1, flexGrow: 1 }}>
        {SECOES.filter((s) => !s.soAdmin || ehAdmin).map((s) => {
          const pend = s.id === "fila" ? metricas?.fila.reduce((a, f) => a + Number(f.total), 0) ?? 0 : 0;
          return (
            <ListItemButton
              key={s.id}
              selected={secao === s.id}
              onClick={() => {
                setSecao(s.id);
                setMenuAberto(false);
              }}
              sx={{ borderRadius: 2, mb: 0.5 }}
            >
              <ListItemText primary={s.nome} slotProps={{ primary: { sx: { fontWeight: 500 } } }} />
              {pend > 0 && <Chip size="small" color="primary" label={pend} />}
            </ListItemButton>
          );
        })}
      </List>
      <Divider />
      <Box sx={{ p: 2 }}>
        {usuario && (
          <Typography variant="body2" sx={{ opacity: 0.7, mb: 1 }}>
            {usuario.nome}
          </Typography>
        )}
        <Button size="small" startIcon={<LogoutIcon />} onClick={sair} color="inherit">
          Sair
        </Button>
      </Box>
    </Stack>
  );

  let corpo: React.ReactNode;
  if (auth === "verificando") {
    corpo = (
      <Box sx={{ minHeight: "100dvh", display: "grid", placeItems: "center" }}>
        <CircularProgress color="primary" />
      </Box>
    );
  } else if (auth === "fora") {
    corpo = <Login onEntrar={entrar} />;
  } else {
    corpo = (
      <Box sx={{ display: "flex", minHeight: "100dvh", bgcolor: "background.default" }}>
        <AppBar
          position="fixed"
          color="default"
          elevation={0}
          sx={{ display: { md: "none" }, borderBottom: 1, borderColor: "divider", bgcolor: "background.paper" }}
        >
          <Toolbar>
            <IconButton edge="start" onClick={() => setMenuAberto(true)} sx={{ mr: 1 }}>
              <MenuIcon />
            </IconButton>
            <Typography variant="h6">curadoria</Typography>
          </Toolbar>
        </AppBar>

        <Box component="nav" sx={{ width: { md: LARGURA }, flexShrink: { md: 0 } }}>
          <Drawer
            variant="temporary"
            open={menuAberto}
            onClose={() => setMenuAberto(false)}
            ModalProps={{ keepMounted: true }}
            sx={{ display: { xs: "block", md: "none" }, "& .MuiDrawer-paper": { width: LARGURA } }}
          >
            {nav}
          </Drawer>
          <Drawer
            variant="permanent"
            open
            sx={{
              display: { xs: "none", md: "block" },
              "& .MuiDrawer-paper": { width: LARGURA, borderColor: "divider" },
            }}
          >
            {nav}
          </Drawer>
        </Box>

        <Box
          component="main"
          sx={{ flexGrow: 1, p: { xs: 2, md: 4 }, width: { md: `calc(100% - ${LARGURA}px)` }, mt: { xs: 7, md: 0 } }}
        >
          <Resumo metricas={metricas} />
          {secao === "fila" && <SecaoFila categorias={catAtivas} temas={temasAtivos} onMudou={recarregarMetricas} />}
          {secao === "assuntos" && (
            <SecaoAssuntos categorias={catAtivas} temas={temasAtivos} onMudou={recarregarMetricas} />
          )}
          {secao === "temas" && (
            <SecaoTemas
              categorias={catAtivas}
              temas={temas}
              onMudou={() => {
                recarregarTemas();
                recarregarMetricas();
              }}
            />
          )}
          {secao === "categorias" && (
            <SecaoCategorias
              categorias={categorias}
              onMudou={() => {
                recarregarCategorias();
                recarregarTemas();
                recarregarMetricas();
              }}
            />
          )}
          {secao === "equipe" && ehAdmin && <SecaoEquipe />}
        </Box>
      </Box>
    );
  }

  return (
    <ThemeProvider theme={temaCuradoria}>
      <CssBaseline />
      <CtxNotif.Provider value={notif}>
        {corpo}

        <Box sx={{ position: "fixed", right: 16, bottom: 16, zIndex: (t) => t.zIndex.snackbar, display: "flex", flexDirection: "column", gap: 1, maxWidth: 360 }}>
          {toasts.map((t) => (
            <Alert
              key={t.id}
              severity={t.tom === "erro" ? "error" : "success"}
              variant="filled"
              onClose={() => setToasts((ts) => ts.filter((x) => x.id !== t.id))}
            >
              {t.texto}
            </Alert>
          ))}
        </Box>

        <Dialog open={!!confirmacao} onClose={() => responder(false)}>
          <DialogContent>
            <DialogContentText sx={{ color: "text.primary" }}>{confirmacao?.texto}</DialogContentText>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => responder(false)} color="inherit">
              Cancelar
            </Button>
            <Button onClick={() => responder(true)} color="error" variant="contained" autoFocus>
              Confirmar
            </Button>
          </DialogActions>
        </Dialog>
      </CtxNotif.Provider>
    </ThemeProvider>
  );
}

/* ---------- login ---------- */

function Login({ onEntrar }: { onEntrar: (nome: string, papel: string) => void }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function submeter(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const u = await api.entrar(email.trim(), senha);
      onEntrar(u.nome, u.papel);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "não deu para entrar");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Box sx={{ minHeight: "100dvh", display: "grid", placeItems: "center", bgcolor: "background.default", p: 2 }}>
      <Card sx={{ width: 360, maxWidth: "100%" }} elevation={6}>
        <CardContent component="form" onSubmit={submeter} sx={{ p: 4 }}>
          <Typography variant="h5">
            espont<Box component="span" sx={{ color: "primary.main" }}>â</Box>neo
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.6, mb: 3 }}>
            curadoria
          </Typography>
          <Stack spacing={2}>
            <TextField label="e-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required fullWidth />
            <TextField
              label="senha"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="current-password"
              required
              fullWidth
            />
            {erro && <Alert severity="error">{erro}</Alert>}
            <Button type="submit" variant="contained" disabled={enviando} size="large">
              {enviando ? "entrando…" : "Entrar"}
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}

/* ---------- resumo ---------- */

function Contador({ valor }: { valor: number }) {
  const [n, setN] = useState(0);
  const deRef = useRef(0);
  useEffect(() => {
    const de = deRef.current;
    const dur = 650;
    let raf = 0;
    let inicio = 0;
    const passo = (t: number) => {
      if (!inicio) inicio = t;
      const p = Math.min(1, (t - inicio) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(de + (valor - de) * eased));
      if (p < 1) raf = requestAnimationFrame(passo);
      else deRef.current = valor;
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [valor]);
  return <>{n}</>;
}

function Resumo({ metricas }: { metricas: Metricas | null }) {
  const pend = metricas?.fila.reduce((a, f) => a + Number(f.total), 0) ?? 0;
  const porSit = (s: string) => Number(metricas?.acervo.find((a) => a.situacao === s)?.total ?? 0);
  const itens = [
    { n: pend, r: "na fila", cor: "primary" as const, Icone: InboxIcon },
    { n: porSit("RASCUNHO"), r: "rascunhos", cor: "secondary" as const, Icone: DescriptionIcon },
    { n: porSit("PUBLICADO"), r: "publicados", cor: "success" as const, Icone: PublicIcon },
  ];
  return (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 3 }}>
      {itens.map((i, idx) => (
        <Grow in timeout={350 + idx * 160} key={i.r}>
          <Card elevation={2} sx={{ flex: 1, borderRadius: 3 }}>
            <CardContent sx={{ display: "flex", alignItems: "center", gap: 2, "&:last-child": { pb: 2 } }}>
              <Avatar sx={{ bgcolor: `${i.cor}.main`, width: 48, height: 48 }}>
                <i.Icone />
              </Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h4" sx={{ fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                  <Contador valor={i.n} />
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {i.r}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grow>
      ))}
    </Stack>
  );
}

function TituloPainel({ children, acao }: { children: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1, mb: 2 }}>
      <Typography variant="h5">{children}</Typography>
      {acao}
    </Stack>
  );
}

/* ---------- seletor tema em cascata ---------- */

function SeletorTema({
  categorias,
  temas,
  temaId,
  onTema,
  erro,
}: {
  categorias: Categoria[];
  temas: TemaAdmin[];
  temaId: number;
  onTema: (id: number) => void;
  erro?: string;
}) {
  const temaAtual = temas.find((t) => t.id === temaId);
  const [catId, setCatId] = useState<number>(temaAtual?.categoria_id ?? categorias[0]?.id ?? 0);
  const daCategoria = useMemo(() => temas.filter((t) => t.categoria_id === catId), [temas, catId]);

  useEffect(() => {
    if (!daCategoria.some((t) => t.id === temaId)) onTema(daCategoria[0]?.id ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catId, temas]);

  return (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
      <TextField select label="categoria" value={catId || ""} onChange={(e) => setCatId(Number(e.target.value))} fullWidth>
        {categorias.map((c) => (
          <MenuItem key={c.id} value={c.id}>
            {c.nome}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        label="tema"
        value={temaId || ""}
        onChange={(e) => onTema(Number(e.target.value))}
        error={!!erro}
        helperText={erro || (daCategoria.length === 0 ? "nenhum tema nessa categoria" : "")}
        fullWidth
      >
        {daCategoria.map((t) => (
          <MenuItem key={t.id} value={t.id}>
            {t.nome}
          </MenuItem>
        ))}
      </TextField>
    </Stack>
  );
}

function FormAssunto({
  categorias,
  temas,
  inicial,
  textoBotao,
  limparAoOk,
  onEnviar,
  onCancelar,
}: {
  categorias: Categoria[];
  temas: TemaAdmin[];
  inicial?: { temaId?: number; titulo?: string; provocacao?: string };
  textoBotao: string;
  limparAoOk?: boolean;
  onEnviar: (edicao: EdicaoAssunto) => Promise<boolean>;
  onCancelar?: () => void;
}) {
  const [temaId, setTemaId] = useState<number>(inicial?.temaId ?? temas[0]?.id ?? 0);
  const [titulo, setTitulo] = useState(inicial?.titulo ?? "");
  const [provocacao, setProvocacao] = useState(inicial?.provocacao ?? "");
  const [erros, setErros] = useState<Record<string, string[] | undefined>>({});
  const [enviando, setEnviando] = useState(false);

  async function submeter(e: React.FormEvent) {
    e.preventDefault();
    setErros({});
    const parseado = edicaoAssuntoSchema.safeParse({ temaId, titulo, provocacao });
    if (!parseado.success) {
      setErros(parseado.error.flatten().fieldErrors as Record<string, string[]>);
      return;
    }
    setEnviando(true);
    try {
      const ok = await onEnviar(parseado.data);
      if (ok && limparAoOk) {
        setTitulo("");
        setProvocacao("");
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Stack component="form" onSubmit={submeter} spacing={2}>
      <SeletorTema categorias={categorias} temas={temas} temaId={temaId} onTema={setTemaId} erro={erros.temaId?.[0]} />
      <TextField
        label="título"
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        error={!!erros.titulo}
        helperText={erros.titulo?.[0]}
        fullWidth
      />
      <TextField
        label="provocação"
        value={provocacao}
        onChange={(e) => setProvocacao(e.target.value)}
        error={!!erros.provocacao}
        helperText={erros.provocacao?.[0] ?? `${provocacao.length}/140`}
        multiline
        minRows={2}
        slotProps={{ htmlInput: { maxLength: 140 } }}
        fullWidth
      />
      <Stack direction="row" spacing={1}>
        <Button type="submit" variant="contained" disabled={enviando || !temaId}>
          {enviando ? "salvando…" : textoBotao}
        </Button>
        {onCancelar && (
          <Button type="button" color="inherit" onClick={onCancelar}>
            Cancelar
          </Button>
        )}
      </Stack>
    </Stack>
  );
}

/* linha genérica de lista */
function Linha({
  inativo,
  inicio,
  children,
  acoes,
}: {
  inativo?: boolean;
  inicio?: React.ReactNode;
  children: React.ReactNode;
  acoes: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        py: 1.5,
        px: 2.5,
        borderTop: 1,
        borderColor: "divider",
        "&:first-of-type": { borderTop: 0 },
        opacity: inativo ? 0.55 : 1,
      }}
    >
      {inicio}
      <Box sx={{ minWidth: 0, flexGrow: 1 }}>{children}</Box>
      <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
        {acoes}
      </Stack>
    </Box>
  );
}

/* ---------- fila ---------- */

function SecaoFila({ categorias, temas, onMudou }: { categorias: Categoria[]; temas: TemaAdmin[]; onMudou: () => void }) {
  const { notificar } = useNotif();
  const [situacao, setSituacao] = useState("PENDENTE");
  const [origem, setOrigem] = useState("");
  const [lista, setLista] = useState<Sugestao[] | null>(null);

  const carregar = useCallback(() => {
    setLista(null);
    api.sugestoes(situacao, origem).then(setLista).catch(() => setLista([]));
  }, [situacao, origem]);
  useEffect(() => carregar(), [carregar]);

  function remover(id: number) {
    setLista((l) => l?.filter((s) => s.id !== id) ?? null);
    onMudou();
  }

  return (
    <Box>
      <TituloPainel
        acao={
          <Stack direction="row" spacing={1}>
            <TextField select size="small" value={situacao} onChange={(e) => setSituacao(e.target.value)} sx={{ minWidth: 130 }}>
              <MenuItem value="PENDENTE">pendentes</MenuItem>
              <MenuItem value="APROVADA">aprovadas</MenuItem>
              <MenuItem value="REPROVADA">reprovadas</MenuItem>
            </TextField>
            <TextField select size="small" value={origem} onChange={(e) => setOrigem(e.target.value)} sx={{ minWidth: 130 }}>
              <MenuItem value="">todas origens</MenuItem>
              <MenuItem value="PUBLICO">público</MenuItem>
              <MenuItem value="IA">IA</MenuItem>
              <MenuItem value="ADMIN">curadoria</MenuItem>
            </TextField>
          </Stack>
        }
      >
        Fila de sugestões
      </TituloPainel>

      {lista === null ? (
        <CircularProgress />
      ) : lista.length === 0 ? (
        <Typography sx={{ opacity: 0.6, py: 4 }}>Nada por aqui. A fila está limpa.</Typography>
      ) : (
        <Stack spacing={2}>
          {lista.map((s) => (
            <CartaoSugestao
              key={s.id}
              s={s}
              categorias={categorias}
              temas={temas}
              editavel={situacao === "PENDENTE"}
              onFeito={remover}
              onAviso={notificar}
            />
          ))}
        </Stack>
      )}
    </Box>
  );
}

function CartaoSugestao({
  s,
  categorias,
  temas,
  editavel,
  onFeito,
  onAviso,
}: {
  s: Sugestao;
  categorias: Categoria[];
  temas: TemaAdmin[];
  editavel: boolean;
  onFeito: (id: number) => void;
  onAviso: (m: string, tom?: "ok" | "erro") => void;
}) {
  const [modo, setModo] = useState<null | "aprovar" | "reprovar">(null);
  const sim = s.similaridade == null ? null : Math.round(Number(s.similaridade) * 100);

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
          <Chip size="small" label={ROTULO_ORIGEM[s.origem] ?? s.origem} />
          <Typography variant="caption" sx={{ opacity: 0.6 }}>
            {quando(s.criado_em)}
            {s.autor_nome ? ` · ${s.autor_nome}` : ""}
          </Typography>
        </Stack>
        {s.referencia && (
          <Typography sx={{ fontFamily: '"Petrona", serif', fontWeight: 600, opacity: 0.65 }}>{s.referencia}</Typography>
        )}
        <Typography sx={{ fontFamily: '"Petrona", serif', fontSize: 22, lineHeight: 1.25 }}>{s.provocacao}</Typography>

        {sim !== null && s.similarProvocacao && (
          <Alert severity="warning" sx={{ mt: 1.5 }}>
            Parece com um assunto já no acervo ({sim}%): {s.similarProvocacao}
          </Alert>
        )}

        {editavel && modo === null && (
          <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
            <Button variant="contained" size="small" onClick={() => setModo("aprovar")}>
              Aprovar
            </Button>
            <Button color="error" size="small" onClick={() => setModo("reprovar")}>
              Reprovar
            </Button>
          </Stack>
        )}

        {modo === "aprovar" && (
          <Box sx={{ mt: 2 }}>
            <Divider sx={{ mb: 2 }} />
            <FormAssunto
              categorias={categorias}
              temas={temas}
              inicial={{ titulo: s.titulo ?? "", provocacao: s.provocacao }}
              textoBotao="Aprovar → rascunho"
              onCancelar={() => setModo(null)}
              onEnviar={async (edicao) => {
                try {
                  await api.aprovar(s.id, edicao);
                  onAviso("aprovada — assunto em rascunho");
                  onFeito(s.id);
                  return true;
                } catch (err) {
                  if (err instanceof ErroApi && err.status === 409) {
                    onAviso(err.message, "erro");
                    if (/moderada/i.test(err.message)) onFeito(s.id);
                  } else onAviso(err instanceof Error ? err.message : "erro", "erro");
                  return false;
                }
              }}
            />
          </Box>
        )}

        {modo === "reprovar" && (
          <Box sx={{ mt: 2 }}>
            <Divider sx={{ mb: 2 }} />
            <FormReprovar
              id={s.id}
              onCancelar={() => setModo(null)}
              onOk={() => {
                onAviso("reprovada");
                onFeito(s.id);
              }}
              onErro={(m) => onAviso(m, "erro")}
            />
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

function FormReprovar({ id, onCancelar, onOk, onErro }: { id: number; onCancelar: () => void; onOk: () => void; onErro: (m: string) => void }) {
  const [motivo, setMotivo] = useState<(typeof MOTIVOS_REPROVACAO)[number]>(MOTIVOS_REPROVACAO[0]);
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function submeter(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      await api.reprovar(id, motivo, nota.trim() || undefined);
      onOk();
    } catch (err) {
      if (err instanceof ErroApi && err.status === 409) onOk();
      else onErro(err instanceof Error ? err.message : "erro");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Stack component="form" onSubmit={submeter} spacing={2}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField select label="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value as typeof motivo)} sx={{ minWidth: 200 }}>
          {MOTIVOS_REPROVACAO.map((m) => (
            <MenuItem key={m} value={m}>
              {ROTULO_MOTIVO[m]}
            </MenuItem>
          ))}
        </TextField>
        <TextField label="nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} fullWidth slotProps={{ htmlInput: { maxLength: 500 } }} />
      </Stack>
      <Stack direction="row" spacing={1}>
        <Button type="submit" color="error" variant="contained" disabled={enviando}>
          {enviando ? "reprovando…" : "Confirmar reprovação"}
        </Button>
        <Button type="button" color="inherit" onClick={onCancelar}>
          Cancelar
        </Button>
      </Stack>
    </Stack>
  );
}

/* ---------- assuntos ---------- */

function SecaoAssuntos({ categorias, temas, onMudou }: { categorias: Categoria[]; temas: TemaAdmin[]; onMudou: () => void }) {
  const { notificar, confirmar } = useNotif();
  const [lista, setLista] = useState<AssuntoAdmin[] | null>(null);
  const [fCategoria, setFCategoria] = useState(0);
  const [fSituacao, setFSituacao] = useState("");
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<number | null>(null);
  const [pagina, setPagina] = useState(1);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [moverAberto, setMoverAberto] = useState(false);
  const [temaDestino, setTemaDestino] = useState<number>(temas[0]?.id ?? 0);
  const [emAcao, setEmAcao] = useState(false);

  const carregar = useCallback(() => {
    setLista(null);
    setPagina(1);
    setSel(new Set());
    api
      .assuntos({ categoriaId: fCategoria || undefined, situacao: fSituacao || undefined })
      .then(setLista)
      .catch(() => setLista([]));
  }, [fCategoria, fSituacao]);
  useEffect(() => carregar(), [carregar]);

  const totalPag = Math.ceil((lista?.length ?? 0) / POR_PAGINA) || 1;
  const fatia = (lista ?? []).slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const todosMarcados = !!lista?.length && lista.every((a) => sel.has(a.id));

  function alternarSel(id: number) {
    setSel((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function alternarTodos() {
    setSel(todosMarcados ? new Set() : new Set((lista ?? []).map((a) => a.id)));
  }

  async function publicarSel() {
    setEmAcao(true);
    try {
      const { publicados } = await api.publicarAssuntos([...sel]);
      notificar(`${publicados} ${publicados === 1 ? "assunto publicado" : "assuntos publicados"}`);
      carregar();
      onMudou();
    } catch (e) {
      notificar(e instanceof Error ? e.message : "erro", "erro");
    } finally {
      setEmAcao(false);
    }
  }
  async function moverSel() {
    if (!temaDestino) return;
    setEmAcao(true);
    try {
      const { movidos } = await api.moverTema([...sel], temaDestino);
      notificar(`${movidos} ${movidos === 1 ? "assunto movido" : "assuntos movidos"} de tema`);
      setMoverAberto(false);
      carregar();
      onMudou();
    } catch (e) {
      notificar(e instanceof Error ? e.message : "erro", "erro");
    } finally {
      setEmAcao(false);
    }
  }

  async function mudarSituacao(a: AssuntoAdmin, situacao: "PUBLICADO" | "ARQUIVADO" | "RASCUNHO") {
    try {
      await api.editarAssunto(a.id, { situacao });
      notificar(situacao === "PUBLICADO" ? `${a.codigo} publicado` : situacao === "ARQUIVADO" ? `${a.codigo} arquivado` : `${a.codigo} em rascunho`);
      carregar();
      onMudou();
    } catch (e) {
      notificar(e instanceof Error ? e.message : "erro", "erro");
    }
  }
  async function excluir(a: AssuntoAdmin) {
    if (!(await confirmar(`Excluir o assunto ${a.codigo}? Não dá para desfazer.`))) return;
    try {
      await api.deletarAssunto(a.id);
      notificar(`${a.codigo} excluído`);
      carregar();
      onMudou();
    } catch (e) {
      notificar(e instanceof Error ? e.message : "erro", "erro");
    }
  }

  return (
    <Box>
      <TituloPainel
        acao={
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
            <TextField select size="small" value={fCategoria} onChange={(e) => setFCategoria(Number(e.target.value))} sx={{ minWidth: 150 }}>
              <MenuItem value={0}>todas categorias</MenuItem>
              {categorias.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.nome}
                </MenuItem>
              ))}
            </TextField>
            <TextField select size="small" value={fSituacao} onChange={(e) => setFSituacao(e.target.value)} sx={{ minWidth: 140 }}>
              <MenuItem value="">todas situações</MenuItem>
              <MenuItem value="RASCUNHO">rascunho</MenuItem>
              <MenuItem value="PUBLICADO">publicado</MenuItem>
              <MenuItem value="ARQUIVADO">arquivado</MenuItem>
            </TextField>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCriando((v) => !v)}>
              {criando ? "Fechar" : "Novo"}
            </Button>
          </Stack>
        }
      >
        Assuntos
      </TituloPainel>

      {criando && (
        <Card variant="outlined" sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 1 }}>
              Novo assunto
            </Typography>
            <FormAssunto
              categorias={categorias}
              temas={temas}
              textoBotao="Criar → rascunho"
              limparAoOk
              onEnviar={async (edicao) => {
                try {
                  const r = await api.criarAssunto(edicao);
                  notificar(`assunto ${r.codigo} criado em rascunho`);
                  carregar();
                  onMudou();
                  return true;
                } catch (err) {
                  notificar(err instanceof Error ? err.message : "erro", "erro");
                  return false;
                }
              }}
            />
          </CardContent>
        </Card>
      )}

      {lista === null ? (
        <CircularProgress />
      ) : lista.length === 0 ? (
        <Typography sx={{ opacity: 0.6, py: 4 }}>Nenhum assunto por aqui.</Typography>
      ) : (
        <>
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: "center", flexWrap: "wrap", mb: 1, minHeight: 40 }}
          >
            <Checkbox
              checked={todosMarcados}
              indeterminate={sel.size > 0 && !todosMarcados}
              onChange={alternarTodos}
              size="small"
            />
            {sel.size === 0 ? (
              <Typography variant="body2" sx={{ opacity: 0.6 }}>
                selecionar todos ({lista.length})
              </Typography>
            ) : (
              <>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {sel.size} selecionado{sel.size > 1 ? "s" : ""}
                </Typography>
                <Button size="small" variant="contained" disabled={emAcao} onClick={publicarSel}>
                  Publicar
                </Button>
                <Button size="small" disabled={emAcao} onClick={() => setMoverAberto(true)}>
                  Mudar tema
                </Button>
                <Button size="small" color="inherit" onClick={() => setSel(new Set())}>
                  Limpar
                </Button>
              </>
            )}
          </Stack>
          <Paper variant="outlined">
          {fatia.map((a) =>
            editando === a.id ? (
              <Box key={a.id} sx={{ p: 2.5, borderTop: 1, borderColor: "divider", "&:first-of-type": { borderTop: 0 } }}>
                <FormAssunto
                  categorias={categorias}
                  temas={temas}
                  inicial={{ temaId: a.tema_id, titulo: a.titulo, provocacao: a.provocacao }}
                  textoBotao="Salvar"
                  onCancelar={() => setEditando(null)}
                  onEnviar={async (edicao) => {
                    try {
                      await api.editarAssunto(a.id, edicao);
                      notificar(`${a.codigo} atualizado`);
                      setEditando(null);
                      carregar();
                      return true;
                    } catch (err) {
                      notificar(err instanceof Error ? err.message : "erro", "erro");
                      return false;
                    }
                  }}
                />
              </Box>
            ) : (
              <Linha
                key={a.id}
                inicio={
                  <Checkbox size="small" checked={sel.has(a.id)} onChange={() => alternarSel(a.id)} sx={{ p: 0.5 }} />
                }
                acoes={
                  <>
                    {a.situacao === "RASCUNHO" && (
                      <Button size="small" variant="contained" onClick={() => mudarSituacao(a, "PUBLICADO")}>
                        Publicar
                      </Button>
                    )}
                    {a.situacao === "PUBLICADO" && (
                      <Button size="small" onClick={() => mudarSituacao(a, "RASCUNHO")}>
                        Despublicar
                      </Button>
                    )}
                    {a.situacao === "ARQUIVADO" ? (
                      <Button size="small" onClick={() => mudarSituacao(a, "RASCUNHO")}>
                        Reativar
                      </Button>
                    ) : (
                      <Button size="small" color="inherit" onClick={() => mudarSituacao(a, "ARQUIVADO")}>
                        Desativar
                      </Button>
                    )}
                    <IconButton size="small" onClick={() => setEditando(a.id)}>
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" color="error" onClick={() => excluir(a)}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </>
                }
              >
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: "primary.main" }}>
                    {a.codigo}
                  </Typography>
                  <Chip size="small" color={COR_SITUACAO[a.situacao]} label={ROTULO_SITUACAO[a.situacao]} variant="outlined" />
                  <Typography variant="caption" sx={{ opacity: 0.6 }}>
                    {a.categoria} · {a.tema}
                  </Typography>
                </Stack>
                <Typography sx={{ fontFamily: '"Petrona", serif', fontSize: 17 }}>{a.provocacao}</Typography>
              </Linha>
            ),
          )}
          </Paper>
        </>
      )}
      {totalPag > 1 && (
        <Stack sx={{ alignItems: "center", mt: 2 }}>
          <Pagination count={totalPag} page={pagina} onChange={(_, p) => setPagina(p)} color="primary" />
        </Stack>
      )}

      <Dialog open={moverAberto} onClose={() => setMoverAberto(false)} fullWidth maxWidth="sm">
        <DialogContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Mudar o tema de {sel.size} assunto{sel.size > 1 ? "s" : ""}
          </Typography>
          <SeletorTema categorias={categorias} temas={temas} temaId={temaDestino} onTema={setTemaDestino} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={() => setMoverAberto(false)}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={moverSel} disabled={emAcao || !temaDestino}>
            Mover
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/* ---------- temas ---------- */

function SecaoTemas({ categorias, temas, onMudou }: { categorias: Categoria[]; temas: TemaAdmin[]; onMudou: () => void }) {
  const { notificar, confirmar } = useNotif();
  const [categoriaId, setCategoriaId] = useState<number>(categorias[0]?.id ?? 0);
  const [nome, setNome] = useState("");
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<number | null>(null);
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    if (!categoriaId && categorias[0]) setCategoriaId(categorias[0].id);
  }, [categorias, categoriaId]);

  const totalPag = Math.ceil(temas.length / POR_PAGINA) || 1;
  const p = Math.min(pagina, totalPag);
  const fatia = temas.slice((p - 1) * POR_PAGINA, p * POR_PAGINA);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim() || !categoriaId) return;
    setCriando(true);
    try {
      await api.criarTema({ categoriaId, nome: nome.trim() });
      notificar(`tema "${nome.trim()}" criado`);
      setNome("");
      onMudou();
    } catch (err) {
      notificar(err instanceof Error ? err.message : "erro", "erro");
    } finally {
      setCriando(false);
    }
  }
  async function alternar(t: TemaAdmin) {
    const nova = t.situacao === "ARQUIVADO" ? "PUBLICADO" : "ARQUIVADO";
    try {
      await api.editarTema(t.id, { situacao: nova });
      notificar(nova === "ARQUIVADO" ? `"${t.nome}" desativado` : `"${t.nome}" reativado`);
      onMudou();
    } catch (e) {
      notificar(e instanceof Error ? e.message : "erro", "erro");
    }
  }
  async function excluir(t: TemaAdmin) {
    if (!(await confirmar(`Excluir o tema "${t.nome}"? Remove também os ${Number(t.assuntos)} assuntos dele. Não dá para desfazer.`))) return;
    try {
      const r = await api.deletarTema(t.id);
      notificar(`"${t.nome}" excluído — ${r.assuntos} assuntos removidos`);
      onMudou();
    } catch (e) {
      notificar(e instanceof Error ? e.message : "erro", "erro");
    }
  }

  return (
    <Box>
      <TituloPainel>Temas</TituloPainel>

      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent component="form" onSubmit={criar}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "center" } }}>
            <TextField select label="categoria" value={categoriaId || ""} onChange={(e) => setCategoriaId(Number(e.target.value))} sx={{ minWidth: 180 }}>
              {categorias.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.nome}
                </MenuItem>
              ))}
            </TextField>
            <TextField label="nome do novo tema" value={nome} onChange={(e) => setNome(e.target.value)} fullWidth slotProps={{ htmlInput: { maxLength: 120 } }} />
            <Button type="submit" variant="contained" disabled={criando || !nome.trim() || !categoriaId}>
              Criar tema
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Paper variant="outlined">
        {temas.length === 0 ? (
          <Typography sx={{ opacity: 0.6, p: 3 }}>Nenhum tema ainda.</Typography>
        ) : (
          fatia.map((t) =>
            editando === t.id ? (
              <TemaEdicao
                key={t.id}
                tema={t}
                categorias={categorias}
                onCancelar={() => setEditando(null)}
                onSalvo={() => {
                  setEditando(null);
                  onMudou();
                }}
                onAviso={notificar}
              />
            ) : (
              <Linha
                key={t.id}
                inativo={t.situacao === "ARQUIVADO"}
                acoes={
                  <>
                    <IconButton size="small" onClick={() => setEditando(t.id)}>
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                    <Button size="small" onClick={() => alternar(t)}>
                      {t.situacao === "ARQUIVADO" ? "Reativar" : "Desativar"}
                    </Button>
                    <IconButton size="small" color="error" onClick={() => excluir(t)}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </>
                }
              >
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                  <Typography sx={{ fontWeight: 600 }}>{t.nome}</Typography>
                  {t.situacao === "ARQUIVADO" && <Chip size="small" label="inativo" variant="outlined" />}
                  <Typography variant="caption" sx={{ opacity: 0.6 }}>
                    {t.categoria} · {Number(t.assuntos)} {Number(t.assuntos) === 1 ? "assunto" : "assuntos"}
                  </Typography>
                </Stack>
              </Linha>
            ),
          )
        )}
      </Paper>
      {totalPag > 1 && (
        <Stack sx={{ alignItems: "center", mt: 2 }}>
          <Pagination count={totalPag} page={p} onChange={(_, n) => setPagina(n)} color="primary" />
        </Stack>
      )}
    </Box>
  );
}

function TemaEdicao({
  tema,
  categorias,
  onCancelar,
  onSalvo,
  onAviso,
}: {
  tema: TemaAdmin;
  categorias: Categoria[];
  onCancelar: () => void;
  onSalvo: () => void;
  onAviso: (m: string, tom?: "ok" | "erro") => void;
}) {
  const [nome, setNome] = useState(tema.nome);
  const [categoriaId, setCategoriaId] = useState(tema.categoria_id);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await api.editarTema(tema.id, { nome: nome.trim(), categoriaId });
      onAviso("tema atualizado");
      onSalvo();
    } catch (err) {
      onAviso(err instanceof Error ? err.message : "erro", "erro");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Box component="form" onSubmit={salvar} sx={{ p: 2.5, borderTop: 1, borderColor: "divider", "&:first-of-type": { borderTop: 0 } }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "center" } }}>
        <TextField select label="categoria" value={categoriaId} onChange={(e) => setCategoriaId(Number(e.target.value))} sx={{ minWidth: 180 }}>
          {categorias.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.nome}
            </MenuItem>
          ))}
        </TextField>
        <TextField label="nome" value={nome} onChange={(e) => setNome(e.target.value)} fullWidth slotProps={{ htmlInput: { maxLength: 120 } }} />
        <Button type="submit" variant="contained" disabled={salvando || !nome.trim()}>
          Salvar
        </Button>
        <Button type="button" color="inherit" onClick={onCancelar}>
          Cancelar
        </Button>
      </Stack>
    </Box>
  );
}

/* ---------- categorias ---------- */

function SecaoCategorias({ categorias, onMudou }: { categorias: Categoria[]; onMudou: () => void }) {
  const { notificar, confirmar } = useNotif();
  const [nova, setNova] = useState("");
  const [ocupada, setOcupada] = useState<number | "nova" | null>(null);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (!nova.trim()) return;
    setOcupada("nova");
    try {
      await api.criarCategoria(nova.trim());
      notificar(`categoria "${nova.trim()}" criada`);
      setNova("");
      onMudou();
    } catch (err) {
      notificar(err instanceof Error ? err.message : "erro", "erro");
    } finally {
      setOcupada(null);
    }
  }
  async function alternar(c: Categoria) {
    setOcupada(c.id);
    try {
      await api.atualizarCategoria(c.id, { ativa: !c.ativa });
      notificar(c.ativa ? `"${c.nome}" desativada` : `"${c.nome}" reativada`);
      onMudou();
    } catch (err) {
      notificar(err instanceof Error ? err.message : "erro", "erro");
    } finally {
      setOcupada(null);
    }
  }
  async function apagar(c: Categoria) {
    if (!(await confirmar(`Apagar a categoria "${c.nome}"? Remove TODOS os temas e assuntos dela, para sempre. Não dá para desfazer.`))) return;
    setOcupada(c.id);
    try {
      const r = await api.deletarCategoria(c.id);
      notificar(`"${c.nome}" apagada — ${r.temas} temas e ${r.assuntos} assuntos removidos`);
      onMudou();
    } catch (err) {
      notificar(err instanceof Error ? err.message : "erro", "erro");
    } finally {
      setOcupada(null);
    }
  }

  return (
    <Box>
      <TituloPainel>Categorias</TituloPainel>

      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent component="form" onSubmit={criar}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
            <TextField label="nome da nova categoria" value={nova} onChange={(e) => setNova(e.target.value)} fullWidth slotProps={{ htmlInput: { maxLength: 80 } }} />
            <Button type="submit" variant="contained" disabled={ocupada === "nova" || !nova.trim()}>
              Criar
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Paper variant="outlined">
        {categorias.map((c) => (
          <Linha
            key={c.id}
            inativo={!c.ativa}
            acoes={
              <>
                <Button size="small" onClick={() => alternar(c)} disabled={ocupada === c.id}>
                  {c.ativa ? "Desativar" : "Reativar"}
                </Button>
                <IconButton size="small" color="error" onClick={() => apagar(c)} disabled={ocupada === c.id}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </>
            }
          >
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Typography sx={{ fontWeight: 600 }}>{c.nome}</Typography>
              {!c.ativa && <Chip size="small" label="inativa" variant="outlined" />}
            </Stack>
          </Linha>
        ))}
      </Paper>
    </Box>
  );
}

/* ---------- equipe ---------- */

function SecaoEquipe() {
  const { notificar } = useNotif();
  const [lista, setLista] = useState<Usuario[] | null>(null);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [papel, setPapel] = useState<(typeof PAPEIS)[number]>("CURADOR");
  const [erros, setErros] = useState<Record<string, string[] | undefined>>({});
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(() => {
    api.usuarios().then(setLista).catch(() => setLista([]));
  }, []);
  useEffect(() => carregar(), [carregar]);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErros({});
    const parseado = criacaoUsuarioSchema.safeParse({ nome, email, senha, papel });
    if (!parseado.success) {
      setErros(parseado.error.flatten().fieldErrors as Record<string, string[]>);
      return;
    }
    setEnviando(true);
    try {
      await api.criarUsuario(parseado.data);
      notificar(`${nome.trim()} entrou para a equipe`);
      setNome("");
      setEmail("");
      setSenha("");
      setPapel("CURADOR");
      carregar();
    } catch (err) {
      notificar(err instanceof Error ? err.message : "erro", "erro");
    } finally {
      setEnviando(false);
    }
  }
  async function alternar(u: Usuario) {
    try {
      await api.atualizarUsuario(u.id, !u.ativo);
      notificar(u.ativo ? `${u.nome} desativado` : `${u.nome} reativado`);
      carregar();
    } catch (e) {
      notificar(e instanceof Error ? e.message : "erro", "erro");
    }
  }

  return (
    <Box>
      <TituloPainel>Equipe</TituloPainel>

      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent component="form" onSubmit={criar}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Novo curador
          </Typography>
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField label="nome" value={nome} onChange={(e) => setNome(e.target.value)} error={!!erros.nome} helperText={erros.nome?.[0]} fullWidth />
              <TextField select label="papel" value={papel} onChange={(e) => setPapel(e.target.value as typeof papel)} sx={{ minWidth: 160 }}>
                <MenuItem value="CURADOR">curador</MenuItem>
                <MenuItem value="ADMIN">admin</MenuItem>
              </TextField>
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                label="e-mail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={!!erros.email}
                helperText={erros.email?.[0]}
                fullWidth
              />
              <TextField
                label="senha"
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                error={!!erros.senha}
                helperText={erros.senha?.[0] ?? "mín. 8"}
                autoComplete="new-password"
                fullWidth
              />
            </Stack>
            <Box>
              <Button type="submit" variant="contained" disabled={enviando}>
                {enviando ? "criando…" : "Criar curador"}
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      {lista === null ? (
        <CircularProgress />
      ) : (
        <Paper variant="outlined">
          {lista.map((u) => (
            <Linha
              key={u.id}
              inativo={!u.ativo}
              acoes={
                <Button size="small" onClick={() => alternar(u)}>
                  {u.ativo ? "Desativar" : "Reativar"}
                </Button>
              }
            >
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                <Typography sx={{ fontWeight: 600 }}>{u.nome}</Typography>
                <Chip size="small" color={u.papel === "ADMIN" ? "primary" : "default"} label={u.papel.toLowerCase()} variant="outlined" />
                {!u.ativo && <Chip size="small" label="inativo" variant="outlined" />}
                <Typography variant="caption" sx={{ opacity: 0.6 }}>
                  {u.email}
                </Typography>
              </Stack>
            </Linha>
          ))}
        </Paper>
      )}
    </Box>
  );
}
