"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Papa, { ParseResult } from "papaparse";
import confetti from "canvas-confetti";
import * as XLSX from "xlsx";
import { Participant, Prize, seededRandom } from "./lib/draw";

// ===== MUI =====
import {
  AppBar,
  Toolbar,
  Typography,
  Container,
  Paper,
  TextField,
  Button,
  Stack,
  Card,
  CardContent,
  IconButton,
  Divider,
  Chip,
  List,
  ListItem,
  ListItemText,
  Snackbar,
  Alert,
  Box,
  CssBaseline,
  Dialog,
  DialogContent,
  useMediaQuery,
  Skeleton,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Collapse,
} from "@mui/material";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import Grid from "@mui/material/Grid2";

import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import DownloadIcon from "@mui/icons-material/Download";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import CloseIcon from "@mui/icons-material/Close";

// ===== Types =====
type HistoryItem = {
  prizeId: string;
  prizeTitle: string;
  winners: Participant[];
  time: number;
  seedUsed: number;
};

const uid = () => Math.random().toString(36).slice(2);

// -------- LocalStorage helpers --------
const LS_KEY = "lucky-draw-v1";
const LS_SECRET_KEY = "lucky-draw-secret-v2";

type PersistedState = {
  participantsText: string;
  prizes: Prize[];
  selectedPrizeId: string | null;
  history: HistoryItem[];
  seed: number;
};

type PersistedSecretState = {
  adminPin: string;
  presetsByPrize: Record<string, string>;
};

function loadState(): PersistedState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as PersistedState) : null;
  } catch {
    return null;
  }
}
function saveState(state: PersistedState) {
  if (typeof window !== "undefined") {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  }
}

function loadSecretState(): PersistedSecretState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_SECRET_KEY);
    return raw ? (JSON.parse(raw) as PersistedSecretState) : null;
  } catch {
    return null;
  }
}
function saveSecretState(state: PersistedSecretState) {
  if (typeof window !== "undefined") {
    localStorage.setItem(LS_SECRET_KEY, JSON.stringify(state));
  }
}

const isError = (e: unknown): e is { message: string } =>
  typeof e === "object" && e !== null && "message" in e;

// ===== Cooler Master / RGB dark theme =====
const appTheme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#7C3AED" },
    secondary: { main: "#22D3EE" },
    background: {
      default: "#0B0D10",
      paper: "#111318",
    },
    text: {
      primary: "#E5E7EB",
      secondary: "#9CA3AF",
    },
    divider: "rgba(255,255,255,0.08)",
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial',
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: "#111318",
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          background:
            "linear-gradient(90deg, #0B0D10 0%, #111827 50%, #0B0D10 100%)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        },
      },
    },
  },
});

// ===== Helpers =====
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
const bi = (vi: string, zh: string) => `${vi} ${zh}`;

