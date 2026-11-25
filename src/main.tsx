import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

// StrictMode의 이중 마운트가 카메라를 두 번 여는 것을 피하기 위해 사용하지 않음
createRoot(document.getElementById('root')!).render(<App />)
