@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: light;
  --bg: #fafafa;
  --text: #0f172a;
  --muted: #64748b;
  --glass: rgba(255, 255, 255, 0.76);
}

* {
  box-sizing: border-box;
}

html,
body {
  min-height: 100%;
  background:
    radial-gradient(circle at 18% 6%, rgba(255, 0, 153, 0.18), transparent 30%),
    radial-gradient(circle at 86% 10%, rgba(255, 201, 71, 0.2), transparent 28%),
    radial-gradient(circle at 40% 90%, rgba(131, 58, 180, 0.14), transparent 34%),
    var(--bg);
  color: var(--text);
}

body {
  margin: 0;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

button,
input,
textarea {
  font: inherit;
}

button {
  -webkit-tap-highlight-color: transparent;
}

.safe-bottom {
  padding-bottom: max(1rem, env(safe-area-inset-bottom));
}

.chat-scroll {
  scrollbar-width: thin;
}

.chat-scroll::-webkit-scrollbar {
  width: 8px;
}

.chat-scroll::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.35);
  border-radius: 999px;
}

.ig-gradient {
  background: linear-gradient(135deg, #833ab4 0%, #fd1d1d 48%, #fcb045 100%);
}

.ig-text-gradient {
  background: linear-gradient(135deg, #833ab4 0%, #fd1d1d 48%, #fcb045 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.glass-card {
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(255, 255, 255, 0.72);
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.14);
  backdrop-filter: blur(24px);
}
