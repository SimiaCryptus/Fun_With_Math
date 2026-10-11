// Theme metadata manifest.
// Single source of truth for the theme picker. Every `id` (except 'system') MUST equal a theme name
// in the Point-CAD sketch of css/theme_design.html, i.e. a `[data-theme="<id>"]` block in the generated
// css/themes.css. `scheme` is the native colour scheme of the theme (drives `data-scheme`, color-scheme
// and the non-generated tokens in css/app-tokens.css).
export const THEMES = [
     {id: 'system', name: 'System', scheme: null},
     {id: 'dark', name: 'Dark', scheme: 'dark'},
     {id: 'light', name: 'Light', scheme: 'light'},
     {id: 'midnight', name: 'Midnight', scheme: 'dark'},
     {id: 'dim', name: 'Dim', scheme: 'dark'},
     {id: 'sepia', name: 'Sepia', scheme: 'light'},
      {id: 'highcontrast', name: 'High contrast', scheme: 'dark'},
];
export const THEME_STORAGE_KEY = 'slingshot-field.theme';