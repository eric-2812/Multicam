import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { restoreFolder, restoreSettings, startSaving } from './engine/persist'
// Fonts ship with the app (no request to Google on start-up, and they work offline).
import './fonts.css'
import './styles.css'

// Last session's project and recording settings (devices are offered on the welcome screen).
restoreSettings()
void restoreFolder()
startSaving()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
