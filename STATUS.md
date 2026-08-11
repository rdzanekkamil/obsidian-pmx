# Status — REST API

## Build & Deploy

```bash
pnpm build
cp main.js styles.css /path/to/vault/.obsidian/plugins/project-manager/
```

## Then restart Obsidian

## Co powinno działać

1. Settings → Project ManagerX → na dole sekcja "API"
   - Toggle: Enable REST API
   - Pole tekstowe: Port (domyślnie 17171)
   - Zmiany zapisują się automatycznie

2. Włącz API → restart Obsidian → API działa na `http://localhost:17171/`

## Jeśli sekcja API nie widoczna

Otwórz Dev Tools (`Ctrl+Shift+I`) → Console → szukaj `[PMX] display error`
