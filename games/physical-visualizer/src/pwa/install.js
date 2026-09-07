/** beforeinstallprompt UX: show the button only when the browser offers install. */
export function setupInstall(button) {
  if (!button) return;
  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    button.hidden = false;
  });
  button.addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice.catch(() => {});
    deferred = null;
    button.hidden = true;
  });
  window.addEventListener('appinstalled', () => { button.hidden = true; });
}