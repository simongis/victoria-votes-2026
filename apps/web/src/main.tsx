import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import './styles/hover.css'
import './styles/booths.css'
import { App } from './App'
import { isFramed, showFrameNotice } from './framed'
import { initTheme } from './theme/theme'

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

if (isFramed(window)) {
  // Not our page to show inside someone else's frame (clickjacking): a notice with a link to the site's own URL.
  showFrameNotice(root, `${location.origin}${import.meta.env.BASE_URL}`)
} else {
  // Before the first render, so the palette read from the tokens is the theme's (a future skin could load on demand).
  void initTheme().then(() => {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
}
