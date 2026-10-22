// Runs before the page draws, so a chosen sheet never flashes the other one.
try {
  const theme = localStorage.getItem('ao-guide-theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch {
  // Storage blocked: follow the device.
}
