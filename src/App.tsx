import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import RefreshIcon from '@mui/icons-material/Refresh'
import DeviceHubIcon from '@mui/icons-material/DeviceHub'
import Alert from '@mui/material/Alert'
import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Container from '@mui/material/Container'
import CssBaseline from '@mui/material/CssBaseline'
import Grid from '@mui/material/Grid2'
import IconButton from '@mui/material/IconButton'
import Slider from '@mui/material/Slider'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import { ThemeProvider, createTheme } from '@mui/material/styles'

import './App.css'

interface HaState {
  entity_id: string
  state: string
  attributes: Record<string, unknown>
}

interface Valve {
  entityId: string
  name: string
  value: number
  min: number
  max: number
  step: number
  state: string
  attributes: Record<string, unknown>
}

const theme = createTheme({
  palette: {
    primary: {
      main: '#0077b6',
    },
    background: {
      default: '#f0f4f8',
    },
  },
})

const apiBase = (() => {
  const override = import.meta.env.VITE_API_BASE_URL as string | undefined
  const allowOverride = import.meta.env.DEV && override
  if (allowOverride) {
    try {
      const parsed = new URL(override as string, window.location.origin)
      if (!parsed.pathname.endsWith('/')) {
        parsed.pathname += '/'
      }
      return parsed
    } catch (error) {
      console.warn('Invalid VITE_API_BASE_URL, falling back to ingress location', error)
    }
  }

  const current = new URL(window.location.href)
  if (!current.pathname.endsWith('/')) {
    current.pathname += '/'
  }
  return current
})()

const resolveHttpUrl = (path: string) => new URL(path, apiBase).toString()

const websocketUrl = (path: string) => {
  const url = new URL(path, apiBase)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

const normaliseValue = (value: unknown, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const mapValve = (state: HaState): Valve => {
  const attrs = state.attributes ?? {}
  return {
    entityId: state.entity_id,
    name: (attrs.friendly_name as string) ?? state.entity_id,
    value: normaliseValue(state.state, 0),
    min: normaliseValue(attrs.min, 0),
    max: normaliseValue(attrs.max, 90),
    step: normaliseValue(attrs.step, 5),
    state: state.state,
    attributes: attrs,
  }
}

const valvesFromStates = (states: HaState[]): Record<string, Valve> =>
  states.reduce<Record<string, Valve>>((acc, state) => {
    const valve = mapValve(state)
    acc[valve.entityId] = valve
    return acc
  }, {})

function App() {
  const [valveMap, setValveMap] = useState<Record<string, Valve>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<number | null>(null)

  const valves = useMemo(() => {
    return Object.values(valveMap).sort((a, b) => a.name.localeCompare(b.name))
  }, [valveMap])

  const updateValve = useCallback((state: HaState) => {
    setValveMap((prev) => {
      const next = { ...prev }
      const valve = mapValve(state)
      next[valve.entityId] = valve
      return next
    })
  }, [])

  const replaceValves = useCallback((payload: HaState[]) => {
    setValveMap(valvesFromStates(payload))
  }, [])

  const fetchSnapshot = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch(resolveHttpUrl('api/valves'))
      if (!response.ok) {
        throw new Error(`Failed to load valves: ${response.statusText}`)
      }
      const data: HaState[] = await response.json()
      replaceValves(data)
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to load valves')
    } finally {
      setLoading(false)
    }
  }, [replaceValves])

  useEffect(() => {
    fetchSnapshot()
  }, [fetchSnapshot])

  const connectWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
    }

    const socket = new WebSocket(websocketUrl('ws/valves'))
    wsRef.current = socket

    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data as string) as {
          type: string
          payload: HaState | HaState[]
        }

        if (message.type === 'snapshot' && Array.isArray(message.payload)) {
          replaceValves(message.payload)
        } else if (message.type === 'update' && !Array.isArray(message.payload)) {
          updateValve(message.payload as HaState)
        }
      } catch (wsError) {
        setError(wsError instanceof Error ? wsError.message : 'WebSocket parse error')
      }
    })

    const scheduleReconnect = () => {
      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current)
      }
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connectWebSocket()
      }, 3000)
    }

    socket.addEventListener('close', scheduleReconnect)
    socket.addEventListener('error', scheduleReconnect)
  }, [replaceValves, updateValve])

  useEffect(() => {
    connectWebSocket()

    return () => {
      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current)
      }
      wsRef.current?.close()
    }
  }, [connectWebSocket])

  const handleSliderChange = useCallback((entityId: string) => {
    return (_event: Event, newValue: number | number[]) => {
      const numericValue = Array.isArray(newValue) ? newValue[0] : newValue
      setValveMap((prev) => {
        const current = prev[entityId]
        if (!current) {
          return prev
        }
        return {
          ...prev,
          [entityId]: {
            ...current,
            value: numericValue,
            state: String(numericValue),
          },
        }
      })
    }
  }, [])

  const handleSliderCommit = useCallback(async (entityId: string, value: number | number[]) => {
    const numericValue = Array.isArray(value) ? value[0] : value
    try {
      const response = await fetch(resolveHttpUrl(`api/valves/${encodeURIComponent(entityId)}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: numericValue }),
      })
      if (!response.ok) {
        throw new Error(`Failed to set value: ${response.statusText}`)
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to set valve value')
      fetchSnapshot()
    }
  }, [fetchSnapshot])

  const handleCloseError = useCallback(() => setError(null), [])

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppBar position="static" color="primary" enableColorOnDark>
        <Toolbar>
          <DeviceHubIcon sx={{ mr: 2 }} />
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Luftujha Valves
          </Typography>
          <IconButton color="inherit" onClick={fetchSnapshot} aria-label="Refresh valves">
            <RefreshIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Container sx={{ py: 4 }}>
        {loading ? (
          <Box display="flex" alignItems="center" justifyContent="center" minHeight="40vh">
            <CircularProgress />
          </Box>
        ) : valves.length === 0 ? (
          <Box display="flex" alignItems="center" justifyContent="center" minHeight="40vh">
            <Typography color="text.secondary">No valves found for prefix `number.luftator`.</Typography>
          </Box>
        ) : (
          <Grid container spacing={3}>
            {valves.map((valve) => (
              <Grid key={valve.entityId} size={{ xs: 12, md: 6, lg: 4 }}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Stack spacing={2}>
                      <Box display="flex" alignItems="center" justifyContent="space-between">
                        <Typography variant="h6">{valve.name}</Typography>
                        <Chip label={`${valve.value}`} color="primary" variant="outlined" />
                      </Box>
                      <Typography variant="body2" color="text.secondary">
                        {valve.entityId}
                      </Typography>
                      <Slider
                        value={valve.value}
                        min={valve.min}
                        max={valve.max}
                        step={valve.step}
                        marks
                        onChange={handleSliderChange(valve.entityId)}
                        onChangeCommitted={(_event, newValue) =>
                          handleSliderCommit(valve.entityId, newValue)
                        }
                        valueLabelDisplay="auto"
                      />
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Container>

      <Snackbar open={Boolean(error)} autoHideDuration={6000} onClose={handleCloseError}>
        <Alert severity="error" onClose={handleCloseError} sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>
    </ThemeProvider>
  )
}

export default App