export default function Page() {
  const isMobile = useMediaQuery("(max-width:600px)");

  const [participantsText, setParticipantsText] = useState<string>(
    "CM001 - Nguyễn Văn A\nCM002 - Trần Thị B\nCM003 - Lê Văn C\nCM004 - Phạm Thị D"
  );
  const [prizes, setPrizes] = useState<Prize[]>([
    { id: uid(), title: bi("Giải Nhất", "一等獎"), quantity: 1 },
    { id: uid(), title: bi("Giải Nhì", "二等獎"), quantity: 2 },
    { id: uid(), title: bi("Giải Ba", "三等獎"), quantity: 3 },
  ]);
  const [selectedPrizeId, setSelectedPrizeId] =
    useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [seed, setSeed] = useState<number>(() => Date.now());
  const [rollingName, setRollingName] = useState<string>("");

  const [countdown, setCountdown] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  // ===== SECRET / ADMIN =====
  const [adminMode, setAdminMode] = useState(false);
  const [adminPin, setAdminPin] = useState("2025");
  const [presetsByPrize, setPresetsByPrize] = useState<
    Record<string, string>
  >({});
  const [adminPrizeId, setAdminPrizeId] = useState<string | null>(null);

  // ===== PRO SESSION (live winners during draw) =====
  const [isDrawing, setIsDrawing] = useState(false);
  const [sessionWinners, setSessionWinners] = useState<Participant[]>([]);
  const [sessionPrizeTitle, setSessionPrizeTitle] = useState<string>("");

  useEffect(() => {
    setMounted(true);

    const s = loadState();
    if (!s) {
      setSelectedPrizeId((prev) => prev ?? (prizes[0]?.id ?? null));
      setAdminPrizeId((prev) => prev ?? (prizes[0]?.id ?? null));
    } else {
      setParticipantsText(s.participantsText ?? "");
      setPrizes(s.prizes ?? []);
      setSelectedPrizeId(s.selectedPrizeId ?? s.prizes?.[0]?.id ?? null);
      setAdminPrizeId(s.selectedPrizeId ?? s.prizes?.[0]?.id ?? null);
      setHistory(s.history ?? []);
      setSeed(s.seed ?? Date.now());
    }

    const ss = loadSecretState();
    if (ss) {
      setAdminPin(ss.adminPin || "2025");
      setPresetsByPrize(ss.presetsByPrize || {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== DERIVED =====
  const participants: Participant[] = useMemo(() => {
    return participantsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((name) => ({ id: uid() + name, name }));
  }, [participantsText]);

  const drawnPrizeIds = useMemo(
    () => new Set(history.map((h) => h.prizeId)),
    [history]
  );

  const alreadyWonIds = useMemo(() => {
    const s = new Set<string>();
    history.forEach((h) => h.winners.forEach((w) => s.add(w.id)));
    return s;
  }, [history]);

  const selectedPrize = prizes.find((p) => p.id === selectedPrizeId) ?? null;

  const lastResult = useMemo(() => history[0] ?? null, [history]);
  const lastWinners = lastResult?.winners ?? [];
  const lastPrizeTitle = lastResult?.prizeTitle ?? "";

  // ===== PERSIST =====
  useEffect(() => {
    saveState({ participantsText, prizes, selectedPrizeId, history, seed });
  }, [participantsText, prizes, selectedPrizeId, history, seed]);

  useEffect(() => {
    saveSecretState({ adminPin, presetsByPrize });
  }, [adminPin, presetsByPrize]);

  // ===== CSV (maNV + tenNV) =====
  const importParticipantsCSV = (file: File) => {
    Papa.parse<string[]>(file, {
      skipEmptyLines: "greedy",
      complete: (results: ParseResult<string[]>) => {
        const rows = results.data ?? [];

        const names = rows
          .map((row) => {
            const ma = (row?.[0] ?? "").trim();
            const ten = (row?.[1] ?? "").trim();

            const isHeader =
              ma.toLowerCase().includes("ma") ||
              ma.toLowerCase().includes("code") ||
              ten.toLowerCase().includes("ten") ||
              ten.toLowerCase().includes("name");

            if (isHeader) return "";
            if (ma && ten) return `${ma} - ${ten}`;
            if (ten) return ten;
            if (ma) return ma;
            return "";
          })
          .filter((x) => x.length > 0);

        setParticipantsText(names.join("\n"));
        setToast({
          open: true,
          msg: bi(
            `Đã nhập ${names.length} người chơi`,
            `已導入 ${names.length} 位參與者`
          ),
          sev: "success",
        });
      },
      error: (err: unknown) => {
        const msg = isError(err) ? err.message : String(err);
        setToast({
          open: true,
          msg: bi(`Không đọc được CSV: ${msg}`, `無法讀取CSV：${msg}`),
          sev: "error",
        });
      },
    });
  };

  // ===== Export Excel =====
  type ExportRow = {
    prize: string;
    winner: string;
    time: string;
    seedUsed: string;
  };

  const exportHistoryExcel = () => {
    const rows: ExportRow[] = history.flatMap((h) =>
      h.winners.map((w) => ({
        prize: h.prizeTitle,
        winner: w.name,
        time: new Date(h.time).toLocaleString(),
        seedUsed: String(h.seedUsed),
      }))
    );

    const data: ExportRow[] = rows.length
      ? rows
      : [{ prize: "", winner: "", time: "", seedUsed: "" }];

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "LuckyDraw");

    const arrayBuffer = XLSX.write(wb, {
      bookType: "xlsx",
      type: "array",
    });

    const blob = new Blob([arrayBuffer], {
      type:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lucky-draw-history.xlsx";
    a.click();
    URL.revokeObjectURL(url);

    setToast({
      open: true,
      msg: bi("Đã tải Excel kết quả", "已下載Excel結果"),
      sev: "success",
    });
  };

  // ===== Toast =====
  const [toast, setToast] = useState<{
    open: boolean;
    msg: string;
    sev: "success" | "info" | "warning" | "error";
  }>({ open: false, msg: "", sev: "info" });

  // ===== Presentation mode =====
  const [presentOpen, setPresentOpen] = useState(false);

  const uploadInputRef = useRef<HTMLInputElement>(null);

  const drumRef = useRef<HTMLAudioElement>(null);
  const fanfareRef = useRef<HTMLAudioElement>(null);
  const beepRef = useRef<HTMLAudioElement>(null);
  const rollingRef = useRef<HTMLAudioElement>(null);

  // ===== Fireworks helpers =====
  const bigFireworks = () => {
    try {
      confetti({ particleCount: 340, spread: 95, origin: { y: 0.6 } });
      confetti({ particleCount: 200, spread: 130, origin: { y: 0.2 } });
      confetti({ particleCount: 240, spread: 80, origin: { y: 0.8 } });
    } catch {}
  };

  // ===== Preset per prize logic =====
  const getPresetTokensForPrize = (prizeId: string | null) => {
    if (!prizeId) return [];
    const text = presetsByPrize[prizeId] || "";
    return text
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  };

  const matchPresetInPool = (pool: Participant[], tokens: string[]) => {
    const lowerPool = pool.map((p) => ({
      ...p,
      lower: p.name.toLowerCase(),
    }));

    const matched: Participant[] = [];
    for (const t of tokens) {
      const tl = t.toLowerCase();
      const found = lowerPool.find(
        (p) => p.lower === tl || p.lower.includes(tl)
      );
      if (found && !matched.some((m) => m.id === found.id)) {
        matched.push(found);
      }
    }
    return matched;
  };

  // ===== ADMIN TOGGLE VIA LOGO =====
  const handleLogoClick = () => {
    if (adminMode) {
      setAdminMode(false);
      setToast({
        open: true,
        msg: bi("Admin mode OFF", "管理模式已關閉"),
        sev: "info",
      });
      return;
    }
    const pin = prompt(
      bi("Nhập PIN để vào Admin mode:", "輸入PIN進入管理模式：")
    );
    if (pin === adminPin) {
      setAdminMode(true);
      setToast({
        open: true,
        msg: bi("Admin mode ON", "管理模式已開啟"),
        sev: "success",
      });
    } else {
      setToast({ open: true, msg: bi("Sai PIN", "PIN錯誤"), sev: "error" });
    }
  };

  const changePin = () => {
    const oldPin = prompt(bi("Nhập PIN cũ:", "輸入舊PIN："));
    if (oldPin !== adminPin) {
      setToast({
        open: true,
        msg: bi("PIN cũ không đúng", "舊PIN不正確"),
        sev: "error",
      });
      return;
    }
    const newPin = prompt(
      bi("Nhập PIN mới (ít nhất 4 ký tự):", "輸入新PIN（至少4位）："),
      ""
    );
    if (!newPin || newPin.length < 4) {
      setToast({
        open: true,
        msg: bi("PIN mới không hợp lệ", "新PIN無效"),
        sev: "warning",
      });
      return;
    }
    setAdminPin(newPin);
    setToast({
      open: true,
      msg: bi("Đã đổi PIN", "已更改PIN"),
      sev: "success",
    });
  };

  const setPresetForPrize = (prizeId: string, text: string) => {
    setPresetsByPrize((prev) => ({ ...prev, [prizeId]: text }));
  };

  const currentAdminPresetText =
    (adminPrizeId && presetsByPrize[adminPrizeId]) || "";

  const currentAdminPresetCount = adminPrizeId
    ? getPresetTokensForPrize(adminPrizeId).length
    : 0;

  // ===== ACTIONS =====
  const startRoll = async () => {
    if (!selectedPrize) return;
    if (drawnPrizeIds.has(selectedPrize.id)) {
      setToast({
        open: true,
        msg: bi("Giải này đã bốc xong!", "此獎項已抽完!"),
        sev: "warning",
      });
      return;
    }

    let tmpSeed = seed;
    const initialPool = participants.filter((p) => !alreadyWonIds.has(p.id));
    if (initialPool.length === 0) {
      setToast({
        open: true,
        msg: bi("Hết người chơi chưa trúng giải!", "沒有未中獎的參與者了!"),
        sev: "warning",
      });
      return;
    }

    setIsDrawing(true);
    setSessionWinners([]);
    setSessionPrizeTitle(selectedPrize.title);

    if (rollingRef.current) {
      try {
        rollingRef.current.currentTime = 0;
        rollingRef.current.loop = true;
        await rollingRef.current.play();
      } catch {}
    }

    const winners: Participant[] = [];
    const pool: Participant[] = [...initialPool];

    const presetTokens = getPresetTokensForPrize(selectedPrize.id);
    const presetInPool = matchPresetInPool(pool, presetTokens);
    const presetTake = presetInPool.slice(0, selectedPrize.quantity);

    for (let turn = 0; turn < selectedPrize.quantity; turn++) {
      if (pool.length === 0) break;

      if (drumRef.current) {
        try {
          drumRef.current.currentTime = 0;
          await drumRef.current.play();
        } catch {}
      }

      // Rolling ~2s
      const t0 = Date.now();
      while (Date.now() - t0 < 2000) {
        const r1 = seededRandom(tmpSeed);
        tmpSeed = r1.nextSeed;
        const r = pool[Math.floor(r1.value * pool.length)];
        setRollingName(r.name);
        await sleep(60);
      }

      let w: Participant | undefined;
      let idx = -1;

      if (turn < presetTake.length) {
        w = presetTake[turn];
        idx = pool.findIndex((p) => p.id === w!.id);
      } else {
        const r2 = seededRandom(tmpSeed);
        tmpSeed = r2.nextSeed;
        idx = Math.floor(r2.value * pool.length);
        w = pool[idx];
      }
      if (!w || idx < 0) continue;

      // Countdown 3-2-1
      for (let n = 3; n >= 1; n--) {
        setCountdown(n);

        const tickUntil = Date.now() + 700;
        while (Date.now() < tickUntil) {
          const rr = seededRandom(tmpSeed);
          tmpSeed = rr.nextSeed;
          const r = pool[Math.floor(rr.value * pool.length)];
          setRollingName(r.name);
          await sleep(60);
        }

        if (beepRef.current) {
          try {
            beepRef.current.currentTime = 0;
            await beepRef.current.play();
          } catch {}
        }
      }
      setCountdown(null);

      winners.push(w);
      setSessionWinners((prev) => [...prev, w]);
      setRollingName(w.name);

      if (drumRef.current) {
        try {
          drumRef.current.pause();
        } catch {}
      }

      try {
        confetti({
          particleCount: 240,
          spread: 75,
          origin: { y: 0.6 },
        });
      } catch {}
      if (fanfareRef.current) {
        try {
          fanfareRef.current.currentTime = 0;
          await fanfareRef.current.play();
        } catch {}
      }

      pool.splice(idx, 1);
      await sleep(900);
    }

    const seedUsed = tmpSeed;
    setSeed(tmpSeed);

    setHistory((h) => [
      {
        prizeId: selectedPrize.id,
        prizeTitle: selectedPrize.title,
        winners,
        time: Date.now(),
        seedUsed,
      },
      ...h,
    ]);

    bigFireworks();

    if (rollingRef.current) {
      try {
        rollingRef.current.pause();
        rollingRef.current.currentTime = 0;
      } catch {}
    }

    setIsDrawing(false);
    setRollingName("");

    setToast({
      open: true,
      msg: bi(
        `Đã bốc ${winners.length} người cho ${selectedPrize.title}`,
        `已抽出 ${winners.length} 位得獎者：${selectedPrize.title}`
      ),
      sev: "success",
    });
  };

  const resetAll = () => {
    if (
      !confirm(
        bi("Reset toàn bộ lịch sử trúng thưởng?", "確定重置所有中獎記錄？")
      )
    )
      return;
    setHistory([]);
    setRollingName("");
    setSeed(Date.now());
    setIsDrawing(false);
    setSessionWinners([]);
    setSessionPrizeTitle("");
    setToast({
      open: true,
      msg: bi("Đã reset lịch sử", "已重置記錄"),
      sev: "info",
    });
  };

  const undoLast = () => {
    setHistory((h) => (h.length ? h.slice(1) : h));
    setToast({
      open: true,
      msg: bi("Đã hoàn tác lượt bốc gần nhất", "已撤銷最近一次抽獎"),
      sev: "info",
    });
  };

  const addPrize = () => {
    const title = prompt(bi("Tên giải?", "獎項名稱？"));
    if (!title) return;
    const qStr = prompt(
      bi("Số lượng người trúng giải này?", "此獎項得獎人數？"),
      "1"
    );
    const quantity = Math.max(1, Number(qStr ?? 1));
    const p = { id: uid(), title, quantity };
    setPrizes((ps) => [...ps, p]);
    setSelectedPrizeId(p.id);
    setAdminPrizeId(p.id);
  };

  const updatePrize = (id: string, patch: Partial<Prize>) =>
    setPrizes((ps) =>
      ps.map((p) => (p.id === id ? { ...p, ...patch } : p))
    );

  const removePrize = (id: string) => {
    setPrizes((ps) => ps.filter((p) => p.id !== id));
    if (selectedPrizeId === id) setSelectedPrizeId(prizes[0]?.id ?? null);
    if (adminPrizeId === id) setAdminPrizeId(prizes[0]?.id ?? null);

    setPresetsByPrize((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  // ===== UI =====
  return (
    <ThemeProvider theme={appTheme}>
      <CssBaseline />

      {/* 🎨 Cooler Master RGB dark background wrapper */}
      <Box
        sx={{
          minHeight: "90dvh",
          backgroundImage: `
            radial-gradient(900px 500px at 110% -10%, rgba(124,58,237,.35), transparent 60%),
            radial-gradient(800px 600px at -10% 110%, rgba(34,211,238,.28), transparent 55%),
            radial-gradient(700px 500px at 50% 120%, rgba(236,72,153,.18), transparent 60%),
            linear-gradient(180deg, #050607 0%, #0B0D10 55%, #050607 100%)
          `,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundAttachment: "fixed",
        }}
      >
        {/* Top bar */}
        <AppBar position="sticky" elevation={0}>
          <Toolbar>
            <Stack
              direction="row"
              alignItems="center"
              spacing={1.25}
              sx={{ flexGrow: 1 }}
            >
              <Box
                component="img"
                src="/coolermaster-logo.png"
                alt="Cooler Master"
                onClick={handleLogoClick}
                sx={{
                  height: 30,
                  width: "auto",
                  cursor: "pointer",
                  userSelect: "none",
                  filter: "drop-shadow(0 2px 4px rgba(0,0,0,.8))",
                }}
                title={bi("Bấm để vào Admin", "點擊進入管理")}
              />
              <Chip
                label="COOLER MASTER LUCKY DRAW"
                size="small"
                sx={{
                  ml: 1,
                  bgcolor: "rgba(255,255,255,.08)",
                  color: "white",
                  fontWeight: 900,
                  border: "1px solid rgba(255,255,255,.12)",
                  letterSpacing: 0.3,
                }}
              />
              {adminMode && (
                <Chip
                  label="ADMIN 管理"
                  size="small"
                  color="secondary"
                  sx={{ ml: 1, fontWeight: 900 }}
                />
              )}
            </Stack>

            {mounted ? (
              <>
                <Chip
                  color="secondary"
                  label={bi(
                    `${participants.length} người chơi`,
                    `${participants.length} 位參與者`
                  )}
                  sx={{ mr: 1, fontWeight: 800 }}
                />
                <Chip
                  color="default"
                  label={bi(
                    `${history.length} lượt bốc`,
                    `${history.length} 次抽獎`
                  )}
                  variant="outlined"
                  sx={{ mr: 1, bgcolor: "rgba(255,255,255,.04)" }}
                />
              </>
            ) : (
              <>
                <Skeleton
                  variant="rounded"
                  width={120}
                  height={28}
                  sx={{ mr: 1, bgcolor: "rgba(255,255,255,.15)" }}
                />
                <Skeleton
                  variant="rounded"
                  width={120}
                  height={28}
                  sx={{ mr: 1, bgcolor: "rgba(255,255,255,.15)" }}
                />
              </>
            )}

            <Button
              color="inherit"
              startIcon={<FullscreenIcon />}
              onClick={() => setPresentOpen(true)}
              sx={{ fontWeight: 800 }}
            >
              {bi("Trình chiếu", "投影模式")}
            </Button>
          </Toolbar>
        </AppBar>

        <Container maxWidth="lg" sx={{ py: { xs: 2, md: 4 } }}>
          {!mounted ? (
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <Paper elevation={0} sx={{ p: { xs: 2, md: 2.5 } }}>
                  <Skeleton variant="text" width="60%" />
                  <Skeleton variant="rounded" height={240} />
                  <Skeleton
                    variant="rounded"
                    height={36}
                    sx={{ mt: 2, width: 140 }}
                  />
                </Paper>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <Paper elevation={0} sx={{ p: { xs: 2, md: 2.5 } }}>
                  <Skeleton variant="text" width="50%" />
                  <Skeleton variant="rounded" height={180} />
                  <Skeleton
                    variant="rounded"
                    height={40}
                    sx={{ mt: 2, width: 120 }}
                  />
                </Paper>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <Paper elevation={0} sx={{ p: { xs: 2, md: 2.5 } }}>
                  <Skeleton variant="text" width="40%" />
                  <Skeleton variant="rounded" height={110} sx={{ mt: 1 }} />
                  <Skeleton
                    variant="rounded"
                    height={40}
                    sx={{ mt: 2, width: 200 }}
                  />
                </Paper>
              </Grid>
            </Grid>
          ) : (
            <Grid container spacing={3}>
              {/* Participants */}
              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <Paper
                  elevation={0}
                  sx={{
                    p: { xs: 2, md: 2.5 },
                    bgcolor: "rgba(17,19,24,0.95)",
                    border: "1px solid rgba(255,255,255,.06)",
                    boxShadow: "0 12px 40px rgba(0,0,0,.55)",
                  }}
                >
                  <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    mb={1}
                  >
                    <Typography variant="subtitle1" fontWeight={900}>
                      {bi("Danh sách người chơi", "參與者名單")}
                    </Typography>
                  </Stack>

                  <TextField
                    label={bi(
                      `Mỗi dòng 1 người (${participants.length})`,
                      `每行1人 (${participants.length})`
                    )}
                    value={participantsText}
                    onChange={(e) => setParticipantsText(e.target.value)}
                    multiline
                    minRows={isMobile ? 8 : 12}
                    fullWidth
                  />

                  <Stack direction="row" spacing={1.5} mt={2}>
                    <input
                      ref={uploadInputRef}
                      type="file"
                      accept=".csv,text/csv"
                      hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) importParticipantsCSV(f);
                        if (uploadInputRef.current)
                          uploadInputRef.current.value = "";
                      }}
                    />
                    <Button
                      variant="outlined"
                      startIcon={<UploadFileIcon />}
                      onClick={() => uploadInputRef.current?.click()}
                      sx={{ fontWeight: 800 }}
                    >
                      {bi("Import CSV", "導入CSV")}
                    </Button>
                  </Stack>

                  {/* ===== ADMIN PANEL ===== */}
                  <Collapse in={adminMode}>
                    <Divider sx={{ my: 2 }} />

                    <Stack direction="row" spacing={1} alignItems="center">
                      <Button
                        size="small"
                        variant="contained"
                        color="secondary"
                        onClick={() => setAdminMode(false)}
                        sx={{ fontWeight: 900 }}
                      >
                        {bi("Tắt Admin", "關閉管理")}
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={changePin}
                      >
                        {bi("Đổi PIN", "更改PIN")}
                      </Button>
                      <Chip
                        size="small"
                        color="secondary"
                        label={bi(
                          `PIN hiện tại: ${adminPin}`,
                          `目前PIN：${adminPin}`
                        )}
                      />
                    </Stack>

                    <Divider sx={{ my: 1.5 }} />

                    <Typography variant="subtitle2" fontWeight={900} mb={1}>
                      {bi("Chọn giải để cấu hình preset", "選擇獎項設定預選名單")}
                    </Typography>

                    <FormControl fullWidth size="small">
                      <InputLabel id="admin-prize-label">
                        {bi("Giải", "獎項")}
                      </InputLabel>
                      <Select
                        labelId="admin-prize-label"
                        label={bi("Giải", "獎項")}
                        value={adminPrizeId ?? ""}
                        onChange={(e) =>
                          setAdminPrizeId(String(e.target.value))
                        }
                      >
                        {prizes.map((p) => (
                          <MenuItem key={p.id} value={p.id}>
                            {p.title} ({p.quantity})
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <Typography
                      variant="subtitle2"
                      fontWeight={900}
                      mt={1.5}
                      mb={1}
                    >
                      {bi("Danh sách ưu tiên trúng (GIẤU)", "優先中獎名單（隱藏）")}
                    </Typography>

                    <TextField
                      label={bi(
                        "Mỗi dòng 1 người (mã hoặc tên)",
                        "每行1人（工號或姓名）"
                      )}
                      value={currentAdminPresetText}
                      onChange={(e) => {
                        if (!adminPrizeId) return;
                        setPresetForPrize(adminPrizeId, e.target.value);
                      }}
                      multiline
                      minRows={5}
                      fullWidth
                      helperText={bi(
                        "Ví dụ: CM001 hoặc CM001 - Nguyễn Văn A hoặc Nguyễn Văn A",
                        "例如：CM001 或 CM001 - Nguyễn Văn A 或 Nguyễn Văn A"
                      )}
                    />

                    <Chip
                      sx={{ mt: 1 }}
                      size="small"
                      color="secondary"
                      label={bi(
                        `Đã cấu hình: ${currentAdminPresetCount} người cho giải này`,
                        `已設定：此獎項 ${currentAdminPresetCount} 位預選`
                      )}
                    />
                  </Collapse>
                </Paper>
              </Grid>

              {/* Prizes */}
              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <Paper
                  elevation={0}
                  sx={{
                    p: { xs: 2, md: 2.5 },
                    bgcolor: "rgba(17,19,24,0.95)",
                    border: "1px solid rgba(255,255,255,.06)",
                    boxShadow: "0 12px 40px rgba(0,0,0,.55)",
                  }}
                >
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    mb={1}
                  >
                    <Typography variant="subtitle1" fontWeight={900}>
                      {bi("Danh sách giải", "獎項列表")}
                    </Typography>
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<AddIcon />}
                      onClick={addPrize}
                      sx={{ fontWeight: 900 }}
                    >
                      {bi("Thêm giải", "新增獎項")}
                    </Button>
                  </Stack>

                  <Stack spacing={1.5}>
                    {prizes.map((p) => {
                      const isDrawn = drawnPrizeIds.has(p.id);
                      return (
                        <Card
                          key={p.id}
                          variant="outlined"
                          sx={{
                            borderColor:
                              selectedPrizeId === p.id
                                ? "primary.main"
                                : "divider",
                            opacity: isDrawn ? 0.6 : 1,
                            bgcolor: "rgba(255,255,255,.02)",
                          }}
                        >
                          <CardContent sx={{ "&:last-child": { pb: 2 } }}>
                            <Stack
                              direction={{ xs: "column", sm: "row" }}
                              spacing={1}
                            >
                              <TextField
                                label={bi("Tên giải", "獎項名稱")}
                                value={p.title}
                                onChange={(e) =>
                                  updatePrize(p.id, { title: e.target.value })
                                }
                                size="small"
                                fullWidth
                              />
                              <TextField
                                label={bi("Số lượng", "名額")}
                                type="number"
                                value={p.quantity}
                                onChange={(e) =>
                                  updatePrize(p.id, {
                                    quantity: Math.max(
                                      1,
                                      Number(e.target.value)
                                    ),
                                  })
                                }
                                size="small"
                                sx={{ width: { xs: "100%", sm: 120 } }}
                                inputProps={{ min: 1 }}
                              />
                              <IconButton
                                aria-label="delete prize"
                                color="error"
                                onClick={() => removePrize(p.id)}
                              >
                                <DeleteOutlineIcon />
                              </IconButton>
                            </Stack>

                            <Stack direction="row" spacing={1} mt={1.25}>
                              <Button
                                size="small"
                                variant="text"
                                onClick={() =>
                                  !isDrawn && setSelectedPrizeId(p.id)
                                }
                                disabled={isDrawn}
                              >
                                {isDrawn ? (
                                  <Stack
                                    direction="row"
                                    alignItems="center"
                                    spacing={0.5}
                                  >
                                    <CheckCircleIcon
                                      fontSize="small"
                                      color="success"
                                    />{" "}
                                    {bi("Đã bốc xong", "已抽完")}
                                  </Stack>
                                ) : (
                                  bi("Chọn để bốc", "選擇抽獎")
                                )}
                              </Button>
                            </Stack>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </Stack>
                </Paper>
              </Grid>

              {/* Draw + History */}
              <Grid size={{ xs: 12, md: 4 }}>
                <Paper
                  elevation={0}
                  sx={{
                    p: { xs: 2, md: 2.5 },
                    bgcolor: "rgba(17,19,24,0.95)",
                    border: "1px solid rgba(255,255,255,.06)",
                    boxShadow: "0 12px 40px rgba(0,0,0,.55)",
                  }}
                >
                  <Typography variant="subtitle1" fontWeight={900} mb={1}>
                    {bi("Bốc thăm", "抽獎")}
                  </Typography>

                  <Stack direction="row" alignItems="center" spacing={1} mb={1}>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      component="span"
                    >
                      {bi("Giải đang bốc:", "正在抽獎：")}
                    </Typography>
                    {selectedPrize ? (
                      <Chip
                        color="primary"
                        label={`${selectedPrize.title} (${selectedPrize.quantity})`}
                        size="small"
                      />
                    ) : (
                      <Chip label={bi("Chưa chọn", "未選擇")} size="small" />
                    )}
                  </Stack>

                  <Box
                    sx={{
                      height: { xs: 80, sm: 92, md: 110 },
                      border: "1px dashed",
                      borderColor: "divider",
                      bgcolor: "background.default",
                      borderRadius: 2,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      mb: { xs: 1, md: 1.5 },
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    {rollingName ? (
                      <Typography
                        sx={{
                          fontSize: { xs: 18, md: 22 },
                          fontWeight: 900,
                          color: "#E5E7EB",
                          lineHeight: 1.15,
                          textAlign: "center",
                          width: "100%",
                          px: 1,

                          // ✅ chống tràn + cho phép xuống dòng
                          whiteSpace: "normal",
                          overflowWrap: "anywhere",
                          wordBreak: "break-word",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                        }}
                      >
                        {rollingName}
                      </Typography>
                    ) : (
                      <Typography
                        variant={isMobile ? "subtitle1" : "h6"}
                        color="text.disabled"
                      >
                        {bi("Sẵn sàng!", "準備好了!")}
                      </Typography>
                    )}

                    {countdown !== null && (
                      <Box
                        sx={{
                          position: "absolute",
                          inset: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          bgcolor: "rgba(0,0,0,.45)",
                        }}
                      >
                        <Typography sx={{ fontSize: 42, fontWeight: 900 }}>
                          {countdown}
                        </Typography>
                      </Box>
                    )}
                  </Box>

                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                    <Button
                      fullWidth
                      variant="contained"
                      color="secondary"
                      startIcon={<PlayCircleOutlineIcon />}
                      size={isMobile ? "medium" : "large"}
                      onClick={startRoll}
                      disabled={
  !selectedPrize ? true : drawnPrizeIds.has(selectedPrize.id)
}
                      sx={{
                        background:
                          "linear-gradient(90deg, #7C3AED 0%, #22D3EE 50%, #EC4899 100%)",
                        color: "#0B0D10",
                        fontWeight: 900,
                        boxShadow: "0 10px 30px rgba(124,58,237,.35)",
                        "&:hover": {
                          background:
                            "linear-gradient(90deg, #6D28D9 0%, #06B6D4 50%, #DB2777 100%)",
                        },
                      }}
                    >
                      {bi("Bốc ngay", "立即抽獎")}
                    </Button>
                    <Button
                      variant="outlined"
                      startIcon={<RestartAltIcon />}
                      size={isMobile ? "small" : "medium"}
                      onClick={resetAll}
                    >
                      {bi("Reset", "重置")}
                    </Button>
                  </Stack>

                  <Divider sx={{ my: 2 }} />

                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    spacing={1}
                  >
                    <Typography variant="subtitle2" fontWeight={900}>
                      {bi("Lịch sử trúng thưởng", "中獎紀錄")}
                    </Typography>
                    <Stack direction="row" spacing={1}>
                      <Button
                        size="small"
                        variant="text"
                        startIcon={<DownloadIcon />}
                        onClick={exportHistoryExcel}
                      >
                        {bi("Export Excel", "匯出Excel")}
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        variant="outlined"
                        onClick={undoLast}
                      >
                        {bi("↩️ Undo", "↩️ 撤銷")}
                      </Button>
                    </Stack>
                  </Stack>

                  {history.length === 0 ? (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mt: 1 }}
                    >
                      {bi("Chưa có lượt bốc.", "尚無抽獎紀錄。")}
                    </Typography>
                  ) : (
                    <List
                      dense
                      sx={{
                        mt: 1,
                        maxHeight: { xs: 260, md: 360 },
                        overflow: "auto",
                      }}
                    >
                      {history.map((h, i) => (
                        <ListItem
                          key={h.time + i}
                          alignItems="flex-start"
                          sx={{
                            bgcolor: "rgba(255,255,255,.03)",
                            mb: 1,
                            borderRadius: 2,
                          }}
                        >
                          <ListItemText
                            disableTypography
                            primary={
                              <Box
                                display="flex"
                                justifyContent="space-between"
                                alignItems="center"
                              >
                                <Typography fontWeight={800} component="span">
                                  {h.prizeTitle}
                                </Typography>
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  component="span"
                                >
                                  {new Date(h.time).toLocaleString()}
                                </Typography>
                              </Box>
                            }
                            secondary={
                              <Box>
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  component="div"
                                >
                                  Seed: {h.seedUsed}
                                </Typography>
                                <Box component="ul" sx={{ pl: 3, mt: 0.5, mb: 0 }}>
                                  {h.winners.map((w) => (
                                    <li key={w.id}>
                                      <Typography variant="body2" component="span">
                                        {w.name}
                                      </Typography>
                                    </li>
                                  ))}
                                </Box>
                              </Box>
                            }
                          />
                        </ListItem>
                      ))}
                    </List>
                  )}
                </Paper>
              </Grid>
            </Grid>
          )}
        </Container>

        {/* ===== Presentation Mode ===== */}
        <Dialog
          open={presentOpen}
          onClose={() => setPresentOpen(false)}
          fullScreen
        >
          <AppBar
            sx={{
              position: "relative",
              bgcolor: "rgba(5,6,8,0.9)",
              backdropFilter: "blur(6px)",
              borderBottom: "1px solid rgba(255,255,255,.08)",
            }}
            elevation={0}
          >
            <Toolbar>
              <IconButton
                edge="start"
                color="inherit"
                onClick={() => setPresentOpen(false)}
                aria-label="close"
              >
                <CloseIcon />
              </IconButton>

              <Stack
                direction="row"
                alignItems="center"
                spacing={1.5}
                sx={{ ml: 1, flex: 1 }}
              >
                <Box
                  component="img"
                  src="/coolermaster-logo.png"
                  alt="Cooler Master"
                  sx={{
                    height: 36,
                    width: "auto",
                    filter: "drop-shadow(0 2px 6px rgba(0,0,0,.9))",
                  }}
                />
                <Typography
                  sx={{
                    fontWeight: 900,
                    letterSpacing: 1,
                    background:
                      "linear-gradient(90deg,#22D3EE,#7C3AED,#EC4899)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    display: { xs: "none", sm: "block" },
                  }}
                  variant="h6"
                >
                  COOLERMASTER
                </Typography>
              </Stack>

              <FormControl size="small" sx={{ mr: 2, minWidth: 220 }}>
                <InputLabel id="present-prize-label" sx={{ color: "white" }}>
                  {bi("Chọn giải", "選擇獎項")}
                </InputLabel>
                <Select
                  labelId="present-prize-label"
                  label={bi("Chọn giải", "選擇獎項")}
                  value={selectedPrizeId ?? ""}
                  onChange={(e) => setSelectedPrizeId(String(e.target.value))}
                  sx={{
                    color: "white",
                    ".MuiOutlinedInput-notchedOutline": {
                      borderColor: "rgba(255,255,255,.35)",
                    },
                    "&:hover .MuiOutlinedInput-notchedOutline": {
                      borderColor: "rgba(255,255,255,.6)",
                    },
                    ".MuiSvgIcon-root": { color: "white" },
                    background: "rgba(255,255,255,.06)",
                    fontWeight: 700,
                  }}
                >
                  {prizes.map((p) => (
                    <MenuItem
                      key={p.id}
                      value={p.id}
                      disabled={drawnPrizeIds.has(p.id)}
                    >
                      {p.title} {!!p.quantity && `(${p.quantity})`}
                      {drawnPrizeIds.has(p.id)
                        ? bi(" — đã bốc xong", " — 已抽完")
                        : ""}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Button
                color="inherit"
                startIcon={<PlayCircleOutlineIcon />}
                onClick={startRoll}
                disabled={!selectedPrize}
                sx={{ fontWeight: 900 }}
              >
                {bi("Bốc ngay", "立即抽獎")}
              </Button>
            </Toolbar>
          </AppBar>

          <DialogContent
            sx={{
              p: 0,
              background: `
                radial-gradient(1000px 600px at 100% -10%, rgba(124,58,237,.40), transparent 60%),
                radial-gradient(1000px 700px at 0% 110%, rgba(34,211,238,.30), transparent 55%),
                radial-gradient(800px 500px at 50% 120%, rgba(236,72,153,.20), transparent 60%),
                linear-gradient(180deg, #030405 0%, #0A0C10 60%, #030405 100%)
              `,
            }}
          >
            <Box
              sx={{
                minHeight: "90dvh",
                color: "white",
                display: "grid",
                gridTemplateRows: "auto 1fr auto",
                p: { xs: 2, md: 4 },
                gap: { xs: 2, md: 4 },
                position: "relative",
              }}
            >
              {/* Header chips */}
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
              >
                <Chip
                  label={bi(
                    `${participants.length} người tham gia`,
                    `${participants.length} 位參與者`
                  )}
                  sx={{
                    borderRadius: 2,
                    bgcolor: "rgba(255,255,255,.06)",
                    color: "white",
                    border: "1px solid rgba(255,255,255,.12)",
                    fontWeight: 900,
                  }}
                />
                {selectedPrize ? (
                  <Chip
                    label={bi(
                      `Đang bốc: ${selectedPrize.title} (${selectedPrize.quantity})`,
                      `正在抽：${selectedPrize.title} (${selectedPrize.quantity})`
                    )}
                    sx={{
                      borderRadius: 2,
                      bgcolor: "rgba(124,58,237,.15)",
                      color: "white",
                      border: "1px solid rgba(124,58,237,.35)",
                      fontWeight: 900,
                    }}
                  />
                ) : (
                  <Chip label={bi("Chưa chọn giải", "未選擇獎項")} />
                )}
              </Stack>

              {/* Center stage */}
              <Box
                sx={{
                  alignSelf: "center",
                  justifySelf: "center",
                  width: "min(1200px, 92vw)",
                  minHeight: { xs: 180, sm: 240, md: 340 },
                  borderRadius: 4,
                  border: "2px solid rgba(255,255,255,.12)",
                  boxShadow:
                    "0 0 0 2px rgba(124,58,237,.18), 0 0 40px rgba(34,211,238,.18)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  bgcolor: "rgba(255,255,255,.03)",
                  backdropFilter: "blur(2px)",
                  p: { xs: 2, md: 4 },
                  textAlign: "center",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {/* Countdown overlay */}
                {countdown !== null && (
                  <Box
                    sx={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      bgcolor: "rgba(0,0,0,.70)",
                      zIndex: 2,
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: "clamp(64px, 16vw, 180px)",
                        fontWeight: 900,
                        background:
                          "linear-gradient(90deg,#22D3EE,#7C3AED,#EC4899)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        textShadow: "0 6px 30px rgba(0,0,0,.6)",
                        letterSpacing: 2,
                      }}
                    >
                      {countdown}
                    </Typography>
                  </Box>
                )}

                {/* rollingName stage */}
                {rollingName ? (
                  <Box sx={{ width: "100%", px: { xs: 2, md: 4 } }}>
                    <Typography
                      sx={{
                        fontSize: "clamp(20px, 4.5vw, 64px)", // ✅ nhỏ hơn
                        fontWeight: 900,
                        color: "#E5E7EB",
                        letterSpacing: 0.5,
                        lineHeight: 1.15,
                        textAlign: "center",
                        width: "100%",

                        // ✅ không tràn khung
                        whiteSpace: "normal",
                        overflowWrap: "anywhere",
                        wordBreak: "break-word",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {rollingName}
                    </Typography>
                  </Box>
                ) : isDrawing && sessionWinners.length > 0 ? (
                  <Box sx={{ width: "100%" }}>
                    <Typography
  sx={{
    fontSize: "clamp(22px, 4vw, 54px)",
    fontWeight: 900,
    mb: { xs: 1.5, md: 2.5 },
    letterSpacing: 1.2,

    // ✅ gradient text
    background: "linear-gradient(90deg,#22D3EE,#7C3AED,#EC4899)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",

    // glow nhẹ cho nổi
    textShadow: "0 6px 26px rgba(124,58,237,.45)",
  }}
>
  {sessionPrizeTitle}
</Typography>

                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: {
                          xs: "1fr",
                          sm:
                            sessionWinners.length >= 2 ? "1fr 1fr" : "1fr",
                          md:
                            sessionWinners.length >= 3
                              ? "1fr 1fr 1fr"
                              : sessionWinners.length === 2
                              ? "1fr 1fr"
                              : "1fr",
                        },
                        gap: { xs: 1.25, md: 2 },
                        justifyItems: "center",
                        alignItems: "center",
                      }}
                    >
                      {sessionWinners.map((w) => (
                        <Box
                          key={w.id}
                          sx={{
                            px: { xs: 2, md: 3 },
                            py: { xs: 1.25, md: 1.75 },
                            bgcolor: "rgba(255,255,255,.04)",
                            border: "1px solid rgba(255,255,255,.15)",
                            borderRadius: 3,
                            width: "100%",
                            boxShadow:
                              "0 0 0 1px rgba(124,58,237,.20), 0 8px 30px rgba(0,0,0,.55)",
                          }}
                        >
                          <Typography
                            sx={{
                              fontSize: "clamp(20px, 3.2vw, 40px)",
                              fontWeight: 900,
                              color: "#FFFFFF",
                              lineHeight: 1.25,
                              wordBreak: "break-word",
                              textShadow:
                                "0 3px 14px rgba(124,58,237,.35), 0 0 18px rgba(34,211,238,.25)",
                            }}
                          >
                            {w.name}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                ) : lastWinners.length > 0 ? (
                  <Box sx={{ width: "100%" }}>
                   <Typography
  sx={{
    fontSize: "clamp(22px, 4vw, 54px)",
    fontWeight: 900,
    mb: { xs: 1.5, md: 2.5 },
    letterSpacing: 1.2,

    background: "linear-gradient(90deg,#22D3EE,#7C3AED,#EC4899)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",

    textShadow: "0 6px 26px rgba(124,58,237,.45)",
  }}
>
  {lastPrizeTitle}
</Typography>

                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: {
                          xs: "1fr",
                          sm: lastWinners.length >= 2 ? "1fr 1fr" : "1fr",
                          md:
                            lastWinners.length >= 3
                              ? "1fr 1fr 1fr"
                              : lastWinners.length === 2
                              ? "1fr 1fr"
                              : "1fr",
                        },
                        gap: { xs: 1.25, md: 2 },
                        justifyItems: "center",
                        alignItems: "center",
                      }}
                    >
                      {lastWinners.map((w) => (
                        <Box
                          key={w.id}
                          sx={{
                            px: { xs: 2, md: 3 },
                            py: { xs: 1.25, md: 1.75 },
                            bgcolor: "rgba(255,255,255,.04)",
                            border: "1px solid rgba(255,255,255,.15)",
                            borderRadius: 3,
                            width: "100%",
                            boxShadow:
                              "0 0 0 1px rgba(124,58,237,.20), 0 8px 30px rgba(0,0,0,.55)",
                          }}
                        >
                          <Typography
                            sx={{
                              fontSize: "clamp(20px, 3.2vw, 40px)",
                              fontWeight: 900,
                              color: "#FFFFFF",
                              lineHeight: 1.25,
                              wordBreak: "break-word",
                              textShadow:
                                "0 3px 14px rgba(124,58,237,.35), 0 0 18px rgba(34,211,238,.25)",
                            }}
                          >
                            {w.name}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                ) : (
                  <Typography
                    sx={{
                      fontSize: "clamp(26px, 5vw, 56px)",
                      fontWeight: 900,
                      color: "rgba(255,255,255,.9)",
                      textShadow: "0 2px 12px rgba(0,0,0,.7)",
                    }}
                  >
                    {bi("Sẵn sàng bốc thăm!", "準備開始抽獎!")}
                  </Typography>
                )}
              </Box>

              {/* Actions */}
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={2}
                justifyContent="center"
              >
                <Button
                  variant="contained"
                  size="large"
                  startIcon={<PlayCircleOutlineIcon />}
                  onClick={startRoll}
                  disabled={!selectedPrize}
                  sx={{
                    background:
                      "linear-gradient(90deg, #7C3AED 0%, #22D3EE 50%, #EC4899 100%)",
                    color: "#0B0D10",
                    fontWeight: 900,
                    px: 4,
                    boxShadow: "0 12px 40px rgba(124,58,237,.45)",
                    "&:hover": {
                      background:
                        "linear-gradient(90deg, #6D28D9 0%, #06B6D4 50%, #DB2777 100%)",
                    },
                  }}
                >
                  {bi("Bốc ngay", "立即抽獎")}
                </Button>
                <Button
                  variant="outlined"
                  color="inherit"
                  startIcon={<RestartAltIcon />}
                  onClick={resetAll}
                  sx={{ borderColor: "rgba(255,255,255,.25)" }}
                >
                  {bi("Reset lịch sử", "重置記錄")}
                </Button>
              </Stack>
            </Box>
          </DialogContent>
        </Dialog>

        {/* Toast */}
        <Snackbar
          open={toast.open}
          autoHideDuration={3000}
          onClose={() => setToast((t) => ({ ...t, open: false }))}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert
            onClose={() => setToast((t) => ({ ...t, open: false }))}
            severity={toast.sev}
            variant="filled"
            sx={{ width: "100%" }}
          >
            {toast.msg}
          </Alert>
        </Snackbar>

        {/* 🔊 Audio */}
        <audio ref={drumRef} src="/drumroll.mp3" preload="auto" />
        <audio ref={fanfareRef} src="/rolling.mp3" preload="auto" />
        <audio ref={beepRef} src="/beep.mp3" preload="auto" />
        <audio ref={rollingRef} src="/rolling.mp3" preload="auto" />
      </Box>
    </ThemeProvider>
  );
}
