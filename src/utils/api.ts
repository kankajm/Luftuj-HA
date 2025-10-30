const ingressPrefixRegex = /\/api\/hassio_ingress\/[A-Za-z0-9_-]+\//

const normalisePath = (path: string): string => {
  if (!path) {
    return ''
  }
  return path.startsWith('/') ? path.slice(1) : path
}

const computeBaseUrl = (): URL => {
  const ingressMatch = window.location.pathname.match(ingressPrefixRegex)
  const basePath = ingressMatch ? ingressMatch[0] : '/'
  const base = new URL(basePath, window.location.origin)
  if (!base.pathname.endsWith('/')) {
    base.pathname += '/'
  }
  return base
}

const apiBase = computeBaseUrl()

export const resolveApiUrl = (path: string): string => {
  const target = new URL(normalisePath(path), apiBase)
  return target.toString()
}

export const resolveWebSocketUrl = (path: string): string => {
  const target = new URL(normalisePath(path), apiBase)
  target.protocol = target.protocol === 'https:' ? 'wss:' : 'ws:'
  return target.toString()
}
