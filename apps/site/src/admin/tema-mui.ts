import { createTheme } from "@mui/material/styles";

/* tema MUI com a paleta do Espontâneo: areia, azul, terra, verde opaco */
export const temaCuradoria = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#754437", contrastText: "#F5F0E4" }, // terra queimada
    secondary: { main: "#6B6751", contrastText: "#F5F0E4" }, // verde opaco
    error: { main: "#8F3A2E" },
    success: { main: "#2F6D3A" },
    background: { default: "#D3C7AD", paper: "#F5F0E4" }, // areia / creme
    text: { primary: "#28374A", secondary: "rgba(40,55,74,0.6)" }, // azul
    divider: "rgba(107,103,81,0.28)",
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: '"Familjen Grotesk", system-ui, sans-serif',
    h5: { fontWeight: 600, letterSpacing: "-0.01em" },
    h6: { fontWeight: 600 },
    button: { textTransform: "none", fontWeight: 600 },
  },
  components: {
    MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { borderRadius: 999 } } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
    MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
    MuiTextField: { defaultProps: { size: "small" } },
    MuiSelect: { defaultProps: { size: "small" } },
  },
});
